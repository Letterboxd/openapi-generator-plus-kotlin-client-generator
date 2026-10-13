import { CodegenOAuthFlow } from '@openapi-generator-plus/types'
import { each, identifier, stringLiteral, ts, when } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { generatedBy } from '../frag/generatedBy'
import { securitySchemeConstant } from '../helpers'

/**
 * A factory extension function that creates one of the OAuth flow clients with
 * the endpoint URLs taken from the API specification.
 */
function flowClientFactory(clientClass: string, schemeName: string, flow: CodegenOAuthFlow, extraArguments: string, ctx: KotlinModelContext): string {
	const generator = ctx.generatorContext.generator()
	return ts`
/**
 * Create an instance of \`${clientClass}\` with provided authentication credentials, using endpoint URLs from the API specification.
 *
 * @param clientId: The client ID associated with the API.
 * @param clientSecret: The client secret associated with the API.
 * @param autoRefreshInterval: Optional time interval defining how many seconds before expiration should an automatic refresh be attempted. By default no refresh is attempted until the API rejects the token.
 * @param accessTokenDidChange: A closure to be executed when the access token changes. Defaults to \`null\`.
 */
fun ${clientClass}.Companion.${identifier(generator, schemeName)}Client(
    clientId: String,
    clientSecret: String,
    autoRefreshInterval: kotlin.time.Duration? = null,
    accessTokenDidChange: AccessTokenHandler? = null,
    /** A block that allows you to further configure the HTTP client. */
    httpClientConfig: HttpClientConfigurator? = null,
): ${clientClass} = ${clientClass}(
    clientId = clientId,
    clientSecret = clientSecret,
${when(flow.refreshUrl, () => `    refreshURL = java.net.URL(${stringLiteral(ctx.generatorContext, flow.refreshUrl!)}),`)}
    tokenURL = java.net.URL(${stringLiteral(ctx.generatorContext, flow.tokenUrl ?? '')}),${extraArguments}
    autoRefreshInterval = autoRefreshInterval,
    accessTokenDidChange = accessTokenDidChange,
    httpClientConfig = httpClientConfig
)`
}

/** The `SecurityScheme` enum of the API's declared security schemes, with OAuth flow client factories. */
export function securityScheme(ctx: KotlinModelContext): string {
	const root = ctx.root
	const securitySchemes = root.securitySchemes && root.securitySchemes.length ? root.securitySchemes : null

	const cases = securitySchemes
		? each(securitySchemes, (scheme, index, isFirst, isLast) => `    ${securitySchemeConstant(scheme.name)}(${stringLiteral(ctx.generatorContext, scheme.name)})${isLast ? ';' : ','}`, '\n')
		: ts`
    /** No security schemes were specified. This case is a placeholder so the sealed class is valid. */
    UNSPECIFIED("unspecified");`

	let result = ts`
/*
 *  The security schemes declared by the API specification.
 *
 *  ${generatedBy(root)}
 */

package ${root.securityPackage}

import ${root.supportPackage}.HttpClientConfigurator

/** The security schemes documented in the API specification. */
enum class SecurityScheme(val rawValue: String) {
${cases}

    val debugDescription: String
        get() = "SecurityScheme: $rawValue"
}
`

	for (const scheme of securitySchemes || []) {
		if (!scheme.isOAuth || !scheme.flows) {
			continue
		}
		for (const flow of scheme.flows) {
			result += '\n'
			if (!flow.tokenUrl) {
				continue
			}
			if (flow.type === 'password') {
				result += flowClientFactory('OAuthPasswordFlowClient', scheme.name, flow, '', ctx) + '\n'
			}
			if (flow.type === 'clientCredentials') {
				result += flowClientFactory('OAuthClientCredentialsFlowClient', scheme.name, flow, '', ctx) + '\n'
			}
			if (flow.type === 'authorizationCode' && flow.authorizationUrl) {
				result += flowClientFactory('OAuthAuthorizationCodeFlowClient', scheme.name, flow, `\n    authorizationURL = java.net.URL(${stringLiteral(ctx.generatorContext, flow.authorizationUrl)}),`, ctx) + '\n'
			}
			if (flow.type === 'implicit') {
				result += '// TODO: Generate the implicit flow client\n'
			}
		}
	}
	return result
}
