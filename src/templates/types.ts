import { CodegenGeneratorContext, CodegenSecurityScheme, CodegenServer } from '@openapi-generator-plus/types'
import { CodegenOptionsKotlin } from '../types'

/**
 * The root context shared by every template: the generator's Kotlin options
 * plus the fields contributed by the common generator's `templateRootContext`
 * and the document-wide values merged in at export time.
 */
export interface RootContext extends CodegenOptionsKotlin {
	generatedDate: string
	clientGenerator: boolean
	serverGenerator: boolean
	documentationGenerator: boolean
	generatorClass: string
	/** Every security scheme declared in the API document, regardless of which operations use it. */
	securitySchemes: CodegenSecurityScheme[] | null
	/** The servers declared in the API document. */
	servers: CodegenServer[] | null

	/* Allow a chaining generator's own root-context fields. */
	[key: string]: unknown
}

/**
 * Bundles the pieces a template function needs to render: the generator
 * context (for `generator()` and its naming rules) and the root options
 * context. Passed to every template in this generator.
 */
export interface KotlinModelContext {
	generatorContext: CodegenGeneratorContext
	root: RootContext
}
