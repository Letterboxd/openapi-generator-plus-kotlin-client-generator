import { CodegenOperationGroup } from '@openapi-generator-plus/types'
import { indent, ts } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from './types'
import { generatedBy } from './frag/generatedBy'
import { operation } from './frag/operation'

/** An API class exposing each of the operation group's operations as a suspend function. */
export function api(group: CodegenOperationGroup, ctx: KotlinModelContext): string {
	const root = ctx.root
	const operations = group.operations.map(op => indent(operation(op, group, ctx), '    ') + '\n').join('')

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

open class ${group.name}Api(
    val configuration: ${root.supportPackage}.Configuration
) {
    private val client: io.ktor.client.HttpClient = configuration.client

${operations}}
`
}
