import { CodegenOperationGroup } from '@openapi-generator-plus/types'
import { indent, ts } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from './types'
import { generatedBy } from './frag/generatedBy'
import { operationRequestBuilder } from './frag/operation'

/**
 * The import statements for each of the candidates whose simple name the code uses, and for the
 * Ktor request builder functions, which are imported with a wildcard as the code uses many of them.
 */
function usedImports(code: string, candidates: string[]): string {
	const used = candidates.filter(candidate => {
		const simpleName = candidate.substring(candidate.lastIndexOf('.') + 1)
		return new RegExp(`\\b${simpleName}\\b`).test(code)
	})
	return [...used, 'io.ktor.client.request.*']
		.sort()
		.map(name => `import ${name}`)
		.join('\n')
}

/**
 * The request builder for an operation group, with a function per operation that makes the
 * operation's request without sending it.
 *
 * The API class uses this to make its requests, and it's exposed so that a caller can customise a
 * request before sending it — making a request that the API specification doesn't describe, while
 * still going through the client's security, reauthentication and response handling.
 */
export function requestBuilder(group: CodegenOperationGroup, ctx: KotlinModelContext): string {
	const root = ctx.root
	const apiClassName = `${group.name}Api`
	const operations = group.operations.map(op => indent(operationRequestBuilder(op, group, ctx), '    ') + '\n').join('\n')
	const imports = usedImports(operations, [
		`${root.securityPackage}.requestData`,
		`${root.supportPackage}.checkContentType`,
		`${root.supportPackage}.decodeBinaryBody`,
		`${root.supportPackage}.decodeBinaryBodyAs`,
		`${root.supportPackage}.decodeJsonBody`,
		`${root.supportPackage}.decodeTextBody`,
		`${root.supportPackage}.requiredResponseHeader`,
		`${root.supportPackage}.requiredResponseHeaderList`,
		`${root.supportPackage}.responseHeader`,
		`${root.supportPackage}.responseHeaderList`,
		'io.ktor.http.contentType',
		'io.ktor.http.encodeURLParameter',
		'io.ktor.http.formUrlEncode',
		'kotlinx.coroutines.Dispatchers',
		'kotlinx.coroutines.withContext',
		'kotlinx.serialization.serializer',
	])

	return ts`
/*
 * ${generatedBy(root)}
 */

package ${root.apiPackage}

${imports}

/**
 * Makes the requests that [${apiClassName}] sends, without sending them.
 *
 * Use this when you need to make a request that the API specification doesn't describe: make
 * the request, customise it with [${root.supportPackage}.APIRequest.customize], then send it with
 * [${root.supportPackage}.APIRequest.execute] so it still goes through the client's security,
 * reauthentication and response handling. Prefer [${apiClassName}]'s own functions otherwise, and
 * prefer describing the request in the API specification to customising it here.
 */
class ${apiClassName}RequestBuilder(
    val configuration: ${root.supportPackage}.Configuration
) {
    private val client: io.ktor.client.HttpClient = configuration.client

${operations}}
`
}
