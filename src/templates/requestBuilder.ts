import { CodegenOperationGroup } from '@openapi-generator-plus/types'
import { indent, ts } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from './types'
import { generatedBy } from './frag/generatedBy'
import { operationRequestBuilder } from './frag/operation'

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

	return ts`
/*
 * ${generatedBy(root)}
 */

package ${root.apiPackage}

import ${root.securityPackage}.requestData
import ${root.supportPackage}.checkContentType
import ${root.supportPackage}.decodeBinaryBody
import ${root.supportPackage}.decodeBinaryBodyAs
import ${root.supportPackage}.decodeJsonBody
import ${root.supportPackage}.decodeTextBody
import ${root.supportPackage}.requiredResponseHeader
import ${root.supportPackage}.requiredResponseHeaderList
import ${root.supportPackage}.responseHeader
import ${root.supportPackage}.responseHeaderList
/** TODO: Only import the request types that are used by this API. */
import io.ktor.client.request.*
import io.ktor.http.contentType
import io.ktor.http.encodeURLParameter
import io.ktor.http.formUrlEncode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.serializer

/**
 * Makes the requests that [${apiClassName}] sends, without sending them.
 *
 * Reach for this when you need to make a request that the API specification doesn't describe: make
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
