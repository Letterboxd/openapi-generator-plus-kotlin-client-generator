import { CodegenParameter, CodegenParameters, CodegenProperties, CodegenProperty } from '@openapi-generator-plus/types'
import * as idx from '@openapi-generator-plus/indexed-type'

/**
 * Prefix every line of `value` after the first with `prefix`, including empty
 * lines. Use for continuing a doc-comment across the lines of a multi-line
 * value, where every continuation line needs the comment leader.
 */
export function indentContinuation(value: string, prefix: string): string {
	return value.split(/\r?\n/).join(`\n${prefix}`)
}

/** Remove a single leading slash from `value`, if present. */
export function stripLeadingSlash(value: string): string {
	return value.startsWith('/') ? value.substring(1) : value
}

/** The values of an indexed properties collection, or an empty array when absent. */
export function propertyValues(properties: CodegenProperties | null | undefined): CodegenProperty[] {
	return properties ? idx.allValues(properties) : []
}

/** The values of an indexed parameters collection, or an empty array when absent. */
export function parameterValues(parameters: CodegenParameters | null | undefined): CodegenParameter[] {
	return parameters ? idx.allValues(parameters) : []
}
