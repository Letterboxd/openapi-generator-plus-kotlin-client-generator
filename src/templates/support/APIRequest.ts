import { ts } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { generatedBy } from '../frag/generatedBy'

/**
 * A request that an operation group's request builder has made for an operation, but that hasn't been
 * sent, and the request handling that sends it.
 *
 * It's exposed so that a caller can customise the request before it's sent — to make a request that
 * the API specification doesn't describe, while still going through the client's security,
 * reauthentication and response handling.
 */
export function apiRequest(ctx: KotlinModelContext): string {
	const root = ctx.root
	return ts`
/*
 * ${generatedBy(root)}
 */

package ${root.supportPackage}

/**
 * A request for an operation that's ready to be sent, and that knows how to read its response into
 * the operation's result. Made by an API's request builder.
 *
 * It's immutable: [customize] returns a new request.
 */
class APIRequest<T> private constructor(
    private val customizations: kotlin.collections.List<io.ktor.client.request.HttpRequestBuilder.() -> Unit>,
    private val perform: suspend (allowsReauth: kotlin.Boolean, customizeRequest: io.ktor.client.request.HttpRequestBuilder.() -> Unit) -> Result<T>,
) {

    internal constructor(
        perform: suspend (allowsReauth: kotlin.Boolean, customizeRequest: io.ktor.client.request.HttpRequestBuilder.() -> Unit) -> Result<T>,
    ) : this(emptyList(), perform)

    /**
     * Returns a request that applies [block] to the request after this request's customisations.
     *
     * [block] receives the request once the operation's own parameters, headers and body are applied,
     * so it can change or remove them. It runs before the request is authorized and before the
     * configuration's \`finalizeRequestBlock\`, and runs again if the request is sent again after
     * reauthenticating.
     */
    fun customize(block: io.ktor.client.request.HttpRequestBuilder.() -> Unit): APIRequest<T> =
        APIRequest(customizations + block, perform)

    /** Send the request, and read the response into the operation's result. */
    suspend fun execute(): Result<T> = execute(allowsReauth = true)

    /**
     * Send the request, and read the response into the operation's result. When [allowsReauth], a
     * request with security that fails with a 401 is sent again after reauthenticating.
     */
    internal suspend fun execute(allowsReauth: kotlin.Boolean): Result<T> =
        perform(allowsReauth) {
            for (customization in customizations) {
                customization()
            }
        }
}
`
}
