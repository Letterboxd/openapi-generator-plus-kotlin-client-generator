import { ts } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { generatedBy } from '../frag/generatedBy'

/** The `APIException` support class: the errors that occur while using the API. */
export function apiException(ctx: KotlinModelContext): string {
	const root = ctx.root
	return ts`
/*
 * ${generatedBy(root)}
 */

package ${root.supportPackage}

/** Errors that occur while using the API */
sealed class APIException(message: String, cause: Throwable? = null) : Exception(message, cause) {
    /** The security client is not authenticated */
    data object NotAuthenticated : APIException("Not authenticated") {
        private fun readResolve(): Any = NotAuthenticated
    }

    /** The authentication request failed */
    data class AuthenticationFailed(val response: io.ktor.client.statement.HttpResponse) : APIException("Authentication Failed: \${response.status}")

    /**
     * A response was received that could not be decoded.
     *
     * The [cause] says why: a [UnexpectedContentTypeException] when the response doesn't declare the media type that
     * the operation expects, a [ResponseHeaderException] when a header that the API declares can't be read, or the
     * exception that decoding the body threw.
     */
    data class InvalidResponse(val response: io.ktor.client.statement.HttpResponse, override val cause: Throwable? = null) : APIException("Invalid Response: \${response.status}\${cause?.let { ": \${it.message}" } ?: ""}", cause)

    /** The API requested authentication using a \`SecurityScheme\` that has not been configured in the \`SecurityClientController\` */
    data class SecuritySchemeNotConfigured(val scheme: ${root.securityPackage}.SecurityScheme) : APIException("Security Scheme Not Configured: \${scheme.rawValue}")

    /** A response was received with an undocumented status code */
    data class UnexpectedResponse(val response: io.ktor.client.statement.HttpResponse) : APIException("Unexpected Response: \${response.status}")
}

/** The cause of an [APIException.InvalidResponse] when a response header that the API declares can't be read. */
sealed class ResponseHeaderException(message: String) : Exception(message) {
    /** The response doesn't carry a header that the API requires. */
    data class Missing(val name: String) : ResponseHeaderException("The response has no \\"\$name\\" header")

    /** The response carries a header whose value doesn't parse as the type that the API gives it. */
    data class Unreadable(val name: String, val value: String) : ResponseHeaderException("The \\"\$name\\" header of the response is not valid: \$value")
}

/** The cause of an [APIException.InvalidResponse] when a response doesn't declare the media type that the operation expects. */
data class UnexpectedContentTypeException(
    /** The media type that the operation declares. */
    val expected: String,
    /** The media type that the response declared, or \`null\` when it declared none. */
    val actual: String?,
) : Exception("Expected a response of \$expected, but the response declared \${actual ?: "no media type"}")
`
}
