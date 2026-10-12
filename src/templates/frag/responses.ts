import { CodegenArraySchema, CodegenHeader, CodegenLogLevel, CodegenOperation, CodegenResponse, CodegenSchema, CodegenSchemaType } from '@openapi-generator-plus/types'
import { identifier, isBinary, isFile, stringLiteral } from '@openapi-generator-plus/template-utils'
import * as idx from '@openapi-generator-plus/indexed-type'
import { KotlinModelContext } from '../types'
import { isJsonMediaType, isTextBody, serializerExpression, supportDateAccessor } from '../helpers'
import { propertyDocumentation } from './documentation'

/**
 * One header that the result of a response carries: its property, and the expression that reads it
 * from an `HttpResponse` named `response`.
 */
export interface ResponseHeaderMember {
	header: CodegenHeader
	/** The name of the property. */
	name: string
	/** The Kotlin type of the property, which is nullable unless the API requires the header. */
	type: string
	/** An expression that reads the header, valid where an `HttpResponse` named `response` is in scope. */
	reader: string
}

/** A lambda that reads text as the type of `schema`, or `null` when a header can't carry that type. */
function headerParser(schema: CodegenSchema, ctx: KotlinModelContext): string | null {
	const nativeType = schema.nativeType.concreteType
	switch (schema.schemaType) {
		case CodegenSchemaType.STRING:
			if (nativeType === 'kotlin.String') {
				return '{ it }'
			} else if (nativeType === 'java.util.UUID') {
				return '{ java.util.UUID.fromString(it) }'
			} else if (nativeType === ctx.root.urlImplementation) {
				return `{ ${ctx.root.urlFromString}(it) }`
			}
			return null
		case CodegenSchemaType.INTEGER:
			if (nativeType === 'kotlin.Int') {
				return '{ it.toIntOrNull() }'
			} else if (nativeType === 'kotlin.Long') {
				return '{ it.toLongOrNull() }'
			}
			return null
		case CodegenSchemaType.NUMBER:
			if (nativeType === 'kotlin.Float') {
				return '{ it.toFloatOrNull() }'
			} else if (nativeType === 'kotlin.Double') {
				return '{ it.toDoubleOrNull() }'
			}
			return null
		case CodegenSchemaType.BOOLEAN:
			return '{ it.toBooleanStrictOrNull() }'
		case CodegenSchemaType.DATE:
		case CodegenSchemaType.TIME:
		case CodegenSchemaType.DATETIME: {
			/* A support date type holds the text as it is, so its parsed value is read to check the text */
			const parsed = supportDateAccessor(nativeType, ctx)
			if (parsed) {
				return `{ ${nativeType}(value = it).also { value -> value.${parsed} } }`
			}
			return `{ ${nativeType}(value = it) }`
		}
		case CodegenSchemaType.ENUM:
			return `{ ${nativeType}.valueOf(it) }`
		default:
			return null
	}
}

/** The member for `header`, or `null` when the client can't read its type from a header. */
function headerMember(header: CodegenHeader, operation: CodegenOperation, ctx: KotlinModelContext): ResponseHeaderMember | null {
	const isList = header.schema.schemaType === CodegenSchemaType.ARRAY
	const parser = headerParser(isList ? (header.schema as CodegenArraySchema).component.schema : header.schema, ctx)
	if (parser === null) {
		ctx.generatorContext.log(CodegenLogLevel.WARN, `Cannot read the "${header.serializedName}" response header of operation "${operation.name}" as ${header.schema.nativeType}, so the client leaves it out`)
		return null
	}

	const method = `${header.required ? 'requiredResponseHeader' : 'responseHeader'}${isList ? 'List' : ''}`
	const type = header.schema.nativeType.concreteType
	/* An array with unique items is a Set, but the header is read as a List */
	const toSet = isList && type.startsWith('kotlin.collections.Set<') ? `${header.required ? '' : '?'}.toSet()` : ''
	return {
		header,
		name: identifier(ctx.generatorContext.generator(), header.name),
		type: `${type}${header.required ? '' : '?'}`,
		reader: `response.${method}(${stringLiteral(ctx.generatorContext, header.serializedName)}) ${parser}${toSet}`,
	}
}

/** Whether `response` has content that the client decodes into the `value` of its result class. */
function hasBody(response: CodegenResponse): boolean {
	return !!(response.defaultContent && response.defaultContent.nativeType)
}

/**
 * The members for the headers that `response` declares and that the client can read.
 *
 * Each member's name is unique within the result class. A name that the body's `value`, the `status`, or an
 * earlier header, already takes gets a `Header` suffix, and a number after that if it needs one.
 */
export function responseHeaderMembers(response: CodegenResponse, operation: CodegenOperation, ctx: KotlinModelContext): ResponseHeaderMember[] {
	const usedNames = new Set<string>([...(hasBody(response) ? ['value'] : []), ...(carriesStatus(response) ? ['status'] : [])])
	return (response.headers ? idx.allValues(response.headers) : [])
		.map(header => headerMember(header, operation, ctx))
		.filter((member): member is ResponseHeaderMember => member !== null)
		.map(member => {
			let name = member.name
			for (let suffix = 1; usedNames.has(name); suffix++) {
				name = `${member.name}Header${suffix > 1 ? suffix : ''}`
			}
			usedNames.add(name)
			return { ...member, name }
		})
}

