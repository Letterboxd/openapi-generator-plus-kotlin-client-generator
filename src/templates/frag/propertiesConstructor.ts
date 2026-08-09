import { CodegenObjectSchema, CodegenProperty } from '@openapi-generator-plus/types'
import { each, Skip, ts, undefinedValueLiteral, when } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { propertyValues } from '../helpers'
import { propertyDocumentation } from './documentation'

/**
 * A property rendered as a Kotlin primary-constructor parameter, using the
 * serialized form of its native type and defaulting optional parameters.
 */
function parameterLine(p: CodegenProperty, ctx: KotlinModelContext): string {
	let result = ''
	if (p.overrides) {
		result += 'override '
	}
	result += `val ${p.name}: ${p.nativeType.info && p.nativeType.info.serialized ? p.nativeType.info.serialized : p.nativeType}`
	if (!p.required) {
		result += ' = '
		result += p.initialValue ? p.initialValue.literalValue : undefinedValueLiteral(ctx.generatorContext, p.schema)
	}
	result += ','
	return result
}

/**
 * The primary-constructor parameters of a class: one annotated parameter per
 * property, separated by blank lines. Returns SKIP when the schema has no
 * properties.
 */
export function propertiesConstructor(schema: CodegenObjectSchema, ctx: KotlinModelContext): string | Skip {
	return each(propertyValues(schema.properties), p => ts`
${propertyDocumentation(p)}
${when(p.deprecated, '@kotlin.Deprecated(message = "This property is deprecated.")')}
@kotlinx.serialization.SerialName(value = "${p.serializedName}")
${parameterLine(p, ctx)}`, '\n\n')
}
