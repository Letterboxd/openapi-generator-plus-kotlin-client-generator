import { ts } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { generatedBy } from '../frag/generatedBy'

/** The `RequestData` capture of a request, used when reauthenticating after a failure. */
export function requestData(ctx: KotlinModelContext): string {
	const root = ctx.root
	return ts`
/*
 * ${generatedBy(root)}
 */

package ${root.securityPackage}

import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.request
import io.ktor.client.utils.EmptyContent
import io.ktor.http.Headers
import io.ktor.http.HttpMethod
import io.ktor.http.Url
import io.ktor.http.content.OutgoingContent
import io.ktor.util.Attributes

data class RequestData(
    val url: Url,
    val method: HttpMethod,
    val headers: Headers,
    val body: OutgoingContent,
    val attributes: Attributes
)

fun HttpRequestBuilder.requestData() = RequestData(
    // Must recreate Url off of url, a URLBuilder property, as otherwise,
    // build() runs which prevents base path from being appended on the actual request.
    url = Url(url),
    method = method,
    headers = headers.build(),
    body = body as? OutgoingContent ?: EmptyContent,
    attributes = attributes
)

fun HttpResponse.requestData() = request.run {
    RequestData(
        url = url,
        method = method,
        headers = headers,
        body = content,
        attributes = attributes
    )
}
`
}
