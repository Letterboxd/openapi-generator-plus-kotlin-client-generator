import { CodegenContent, CodegenContentPropertyEncoding, CodegenLogLevel, CodegenObjectSchema, CodegenRequestBody, CodegenSchemaUsage } from '@openapi-generator-plus/types'
import { allProperties, each, identifier, isArray, isContentFormUrlEncoded, isBinary, isContentMultipart, isFile, stringLiteral, ts } from '@openapi-generator-plus/template-utils'
import * as idx from '@openapi-generator-plus/indexed-type'
import { KotlinModelContext } from '../types'
import { isJsonMediaType, isScalar, serializerExpression } from '../helpers'
import { dynamicMembers, requestParameter, schemaToString } from './requestParameter'

/** An expression for the `ContentType` of a media type. */
function contentTypeExpression(mediaType: string, ctx: KotlinModelContext): string {
	return `io.ktor.http.ContentType.parse(${stringLiteral(ctx.generatorContext, mediaType)})`
}

/**
 * The statements that set a form-url-encoded body from the request body's properties, or from its members for
 * a map or a free-form object.
 */
function formUrlEncodedBody(content: CodegenContent, value: string, ctx: KotlinModelContext): string {
	const members = dynamicMembers(content.schema!, value, ctx)
	if (members) {
		return ts`
val localVarForm = mutableListOf<Pair<String, String>>()
${members.entries}.forEach { (localVarKey, localVarElement) -> localVarForm.add(localVarKey to ${members.text('localVarElement', false)}) }
setBody(io.ktor.http.content.TextContent(localVarForm.formUrlEncode(), ${contentTypeExpression(content.mediaType.mediaType, ctx)}))`
	}
	return ts`
val localVarForm = mutableListOf<Pair<String, String>>()
${each(allProperties(content.schema as CodegenObjectSchema), property => requestParameter(property, {
	dest: 'localVarForm',
	value: `${value}.${property.name}`,
	encoding: content.encoding ? idx.get(content.encoding.properties, property.serializedName) : undefined,
}, ctx), '\n')}
setBody(io.ktor.http.content.TextContent(localVarForm.formUrlEncode(), ${contentTypeExpression(content.mediaType.mediaType, ctx)}))`
}

interface MultipartPropertyOptions {
	/** The expression containing the property value. */
	value: string
	/** The schema usage for the value. */
	schemaUsage: CodegenSchemaUsage
	/** Set once the optionality of the value has been unwrapped. */
	handledRequired?: boolean
	/** Set once the nullability of the value has been unwrapped. */
	handledNullable?: boolean
	/** How deeply the value is nested in unwrapping statements, so that each local variable has its own name. */
	depth: number
}

/**
 * The content type that a multipart part declares. An encoding may give a list of media types, or a
 * wildcard, so the part declares the first type, or `application/octet-stream` for a wildcard.
 */
function partContentType(encoding: CodegenContentPropertyEncoding): string {
	const first = encoding.contentType.split(',')[0].trim()
	return first.includes('*') ? 'application/octet-stream' : first
}

/**
 * The headers of a multipart part: its content type, the headers that the encoding declares for it, which
 * the part object `part` holds when there is one, and for a file, the filename that a server needs to see the part as a
 * file upload. The filename is the name of the part.
 */
function partHeaders(encoding: CodegenContentPropertyEncoding, part: string | null, filename: string | null, ctx: KotlinModelContext): string {
	const statements = [`append(io.ktor.http.HttpHeaders.ContentType, ${stringLiteral(ctx.generatorContext, partContentType(encoding))})`]
	if (encoding.headerProperties && part !== null) {
		for (const [headerName, property] of idx.iterable(encoding.headerProperties)) {
			const value = `${part}.${identifier(ctx.generatorContext.generator(), property.name)}`
			const append = (expression: string) => `append(${stringLiteral(ctx.generatorContext, headerName)}, ${expression}.toString())`
			statements.push(property.required ? append(value) : `${value}?.let { ${append('it')} }`)
		}
	}
	if (filename !== null) {
		statements.push(`append(io.ktor.http.HttpHeaders.ContentDisposition, ${stringLiteral(ctx.generatorContext, `filename="${filename.replace(/["\\]/g, '\\$&')}"`)})`)
	}
	return `io.ktor.http.Headers.build { ${statements.join('; ')} }`
}

