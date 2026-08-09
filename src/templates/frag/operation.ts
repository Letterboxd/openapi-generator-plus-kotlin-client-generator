import { CodegenOperation, CodegenOperationGroup, CodegenSchemaType, CodegenSecurityRequirementScheme } from '@openapi-generator-plus/types'
import * as idx from '@openapi-generator-plus/indexed-type'
import { className, identifier, indent, stringLiteral, upperCase } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { parameterValues, stripLeadingSlash } from '../helpers'
import { operationDocumentation } from './documentation'
import { parametersStruct } from './parametersStruct'

/** The scopes of a security requirement scheme as an inline Kotlin expression. */
function scopesExpression(scheme: CodegenSecurityRequirementScheme, ctx: KotlinModelContext): string {
	if (scheme.scopes && scheme.scopes.length) {
		return `listOf(${scheme.scopes.map(scope => stringLiteral(ctx.generatorContext, scope.name)).join(', ')})`
	}
	return 'null'
}

/** The `url { }` block that applies the operation's query parameters to the request. */
function requestParameter(operation: CodegenOperation): string {
	let result = '// Set request parameters\nurl {\n'
	for (const p of parameterValues(operation.queryParams)) {
		if (p.schema.schemaType === CodegenSchemaType.ARRAY) {
			result += `    ${p.name}${p.required ? '' : '?'}.forEach { parameters.append("${p.serializedName}", "$it") }\n`
		} else if (p.required) {
			result += `    parameters.append("${p.serializedName}", "$${p.name}")\n`
		} else {
			result += `    ${p.name}?.let { parameters.append("${p.serializedName}", "$it") }\n`
		}
	}
	result += '}'
	return result
}

/** The statements that apply the operation's request body to the request. */
function requestBody(operation: CodegenOperation): string {
	const body = operation.requestBody!
	return `// Set request body\ncontentType(ContentType.parse("${body.defaultContent.mediaType.mimeType}"))\nsetBody(requestBody)`
}

/**
 * The statements that authorize the request for the operation's security
 * requirements, trying each requirement in turn until one succeeds.
 */
function requestAuthentication(operation: CodegenOperation, securityScheme: string, apiException: string, ctx: KotlinModelContext): string {
	const securityRequirements = operation.securityRequirements!
	let result = '// Set request authentication\n'
	result += 'var didAuthenticate = false\n'
	result += 'var lastException: Throwable? = null\n'
	for (const requirement of securityRequirements.requirements) {
		result += '\n'
		result += `// Authentication with ${requirement.schemes.map(s => s.scheme.name).join(', ')}\n`
		result += 'if (!didAuthenticate) {\n'
		result += '    val requestBuilderToBeAuthed =\n'
		result += '        io.ktor.client.request.HttpRequestBuilder().takeFrom(this)\n'
		result += '\n'
		result += '    run {\n'
		result += '        configuration.securityClient?.let { securityClient ->\n'
		requirement.schemes.forEach((scheme, schemeIndex) => {
			const scopes = scopesExpression(scheme, ctx)
			const schemeName = `${securityScheme}.${upperCase(scheme.scheme.name)}`
			result += `            // ${scheme.scheme.name}\n`
			result += '            securityClient.authorize(\n'
			result += '                requestBuilderToBeAuthed,\n'
			result += `                ${schemeName},\n`
			result += `                ${scopes}\n`
			result += '            ).onFailure { firstAttemptException ->\n'
			result += `                if (firstAttemptException is ${apiException}.NotAuthenticated) {\n`
			result += '                    securityClient.reauthenticate(\n'
			result += '                        requestBuilderToBeAuthed.requestData(),\n'
			result += `                        ${schemeName},\n`
			result += `                        ${scopes}\n`
			result += '                    ).onFailure { secondAttemptException ->\n'
			result += '                        lastException = secondAttemptException\n'
			result += '                        return@run\n'
			result += '                    }\n'
			result += '                    securityClient.authorize(\n'
			result += '                        requestBuilderToBeAuthed,\n'
			result += `                        ${schemeName},\n`
			result += `                        ${scopes}\n`
			result += '                    ).onFailure { secondAttemptException ->\n'
			result += '                        lastException = secondAttemptException\n'
			result += '                        return@run\n'
			result += '                    }\n'
			result += '                } else {\n'
			result += '                    lastException = firstAttemptException\n'
			result += '                    return@run\n'
			result += '                }\n'
			result += '            }\n'
			if (schemeIndex < requirement.schemes.length - 1) {
				result += '\n'
			}
		})
		result += '        }\n'
		result += '\n'
		result += '        didAuthenticate = true\n'
		result += '        takeFrom(requestBuilderToBeAuthed)\n'
		result += '    }\n'
		result += '}\n'
	}
	result += '\n'
	if (!securityRequirements.optional) {
		result += 'if (!didAuthenticate) {\n'
		result += '    lastException?.let { return@withContext Result.failure(it) }\n'
		result += '}\n'
	}
	return result.replace(/\n$/, '')
}

