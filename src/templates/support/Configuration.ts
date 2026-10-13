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
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.HttpRequestBuilder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonBuilder
import kotlinx.serialization.modules.overwriteWith
import kotlin.time.Duration

typealias ConfigurationFinalizeRequestBlock = (HttpRequestBuilder) -> Unit

data class Configuration(
    /** Override the default base path. */
    val basePath: String? = null,

    /** The handler for all security requests. */
    var securityClient: ${root.securityPackage}.SecurityClient? = null,

    val timeoutInterval: Duration = Duration.parse("30s"),

    /** A block that the API classes call with each request, after they have built and authorized it, so it can be changed before it's sent. */
    val finalizeRequestBlock: ConfigurationFinalizeRequestBlock? = null,

    /** A block that allows you to further configure the HTTP client. */
    val httpClientConfig: (HttpClientConfig<OkHttpConfig>.() -> Unit)? = null,

    val jsonBuilder: (JsonBuilder.() -> Unit)? = null

) {
    /**
     * The JSON format that the API classes use to encode request bodies and to decode response bodies.
     *
     * It tolerates additive API changes: unknown keys in a response are ignored rather than failing the
     * whole response. Change that in [jsonBuilder].
     *
     * It never encodes default values, whatever [jsonBuilder] says, because an optional property that
     * holds its default is absent, which an API can treat differently from a null value.
     */
    @OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)
    val json: Json = Json {
        ignoreUnknownKeys = true
        jsonBuilder?.invoke(this)
        encodeDefaults = false
        /* The serializers of the types that aren't serializable themselves, which a lookup of a serializer needs. A serializer that jsonBuilder gives for one of them wins in the API classes, but not in a model, such as a oneOf member, which has no configuration. */
        serializersModule = supportSerializersModule overwriteWith serializersModule
    }

    internal val client: HttpClient = HttpClient(OkHttp) {
        basePath?.let {
            // Default URL must have a trailing slash, otherwise any paths are ignored by Ktor.
            val basePath = if (it.endsWith("/")) it else "$it/"
            defaultRequest {
                url(basePath)
            }
        }

        /* The API classes encode and decode JSON with [json] themselves, and send their own Accept header, so the client doesn't negotiate content */
        httpClientConfig?.invoke(this)
    }
}
`
}
