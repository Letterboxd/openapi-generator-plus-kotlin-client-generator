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
import io.ktor.client.call.body
/** TODO: Only import the request types that are used by this API. */
import io.ktor.client.request.*
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

open class ${group.name}Api(
    val configuration: ${root.supportPackage}.Configuration
) {
    private val client: io.ktor.client.HttpClient = configuration.client

${operations}}
`
}