/**
 * An operation rendered as its response-status sealed class and suspend
 * function(s): the query-parameters overload when the operation has multiple
 * parameters, and the full form that performs the request, applies security,
 * and maps the response status to a result.
 */
export function operation(op: CodegenOperation, group: CodegenOperationGroup, ctx: KotlinModelContext): string {
	const generator = ctx.generatorContext.generator()
	const root = ctx.root

	const parameters = parameterValues(op.parameters)
	const hasBody = !!(op.requestBody && op.requestBody.nativeType)

	const paramsSignature = parameters.map(p => `${p.name}: ${p.nativeType}${p.required ? '' : ' = null'}`)
	const callParams = parameters.map(p => `${p.name} = ${p.name}`)
	const requestCallParams = parameters.map(p => `${p.name} = queryParams.${p.name}`)
	if (hasBody) {
		paramsSignature.push(`requestBody: ${op.requestBody!.nativeType}${op.requestBody!.required ? '' : ' = null'}`)
		callParams.push('requestBody = requestBody')
		requestCallParams.push('requestBody = requestBody')
	}
	const params = paramsSignature.join(', ')

	const resultClassName = `${className(generator, op.name)}ResponseStatus`
	const fullPath = `${group.path}${op.path}`
	const securityScheme = `${root.securityPackage}.SecurityScheme`
	const apiException = `${root.supportPackage}.APIException`
	const responses = op.responses ? idx.allValues(op.responses) : []

	let out = ''

	/* Response status sealed class */
	out += `sealed class ${resultClassName} {\n`
	for (const response of responses) {
		if (response.code === 401) {
			continue
		}
		if (response.description) {
			out += `    /** ${response.description} */\n`
		}
		const label = response.isCatchAll ? 'Default' : `\`${response.code}\``
		if (response.defaultContent && response.defaultContent.nativeType) {
			out += `    data class ${label}(val value: ${response.defaultContent.nativeType}): ${resultClassName}()\n`
		} else {
			out += `    data object ${label}: ${resultClassName}()\n`
		}
	}
	out += '}\n'
	out += '\n'

	/* Query-parameters overload */
	if (parameters.length > 1) {
		const queryParamsClassName = className(generator, `${op.name}QueryParams`)
		out += parametersStruct(op, queryParamsClassName, ctx) + '\n'
		out += '\n'
		const overloadDocumentation = operationDocumentation(op)
		if (typeof overloadDocumentation === 'string') {
			out += overloadDocumentation + '\n'
		}
		if (op.deprecated) {
			out += '@kotlin.Deprecated(message = "This function is deprecated.")\n'
		}
		const bodyParam = hasBody ? `, requestBody: ${op.requestBody!.nativeType}${op.requestBody!.required ? '' : ' = null'}` : ''
		out += `open suspend fun ${op.name}(queryParams: I${queryParamsClassName}${bodyParam}): Result<${resultClassName}> {\n`
		out += `    return ${op.name}(${requestCallParams.join(', ')}${params ? ', ' : ''}allowsReauth = true)\n`
		out += '}\n'
		out += '\n'
	}

	/* The full function */
	const documentation = operationDocumentation(op)
	if (typeof documentation === 'string') {
		out += documentation + '\n'
	}
	if (op.deprecated) {
		out += '@kotlin.Deprecated(message = "This function is deprecated.")\n'
	}
	out += `open suspend fun ${op.name}(${params}${params ? ', ' : ''}allowsReauth: kotlin.Boolean = true): Result<${resultClassName}> {\n`
	out += '    return withContext(Dispatchers.IO) {\n'
	out += `        val path = "${stripLeadingSlash(fullPath)}"\n`
	for (const p of parameterValues(op.pathParams)) {
		out += `            .replace("{${p.serializedName}}", "$${identifier(generator, p.name)}")\n`
	}

	const configSections: string[] = []
	if (op.queryParams) {
		configSections.push(requestParameter(op))
	}
	if (hasBody) {
		configSections.push(requestBody(op))
	}
	if (op.securityRequirements) {
		configSections.push(requestAuthentication(op, securityScheme, apiException, ctx))
	}

	out += '        try {\n'
	out += `            val response = client.${op.httpMethod.toLocaleLowerCase()}(path)`
	if (configSections.length) {
		out += ' {\n'
		out += '\n'
		for (const section of configSections) {
			out += indent(section, '                ') + '\n'
			out += '\n'
		}
		out += '            }\n'
		out += '\n'
	} else {
		out += '\n'
	}
	out += '            return@withContext when (response.status) {\n'

	if (op.securityRequirements) {
		const securityRequirements = op.securityRequirements
		out += '                io.ktor.http.HttpStatusCode.Unauthorized -> {\n'
		out += `                    if (!allowsReauth) return@withContext Result.failure(${apiException}.AuthenticationFailed(response))\n`
		out += '                    val securityClient = configuration.securityClient\n'
		out += `                        ?: return@withContext Result.failure(${apiException}.AuthenticationFailed(response))\n`
		out += '\n'
		out += '                    var didAuthenticate = false\n'
		out += '                    var lastException: Throwable? = null\n'
		for (const requirement of securityRequirements.requirements) {
			out += '\n'
			out += '                    if (!didAuthenticate) {\n'
			out += '                        run {\n'
			for (const scheme of requirement.schemes) {
				out += `                            // ${scheme.scheme.name}\n`
				out += '                            securityClient.reauthenticate(\n'
				out += '                                response.requestData(),\n'
				out += `                                ${securityScheme}.${upperCase(scheme.scheme.name)},\n`
				out += `                                ${scopesExpression(scheme, ctx)}\n`
				out += '                            ).onFailure {\n'
				out += '                                lastException = it\n'
				out += '                                return@run\n'
				out += '                            }\n'
				out += '\n'
			}
			out += '                            didAuthenticate = true\n'
			out += '                        }\n'
			out += '                    }\n'
		}
		if (!securityRequirements.optional) {
			out += '\n'
			out += '                    if (!didAuthenticate) {\n'
			out += '                        return@withContext Result.failure(\n'
			out += `                            lastException ?: ${apiException}.AuthenticationFailed(response)\n`
			out += '                        )\n'
			out += '                    }\n'
		}
		out += '\n'
		out += `                    return@withContext ${op.name}(${callParams.join(', ')}${params ? ', ' : ''}allowsReauth = false)\n`
		out += '                }\n'
		out += '\n'
	}

	responses.forEach((response, index) => {
		if (response.code !== 401) {
			const label = response.isCatchAll ? 'Default' : `\`${response.code}\``
			if (response.isCatchAll) {
				out += '                else -> {\n'
			} else {
				out += `                io.ktor.http.HttpStatusCode.fromValue(${response.code}) -> {\n`
			}
			if (response.defaultContent && response.defaultContent.nativeType) {
				out += `                    val body: ${response.defaultContent.nativeType} = response.body()\n`
				out += `                    Result.success(${resultClassName}.${label}(body))\n`
			} else {
				out += `                    Result.success(${resultClassName}.${label})\n`
			}
			out += '                }\n'
		}
		if (index < responses.length - 1) {
			out += '\n'
		}
	})
	if (!op.catchAllResponse) {
		out += '\n'
		out += `                else -> Result.failure(${apiException}.UnexpectedResponse(response))\n`
	}
	out += '            }\n'
	out += '        } catch (e: Throwable) {\n'
	out += '            Result.failure(e)\n'
	out += '        }\n'
	out += '\n'
	out += '    }\n'
	out += '}'

	return out
}
