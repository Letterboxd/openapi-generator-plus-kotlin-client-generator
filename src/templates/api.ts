import { CodegenOperationGroup } from '@openapi-generator-plus/types'
import { indent, ts } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from './types'
import { generatedBy } from './frag/generatedBy'
import { operation } from './frag/operation'

/**
 * An API class exposing each of the operation group's operations as a suspend function. It sends the
 * requests that the group's request builder makes.
 */
export function api(group: CodegenOperationGroup, ctx: KotlinModelContext): string {
	const root = ctx.root
	const operations = group.operations.map(op => indent(operation(op, group, ctx), '    ') + '\n').join('')

	return ts`
/*
 * ${generatedBy(root)}
 */

package ${root.apiPackage}

open class ${group.name}Api(
    val configuration: ${root.supportPackage}.Configuration
) {
    private val apiRequestBuilder: ${group.name}ApiRequestBuilder = ${group.name}ApiRequestBuilder(configuration)

${operations}}
`
}
