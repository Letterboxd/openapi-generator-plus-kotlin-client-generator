import { ts } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { generatedBy } from '../frag/generatedBy'

/** The security client that applies Basic authentication credentials to requests. */
export function basicAuthenticationSecurityClient(ctx: KotlinModelContext): string {
	const root = ctx.root
	return ts`
/*
 * ${generatedBy(root)}
 */

package ${root.securityPackage}

import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.header
import io.ktor.util.encodeBase64

/** A [SecurityClient] responsible for handling Basic authentication credentials. */
class BasicAuthenticationSecurityClient(
    private val username: String, private val password: String
) : SecurityClient {

    /** **This function does not do anything**, as username and password do not expire. */
    override suspend fun reauthenticate(
        requestData: RequestData, securityScheme: SecurityScheme, scopes: List<String>?
    ) = Result.success(Unit)

    override suspend fun authorize(
        requestBuilder: HttpRequestBuilder, securityScheme: SecurityScheme, scopes: List<String>?
    ) = runCatching {
        requestBuilder.header("Authorization", "$username:$password".encodeBase64())
    }
}
`
}