/** The statements that add one property of a multipart request body to the body parts, in a `formData { }` block. */
function multipartProperty(encoding: CodegenContentPropertyEncoding, options: MultipartPropertyOptions, ctx: KotlinModelContext): string {
	const { schemaUsage, depth } = options

	if (!schemaUsage.required && !options.handledRequired) {
		const name = `localVarValue${depth}`
		return ts`
${options.value}?.let { ${name} ->
    ${multipartProperty(encoding, { ...options, value: name, handledRequired: true, depth: depth + 1 }, ctx)}
}`
	}

	/* The value is either the property itself, or a value property inside a container object. */
	const valueProperty = encoding.valueProperty
	const valueSchema = valueProperty ? valueProperty.schema : schemaUsage
	const valueNativeType = valueProperty ? valueProperty.schema.nativeType : schemaUsage.schema.nativeType

	const name = stringLiteral(ctx.generatorContext, encoding.property.serializedName)
	const contentType = partContentType(encoding)
	const binary = isFile(valueSchema) || contentType === 'application/octet-stream'
	const json = isJsonMediaType(contentType)

	if (schemaUsage.nullable && !options.handledNullable) {
		/* A binary part has no null form, so a null one is left out. JSON has a null, and text has an empty string. */
		const nullPart = json ? '"null"' : '""'
		const nullableName = `localVarNullable${depth}`
		return ts`
when (val ${nullableName} = ${options.value}) {
    is ${ctx.root.supportPackage}.Nullable.Null -> ${binary ? '{}' : `append(${name}, ${nullPart}, ${partHeaders(encoding, null, null, ctx)})`}
    is ${ctx.root.supportPackage}.Nullable.Some -> {
        ${multipartProperty(encoding, { ...options, value: `${nullableName}.value`, handledNullable: true, depth: depth + 1 }, ctx)}
    }
}`
	}

	const value = valueProperty ? `${options.value}.${identifier(ctx.generatorContext.generator(), valueProperty.name)}` : options.value
	const headers = partHeaders(encoding, valueProperty ? options.value : null, binary ? encoding.property.serializedName : null, ctx)

	if (binary) {
		if (String(valueNativeType) === 'kotlin.ByteArray') {
			return `append(${name}, ${value}, ${headers})`
		}
		ctx.generatorContext.log(CodegenLogLevel.WARN, `Cannot send the multipart part "${encoding.property.serializedName}" as ${valueNativeType}, because the client sends a file part only as kotlin.ByteArray, so it sends the part as text`)
	}
	if (json) {
		return `append(${name}, configuration.json.encodeToString(${serializerExpression(valueNativeType)}, ${value}), ${headers})`
	}
	return `append(${name}, ${schemaToString(valueProperty ?? schemaUsage, value)}, ${headers})`
}

/**
 * The statements that add the parts of a multipart body, in a `formData { }` block: one for each of the request
 * body's properties, or one text part for each of its members, for a map or a free-form object.
 */
function multipartParts(content: CodegenContent, value: string, ctx: KotlinModelContext): string {
	const members = dynamicMembers(content.schema!, value, ctx)
	if (members) {
		return `${members.entries}.forEach { (localVarKey, localVarElement) -> append(localVarKey, ${members.text('localVarElement', false)}) }`
	}
	const encodings = content.encoding ? idx.allValues(content.encoding.properties) : []
	return each(encodings, encoding => {
		const property = encoding.property
		const propertyValue = `${value}.${property.name}`
		if (!isArray(property)) {
			return multipartProperty(encoding, { value: propertyValue, schemaUsage: property, depth: 0 }, ctx)
		}

		const component = property.schema.component
		if (!component) {
			throw new Error(`Multipart array property has no component schema: ${property.name}`)
		}
		const element = multipartProperty(encoding, { value: 'localVarElement', schemaUsage: component, depth: 1 }, ctx)
		if (property.nullable) {
			return ts`
(${propertyValue} as? ${ctx.root.supportPackage}.Nullable.Some)?.value?.forEach { localVarElement ->
    ${element}
}`
		}
		return ts`
${propertyValue}${property.required ? '' : '?'}.forEach { localVarElement ->
    ${element}
}`
	}, '\n') as string
}

/**
 * The statements that set a multipart body. A body of a multipart type other than `multipart/form-data`, such
 * as `multipart/mixed`, declares its own type, with the boundary between its parts.
 */
function multipartBody(content: CodegenContent, value: string, ctx: KotlinModelContext): string {
	const formData = ts`
io.ktor.client.request.forms.formData {
    ${multipartParts(content, value, ctx)}
}`
	if (content.mediaType.mimeType.toLowerCase() === 'multipart/form-data') {
		return `setBody(io.ktor.client.request.forms.MultiPartFormDataContent(${formData}))`
	}
	return ts`
val localVarBoundary = "kotlin-client-" + java.util.UUID.randomUUID()
setBody(io.ktor.client.request.forms.MultiPartFormDataContent(
    ${formData},
    localVarBoundary,
    io.ktor.http.ContentType.parse(${stringLiteral(ctx.generatorContext, content.mediaType.mimeType)}).withParameter("boundary", localVarBoundary),
))`
}

/**
 * The statements that set the HTTP body for a request body, according to its media type, in the
 * request builder. `value` is the expression holding the non-null request body.
 */
export function requestBody(request: CodegenRequestBody, value: string, ctx: KotlinModelContext): string {
	const content = request.defaultContent
	const contentType = contentTypeExpression(content.mediaType.mediaType, ctx)

	if (isContentFormUrlEncoded(content)) {
		return formUrlEncodedBody(content, value, ctx)
	}
	if (isContentMultipart(content)) {
		return multipartBody(content, value, ctx)
	}
	if (isJsonMediaType(content.mediaType.mediaType)) {
		return `setBody(io.ktor.http.content.TextContent(configuration.json.encodeToString(${serializerExpression(content.nativeType!)}, ${value}), ${contentType}))`
	}
	if (String(content.nativeType) === 'kotlin.ByteArray') {
		return `setBody(io.ktor.http.content.ByteArrayContent(${value}, ${contentType}))`
	}
	if (!!content.schema && isScalar(content.schema)) {
		return `setBody(io.ktor.http.content.TextContent(${value}.toString(), ${contentType}))`
	}
	if (!!content.schema && (isBinary(content.schema) || isFile(content.schema))) {
		/* A binaryRepresentation other than ByteArray, such as an InputStream, which Ktor sends as it is */
		return ts`
contentType(${contentType})
setBody(${value})`
	}
	ctx.generatorContext.log(CodegenLogLevel.WARN, `Cannot encode a request body as ${content.mediaType.mediaType}, so the client sends it as JSON with that content type`)
	return `setBody(io.ktor.http.content.TextContent(configuration.json.encodeToString(${serializerExpression(content.nativeType!)}, ${value}), ${contentType}))`
}
