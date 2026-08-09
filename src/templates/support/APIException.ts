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
sealed class APIException(message: String) : Exception(message) {
    /** The security client is not authenticated */
    data object NotAuthenticated : APIException("Not authenticated") {
        private fun readResolve(): Any = NotAuthenticated
    }

    /** The authentication request failed */
    data class AuthenticationFailed(val response: io.ktor.client.statement.HttpResponse) : APIException("Authentication Failed: \${response.status}")

    /** A response was received that could not be decoded */
    data class InvalidResponse(val response: io.ktor.client.statement.HttpResponse) : APIException("Invalid Response: \${response.status}")

    /** The API requested authentication using a \`SecurityScheme\` that has not been configured in the \`SecurityClientController\` */
    data class SecuritySchemeNotConfigured(val scheme: ${root.securityPackage}.SecurityScheme) : APIException("Security Scheme Not Configured: \${scheme.rawValue}")

    /** A response was received with an undocumented status code */
    data class UnexpectedResponse(val response: io.ktor.client.statement.HttpResponse) : APIException("Unexpected Response: \${response.status}")
}
`
}
