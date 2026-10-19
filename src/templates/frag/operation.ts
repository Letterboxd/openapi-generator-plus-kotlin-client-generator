import { CodegenOperation, CodegenOperationGroup, CodegenResponse, CodegenSecurityRequirementScheme } from '@openapi-generator-plus/types'
import * as idx from '@openapi-generator-plus/indexed-type'
import { className, identifier, indent, stringLiteral } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { parameterValues, securitySchemeConstant, stripLeadingSlash } from '../helpers'
import { operationDocumentation } from './documentation'
import { parametersStruct } from './parametersStruct'
import { pathParameterValue, requestParameter } from './requestParameter'
import { requestBody } from './requestBody'
import { acceptHeader, responseClass, responseHeaderMembers, responseRange, responseResult } from './responses'

/** The scopes of a security requirement scheme as an inline Kotlin expression. */
function scopesExpression(scheme: CodegenSecurityRequirementScheme, ctx: KotlinModelContext): string {
	if (scheme.scopes && scheme.scopes.length) {
		return `listOf(${scheme.scopes.map(scope => stringLiteral(ctx.generatorContext, scope.name)).join(', ')})`
	}
	return 'null'
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
			const schemeName = `${securityScheme}.${securitySchemeConstant(scheme.scheme.name)}`
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
 * The statements that add the operation's query, header and cookie parameters, its `Accept` header
 * and its request body to the request, in the request builder.
 */
function requestContent(op: CodegenOperation, ctx: KotlinModelContext): string[] {
	const generator = ctx.generatorContext.generator()
	const sections: string[] = []

	const queryParams = parameterValues(op.queryParams)
	if (queryParams.length) {
		let section = '// Set query parameters\n'
		section += 'val localVarQuery = mutableListOf<Pair<String, String>>()\n'
		for (const p of queryParams) {
			section += requestParameter(p, { dest: 'localVarQuery', value: identifier(generator, p.name), encoding: p.encoding }, ctx) + '\n'
		}
		section += 'localVarQuery.forEach { this.url.parameters.append(it.first, it.second) }'
		sections.push(section)
	}

	const accept = acceptHeader(op)
	const headerParams = parameterValues(op.headerParams)
	if (accept || headerParams.length) {
		let section = '// Set headers\n'
		if (accept) {
			section += `this.headers.append(io.ktor.http.HttpHeaders.Accept, ${stringLiteral(ctx.generatorContext, accept)})\n`
		}
		if (headerParams.length) {
			section += 'val localVarHeaders = mutableListOf<Pair<String, String>>()\n'
			for (const p of headerParams) {
				section += requestParameter(p, { dest: 'localVarHeaders', value: identifier(generator, p.name), encoding: p.encoding }, ctx) + '\n'
			}
			section += 'localVarHeaders.forEach { this.headers.append(it.first, it.second) }\n'
		}
		sections.push(section.replace(/\n$/, ''))
	}

	const cookieParams = parameterValues(op.cookieParams)
	if (cookieParams.length) {
		let section = '// Set cookies\n'
		section += 'val localVarCookies = mutableListOf<Pair<String, String>>()\n'
		for (const p of cookieParams) {
			section += requestParameter(p, { dest: 'localVarCookies', value: identifier(generator, p.name), encoding: p.encoding, percentEncode: true }, ctx) + '\n'
		}
		section += 'if (localVarCookies.isNotEmpty()) {\n'
		section += '    this.headers.append(io.ktor.http.HttpHeaders.Cookie, localVarCookies.joinToString("; ") { "${it.first}=${it.second}" })\n'
		section += '}'
		sections.push(section)
	}

	const request = op.requestBody && op.requestBody.nativeType ? op.requestBody : null
	if (request) {
		let section = '// Set request body\n'
		if (request.required) {
			section += requestBody(request, 'requestBody', ctx)
		} else {
			section += 'requestBody?.let { localVarRequestBody ->\n'
			section += indent(requestBody(request, 'localVarRequestBody', ctx), '    ') + '\n'
			section += '}'
		}
		sections.push(section)
	}

	return sections
}

/** The type of the lambda that an [APIRequest] uses to customise the request that it sends. */
const CUSTOMIZE_REQUEST_TYPE = 'io.ktor.client.request.HttpRequestBuilder.() -> Unit'

/** The values that the API class and the request builder work out about an operation. */
interface OperationParts {
	/** The parameters in the signature of the function that takes them all, with defaults for the optional ones. */
	params: string
	/** The parameters in a signature, without defaults, for the private function that performs the request. */
	performParams: string
	/** The arguments passing each parameter on by name. */
	callParams: string[]
	/** The arguments passing each parameter on by name from a `queryParams` object. */
	requestCallParams: string[]
	/** The request body parameter for the query-parameters overload, with a leading comma, if there's a body. */
	bodyParam: string
	resultClassName: string
	queryParamsClassName: string | null
}

function operationParts(op: CodegenOperation, ctx: KotlinModelContext): OperationParts {
	const generator = ctx.generatorContext.generator()
	const parameters = parameterValues(op.parameters)
	const hasBody = !!(op.requestBody && op.requestBody.nativeType)

	const paramsSignature = parameters.map(p => `${p.name}: ${p.nativeType}${p.required ? '' : ' = null'}`)
	const performSignature = parameters.map(p => `${p.name}: ${p.nativeType}`)
	const callParams = parameters.map(p => `${p.name} = ${p.name}`)
	const requestCallParams = parameters.map(p => `${p.name} = queryParams.${p.name}`)
	if (hasBody) {
		paramsSignature.push(`requestBody: ${op.requestBody!.nativeType}${op.requestBody!.required ? '' : ' = null'}`)
		performSignature.push(`requestBody: ${op.requestBody!.nativeType}`)
		callParams.push('requestBody = requestBody')
		requestCallParams.push('requestBody = requestBody')
	}

	return {
		params: paramsSignature.join(', '),
		performParams: performSignature.join(', '),
		callParams,
		requestCallParams,
		bodyParam: hasBody ? `, requestBody: ${op.requestBody!.nativeType}${op.requestBody!.required ? '' : ' = null'}` : '',
		resultClassName: `${className(generator, op.name)}ResponseStatus`,
		queryParamsClassName: parameters.length > 1 ? className(generator, `${op.name}QueryParams`) : null,
	}
}

/** The KDoc and deprecation annotation that go before each of an operation's functions. */
function operationPreamble(op: CodegenOperation): string {
	let out = ''
	const documentation = operationDocumentation(op)
	if (typeof documentation === 'string') {
		out += documentation + '\n'
	}
	if (op.deprecated) {
		out += '@kotlin.Deprecated(message = "This function is deprecated.")\n'
	}
	return out
}

/** The name of the request builder's private function that performs an operation's request. */
function performName(op: CodegenOperation, ctx: KotlinModelContext): string {
	return `perform${className(ctx.generatorContext.generator(), op.name)}`
}

/**
 * An operation's members in the API class: its response-status sealed class, its query-parameters
 * holder and overload when it has multiple parameters, and the function that takes all of its
 * parameters. The functions send the request that the group's request builder makes.
 */
export function operation(op: CodegenOperation, group: CodegenOperationGroup, ctx: KotlinModelContext): string {
	const { params, callParams, requestCallParams, bodyParam, resultClassName, queryParamsClassName } = operationParts(op, ctx)
	/* A 401 is never one of an operation's responses, as in the Swift client: an operation with security authenticates again,
	   and otherwise the 401 falls through to a range, the catch-all, or an unexpected response */
	/* A range, such as 4XX, comes after the codes that it holds, so that a code reads as its own response, and the catch-all comes last */
	const order = (response: CodegenResponse) => response.isCatchAll ? 2 : responseRange(response) !== null ? 1 : 0
	const responses = (op.responses ? idx.allValues(op.responses) : [])
		.filter(response => response.code !== 401)
		.sort((a, b) => order(a) - order(b))
	/* The header members of each response, made once, so that each warning about a header is logged once */
	const headerMembers = responses.map(response => responseHeaderMembers(response, op, ctx))

	let out = ''

	/* Response status sealed class */
	out += `sealed class ${resultClassName} {\n`
	responses.forEach((response, index) => {
		out += indent(responseClass(response, headerMembers[index], resultClassName), '    ') + '\n'
	})
	out += '}\n'
	out += '\n'

	/* Query-parameters overload */
	if (queryParamsClassName) {
		out += parametersStruct(op, queryParamsClassName, ctx) + '\n'
		out += '\n'
		out += operationPreamble(op)
		out += `open suspend fun ${op.name}(queryParams: I${queryParamsClassName}${bodyParam}): Result<${resultClassName}> {\n`
		out += `    return ${op.name}(${requestCallParams.join(', ')}${params ? ', ' : ''}allowsReauth = true)\n`
		out += '}\n'
		out += '\n'
	}

	/* The full function */
	out += operationPreamble(op)
	out += `open suspend fun ${op.name}(${params}${params ? ', ' : ''}allowsReauth: kotlin.Boolean = true): Result<${resultClassName}> {\n`
	out += `    return this.apiRequestBuilder.${op.name}(${callParams.join(', ')}).execute(allowsReauth = allowsReauth)\n`
	out += '}'

	return out
}

/**
 * An operation's members in the group's request builder: the functions that make its request without
 * sending it, as an `APIRequest` that the caller may customise before they execute it, and the
 * private function that performs the request, applies security, and maps the response status to a
 * result.
 */
export function operationRequestBuilder(op: CodegenOperation, group: CodegenOperationGroup, ctx: KotlinModelContext): string {
	const generator = ctx.generatorContext.generator()
	const root = ctx.root
	const { params, performParams, callParams, requestCallParams, bodyParam, resultClassName: localResultClassName, queryParamsClassName } = operationParts(op, ctx)

	const apiClassName = `${group.name}Api`
	const resultClassName = `${apiClassName}.${localResultClassName}`
	const apiRequest = `${root.supportPackage}.APIRequest<${resultClassName}>`
	const perform = performName(op, ctx)
	const fullPath = `${group.path}${op.path}`
	const securityScheme = `${root.securityPackage}.SecurityScheme`
	const apiException = `${root.supportPackage}.APIException`
	const order = (response: CodegenResponse) => response.isCatchAll ? 2 : responseRange(response) !== null ? 1 : 0
	const responses = (op.responses ? idx.allValues(op.responses) : [])
		.filter(response => response.code !== 401)
		.sort((a, b) => order(a) - order(b))
	/* Made without logging, as the API class's members already logged any warnings about the headers */
	const quietGeneratorContext = Object.create(ctx.generatorContext, { log: { value: () => undefined } })
	const quietCtx: KotlinModelContext = { ...ctx, generatorContext: quietGeneratorContext }
	const headerMembers = responses.map(response => responseHeaderMembers(response, op, quietCtx))

	let out = ''

	/* The query-parameters overload */
	if (queryParamsClassName) {
		out += operationPreamble(op)
		out += `fun ${op.name}(queryParams: ${apiClassName}.I${queryParamsClassName}${bodyParam}): ${apiRequest} {\n`
		out += `    return ${op.name}(${requestCallParams.join(', ')})\n`
		out += '}\n'
		out += '\n'
	}

	/* The function that takes all of the parameters */
	out += operationPreamble(op)
	out += `fun ${op.name}(${params}): ${apiRequest} {\n`
	out += `    return ${root.supportPackage}.APIRequest { localVarAllowsReauth, localVarCustomizeRequest ->\n`
	out += `        ${perform}(${callParams.join(', ')}${callParams.length ? ', ' : ''}allowsReauth = localVarAllowsReauth, customizeRequest = localVarCustomizeRequest)\n`
	out += '    }\n'
	out += '}\n'
	out += '\n'

	/* The function that performs the request */
	out += `private suspend fun ${perform}(${performParams}${performParams ? ', ' : ''}allowsReauth: kotlin.Boolean, customizeRequest: ${CUSTOMIZE_REQUEST_TYPE}): Result<${resultClassName}> {\n`
	out += '    return withContext(Dispatchers.IO) {\n'
	out += `        val localVarPath = ${stringLiteral(ctx.generatorContext, stripLeadingSlash(fullPath))}\n`
	for (const p of parameterValues(op.pathParams)) {
		out += `            .replace(${stringLiteral(ctx.generatorContext, `{${p.serializedName}}`)}, ${indent(pathParameterValue(p, p.encoding, identifier(generator, p.name), ctx), '            ').trimStart()})\n`
	}

	const configSections = requestContent(op, ctx)
	/* After the operation's own parameters, so the caller can change or remove them, and before security and the
	   configuration's finalizeRequestBlock, so a customised request is still authorized and finalized */
	configSections.push('// Apply the caller\'s customisations\ncustomizeRequest()')
	if (op.securityRequirements) {
		configSections.push(requestAuthentication(op, securityScheme, apiException, ctx))
	}
	configSections.push('configuration.finalizeRequestBlock?.invoke(this)')

	out += '        try {\n'
	out += '            val response = client.request(localVarPath) {\n'
	out += `                this.method = io.ktor.http.HttpMethod(${stringLiteral(ctx.generatorContext, op.httpMethod.toUpperCase())})\n`
	out += '\n'
	for (const section of configSections) {
		out += indent(section, '                ') + '\n'
		out += '\n'
	}
	out += '            }\n'
	out += '\n'
	out += '            return@withContext when (response.status.value) {\n'

	if (op.securityRequirements) {
		const securityRequirements = op.securityRequirements
		out += '                401 -> {\n'
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
				out += `                                ${securityScheme}.${securitySchemeConstant(scheme.scheme.name)},\n`
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
		out += `                    return@withContext ${perform}(${callParams.join(', ')}${callParams.length ? ', ' : ''}allowsReauth = false, customizeRequest = customizeRequest)\n`
		out += '                }\n'
		out += '\n'
	}

	responses.forEach((response, index) => {
		const range = responseRange(response)
		out += `                ${response.isCatchAll ? 'else' : range !== null ? `in ${range}00..${range}99` : String(response.code)} -> {\n`
		out += indent(responseResult(response, headerMembers[index], resultClassName, ctx), '                    ') + '\n'
		out += '                }\n'
		if (index < responses.length - 1) {
			out += '\n'
		}
	})
	if (!op.catchAllResponse) {
		out += '\n'
		out += `                else -> Result.failure(${apiException}.UnexpectedResponse(response))\n`
	}
	out += '            }\n'
	out += '        } catch (e: kotlinx.coroutines.CancellationException) {\n'
	out += '            throw e\n'
	out += '        } catch (e: Throwable) {\n'
	out += '            Result.failure(e)\n'
	out += '        }\n'
	out += '    }\n'
	out += '}'

	return out
}
