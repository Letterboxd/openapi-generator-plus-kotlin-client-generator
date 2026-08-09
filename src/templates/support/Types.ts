import { ts } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { generatedBy } from '../frag/generatedBy'

/** The shared type aliases used by the generated support and security classes. */
export function types(ctx: KotlinModelContext): string {
	const root = ctx.root
	return ts`
/*
 * ${generatedBy(root)}
 */

package ${root.supportPackage}

import io.ktor.client.HttpClientConfig
import io.ktor.client.engine.okhttp.OkHttpConfig

typealias HttpClientConfigurator = HttpClientConfig<OkHttpConfig>.() -> Unit
`
}