/**
 * The class of status codes that `response` declares, such as 4 for \`4XX\`, or `null` when it declares one code.
 * Core reads a range code by its first digit, and a status code is never less than 100.
 */
export function responseRange(response: CodegenResponse): number | null {
	return typeof response.code === 'number' && response.code < 10 ? response.code : null
}

/** Whether the result class for `response` carries the status code, as the response stands for more than one code. */
function carriesStatus(response: CodegenResponse): boolean {
	return response.isCatchAll || responseRange(response) !== null
}

/** The name of the result class for `response`, within the operation's response status class. */
export function responseLabel(response: CodegenResponse): string {
	if (response.isCatchAll) {
		return 'Default'
	}
	const range = responseRange(response)
	return range !== null ? `\`${range}XX\`` : `\`${response.code}\``
}

/**
 * The member of an operation's response status class for `response`: a class that carries the
 * decoded body, when the response has content, the status code, when the response stands for more
 * than one, and each header that the API declares on it.
 */
export function responseClass(response: CodegenResponse, members: ResponseHeaderMember[], resultClassName: string): string {
	const label = responseLabel(response)
	const body = hasBody(response) ? `${response.defaultContent!.nativeType}` : null

	let out = ''
	const documentation = propertyDocumentation(response)
	if (typeof documentation === 'string') {
		out += `${documentation}\n`
	}
	const status = carriesStatus(response)
	if (!body && !status && !members.length) {
		out += `data object ${label}: ${resultClassName}()`
		return out
	}

	const parameters = [
		...(body ? [`val value: ${body}`] : []),
		...(status ? ['/** The status code of the response. */ val status: kotlin.Int'] : []),
		...members.map(member => {
			const documentation = propertyDocumentation(member.header)
			return `${typeof documentation === 'string' ? `${documentation} ` : ''}val ${member.name}: ${member.type}${member.header.required ? '' : ' = null'}`
		}),
	]
	if (parameters.length === 1) {
		out += `data class ${label}(${parameters[0]}): ${resultClassName}()`
	} else {
		out += `data class ${label}(\n${parameters.map(parameter => `    ${parameter},`).join('\n')}\n): ${resultClassName}()`
	}
	return out
}

/**
 * The statements that read `response`, an `HttpResponse` with the response's status, into the
 * operation's result, ending with an expression of `Result`.
 *
 * The headers are read after the body is decoded, so that a header the client can't read isn't
 * reported as a body it can't decode.
 */
export function responseResult(response: CodegenResponse, members: ResponseHeaderMember[], resultClassName: string, ctx: KotlinModelContext): string {
	const label = responseLabel(response)
	const content = hasBody(response) ? response.defaultContent : null

	const lines: string[] = []
	const args: string[] = []
	if (content) {
		lines.push(`response.checkContentType(${stringLiteral(ctx.generatorContext, content.mediaType.mediaType)})`)
		const nativeType = String(content.nativeType)
		/* A body that isn't JSON is binary or text when its schema says so, and otherwise the client reads it as JSON */
		const json = isJsonMediaType(content.mediaType.mediaType)
		const serializer = serializerExpression(content.nativeType!)
		let decode: string
		if (!json && nativeType === 'kotlin.ByteArray') {
			decode = 'response.decodeBinaryBody()'
		} else if (!json && !!content.schema && (isBinary(content.schema) || isFile(content.schema))) {
			decode = `response.decodeBinaryBodyAs<${nativeType}>()`
		} else if (!json && !!content.schema && isTextBody(content.schema)) {
			decode = nativeType === 'kotlin.String' ? 'response.decodeTextBody()' : `response.decodeTextBody(configuration.json, ${serializer})`
		} else {
			decode = `response.decodeJsonBody(configuration.json, ${serializer})`
		}
		lines.push(`val localVarBody: ${nativeType} = ${decode}`)
		args.push('localVarBody')
	}
	if (carriesStatus(response)) {
		args.push('status = response.status.value')
	}
	for (const member of members) {
		args.push(`${member.name} = ${member.reader}`)
	}

	if (!args.length) {
		lines.push(`Result.success(${resultClassName}.${label})`)
	} else if (args.length === 1) {
		lines.push(`Result.success(${resultClassName}.${label}(${args[0]}))`)
	} else {
		lines.push(`Result.success(${resultClassName}.${label}(\n${args.map(arg => `    ${arg},`).join('\n')}\n))`)
	}
	return lines.join('\n')
}

/**
 * The value of the `Accept` header for an operation: the media types that the client reads from its
 * responses, or `null` when no response has content.
 */
export function acceptHeader(operation: CodegenOperation): string | null {
	const mediaTypes = new Set<string>()
	for (const response of operation.responses ? idx.allValues(operation.responses) : []) {
		if (hasBody(response)) {
			mediaTypes.add(response.defaultContent!.mediaType.mediaType)
		}
	}
	return mediaTypes.size > 0 ? [...mediaTypes].join(', ') : null
}
