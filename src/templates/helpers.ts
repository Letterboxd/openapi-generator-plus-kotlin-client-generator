import { CodegenEnumSchema, CodegenNativeType, CodegenParameter, CodegenParameters, CodegenProperties, CodegenProperty, CodegenSchema } from '@openapi-generator-plus/types'
import { isBoolean, isDate, isDateTime, isEnum, isNumeric, isString, isTime } from '@openapi-generator-plus/template-utils'
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

/** The Kotlin type to give `serializer<T>()` for a value of `nativeType`: the type that carries any serializer annotations. */
export function serializerType(nativeType: CodegenNativeType): string {
	const info = nativeType.info as { serialized?: string } | null | undefined
	return info && info.serialized ? info.serialized.replace(/\?$/, '') : String(nativeType).replace(/\?$/, '')
}

/**
 * Whether a value of `schema` is text, which JSON writes as a string, such as a date or an enum. A number or
 * a boolean in a text body is valid JSON as it is, so it isn't text here.
 */
export function isTextValue(schema: CodegenSchema): boolean {
	return isString(schema) || isDate(schema) || isTime(schema) || isDateTime(schema) || (isEnum(schema) && !isNumericEnum(schema))
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

/** Whether a body of `schema` that isn't JSON is read as text: a text value, or an enum of numbers, which may hold other text. */
export function isTextBody(schema: CodegenSchema): boolean {
	return isTextValue(schema) || isNumericEnum(schema)
}

/** Whether a value of `schema` is a scalar, whose text is its `toString()`. */
export function isScalar(schema: CodegenSchema): boolean {
	return isTextValue(schema) || isNumericEnum(schema) || isNumeric(schema) || isBoolean(schema)
}

/**
 * An expression of the serializer for a value of `nativeType`, in the API classes. It's looked up in the JSON
 * configuration's module, which holds the serializers of the types that aren't serializable themselves, such
 * as \`java.util.UUID\`, because a lookup ignores the serializer annotations of type arguments.
 */
export function serializerExpression(nativeType: CodegenNativeType): string {
	return `configuration.json.serializersModule.serializer<${serializerType(nativeType)}>()`
}

/**
 * The name of the \`SecurityScheme\` constant for the security scheme named `name`: the name in upper case, with
 * each character that an identifier can't hold replaced with an underscore.
 */
export function securitySchemeConstant(name: string): string {
	const constant = name.toLocaleUpperCase().replace(/[^\p{L}\p{N}_]/gu, '_')
	return /^\p{N}/u.test(constant) ? `_${constant}` : constant
}

/** Whether `mediaType` is JSON: a type that ends in \`json\`, such as \`application/vnd.api+json\`, with any parameters. Media types ignore case. */
export function isJsonMediaType(mediaType: string): boolean {
	return /\bjson$/i.test(mediaType.split(';')[0].trim())
}

/** The property of each support date type that parses its text. */
const SUPPORT_DATE_ACCESSORS: Record<string, string> = {
	Instant: 'kInstant',
	LocalDate: 'kLocalDate',
	LocalTime: 'kLocalTime',
}

/**
 * The property that parses the text of `nativeType`, when it's a support date type, or `undefined`. A support date
 * type holds its text as it is, so a reader of one reads this property to check the text.
 */
export function supportDateAccessor(nativeType: string, ctx: { root: { supportPackage: string } }): string | undefined {
	const supportPrefix = `${ctx.root.supportPackage}.`
	return nativeType.startsWith(supportPrefix) ? SUPPORT_DATE_ACCESSORS[nativeType.slice(supportPrefix.length)] : undefined
}

/** The Kotlin Double literal of the number `text`. A whole number needs a decimal point to be a Double literal. */
export function doubleLiteral(text: string): string {
	return /[.eE]/.test(text) ? text : `${text}.0`
}
