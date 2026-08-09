import { CodegenObjectSchema } from '@openapi-generator-plus/types'
import { ts, when } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { schemaDocumentation } from './documentation'
import { propertiesConstructor } from './propertiesConstructor'
import { nestedSchemas } from './nestedSchemas'

/**
 * An object schema rendered as a Kotlin class: a serializable data class when
 * it has properties, with its interfaces as supertypes and any nested schemas
 * in its body.
 */
export function pojoFrag(schema: CodegenObjectSchema, ctx: KotlinModelContext): string {
	const parents: string[] = []
	if (schema.parents) {
		for (const parent of schema.parents) {
			if (parent.nativeType.parentType) {
				parents.push(parent.nativeType.parentType)
			}
		}
	}
	if (schema.implements) {
		for (const implemented of schema.implements) {
			if (implemented.nativeType.parentType) {
				parents.push(implemented.nativeType.parentType)
			}
		}
	}
	if (ctx.root.isJavaSerializable) {
		parents.push('java.io.Serializable')
	}
	const parentsList = parents.join(', ')

	let declaration = `${schema.properties ? 'data ' : ''}class ${schema.name}`
	if (schema.properties) {
		declaration += ts`(

    ${propertiesConstructor(schema, ctx)}

)`
	}
	if (parentsList) {
		declaration += ` : ${parentsList}`
	}
	if (schema.schemas) {
		declaration += ts` {

    ${nestedSchemas(schema, ctx)}
}`
	}

	return ts`
${schemaDocumentation(schema)}
${when(schema.deprecated, '@kotlin.Deprecated(message = "This class is deprecated.")')}
@kotlinx.serialization.Serializable
${declaration}`
}
