import { CodegenEnumSchema, CodegenParameter, CodegenParameters, CodegenProperties, CodegenProperty, CodegenSchema } from '@openapi-generator-plus/types'
import { isEnum } from '@openapi-generator-plus/template-utils'
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

/** The kind of number of an enum of numbers, whose values JSON writes as numbers, or `null` for any other schema. */
export function numericEnumKind(schema: CodegenSchema): 'LONG' | 'DOUBLE' | null {
	const valueType = isEnum(schema) ? (schema as CodegenEnumSchema).enumValueNativeType : null
	if (valueType && /^kotlin\.(Int|Long|Short|Byte)$/.test(valueType.concreteType)) {
		return 'LONG'
	}
	if (valueType && /^kotlin\.(Float|Double)$/.test(valueType.concreteType)) {
		return 'DOUBLE'
	}
	return null
}

/** Whether `schema` is an enum of numbers, whose values JSON writes as numbers. */
export function isNumericEnum(schema: CodegenSchema): boolean {
	return numericEnumKind(schema) !== null
}

/**
 * The name of the \`SecurityScheme\` constant for the security scheme named `name`: the name in upper case, with
 * each character that an identifier can't hold replaced with an underscore.
 */
export function securitySchemeConstant(name: string): string {
	const constant = name.toLocaleUpperCase().replace(/[^\p{L}\p{N}_]/gu, '_')
	return /^\p{N}/u.test(constant) ? `_${constant}` : constant
}

/** The Kotlin Double literal of the number `text`. A whole number needs a decimal point to be a Double literal. */
export function doubleLiteral(text: string): string {
	return /[.eE]/.test(text) ? text : `${text}.0`
}
