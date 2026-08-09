import { ts } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { generatedBy } from '../frag/generatedBy'

/** The `Configuration` support class that configures API instances and their HTTP client. */
export function configuration(ctx: KotlinModelContext): string {
	const root = ctx.root
	return ts`
/*
 * ${generatedBy(root)}
 */

package ${root.supportPackage}

import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.engine.okhttp.OkHttpConfig
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonBuilder
import kotlin.time.Duration

typealias ConfigurationFinalizeRequestBlock = (HttpRequestBuilder) -> Unit

data class Configuration(
    /** Override the default base path. */
    val basePath: String? = null,

    /** The handler for all security requests. */
    var securityClient: ${root.securityPackage}.SecurityClient? = null,

    val timeoutInterval: Duration = Duration.parse("30s"),

    val finalizeRequestBlock: ConfigurationFinalizeRequestBlock? = null,

    /** A block that allows you to further configure the HTTP client. */
    val httpClientConfig: (HttpClientConfig<OkHttpConfig>.() -> Unit)? = null,

    val jsonBuilder: (JsonBuilder.() -> Unit)? = null

) {
    internal val client: HttpClient = HttpClient(OkHttp) {
        basePath?.let {
            // Default URL must have a trailing slash, otherwise any paths are ignored by Ktor.
            val basePath = if (it.endsWith("/")) it else "$it/"
            defaultRequest {
                url(basePath)
            }
        }

        httpClientConfig?.invoke(this)

        install(ContentNegotiation) {
            json(Json {
                // Tolerate additive API changes: unknown response keys are ignored
                // rather than failing the whole response. May be overridden in jsonBuilder.
                ignoreUnknownKeys = true
                jsonBuilder?.invoke(this)
                encodeDefaults = false
            })
        }
    }
}
`
}
