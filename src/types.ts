import { JavaLikeOptions } from '@openapi-generator-plus/java-like-generator-helper'

/**
 * Options specific to the template that the user can provide to the code generation process.
 */
export interface CodegenOptionsKotlin extends JavaLikeOptions {
	apiPackage: string
	modelPackage: string
	supportPackage: string
	securityPackage: string

	relativeSourceOutputPath: string
	customTemplatesPath: string | null
	hideGenerationTimestamp: boolean

	dateImplementation: string
	timeImplementation: string
	dateTimeImplementation: string
	binaryRepresentation: string

	isJavaSerializable: boolean

	gradle: GradleOptions | null
}

export interface GradleOptions {
	groupId: string
	version: string
	versions: {
		[name: string]: unknown
	}
}
