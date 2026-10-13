import { CodegenEnumSchema, CodegenHierarchySchema, CodegenInterfaceSchema, CodegenObjectSchema, CodegenOneOfSchema } from '@openapi-generator-plus/types'
import { ts } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from './types'
import { generatedBy } from './frag/generatedBy'
import { enumFrag } from './frag/enum'
import { interfaceFrag } from './frag/interface'
import { pojoFrag } from './frag/pojo'
import { oneOfFrag } from './frag/oneOf'

/** The file header and package declaration common to every model source file. */
function modelFile(content: string, ctx: KotlinModelContext): string {
	return ts`
/*
 * ${generatedBy(ctx.root)}
 */

package ${ctx.root.modelPackage}

import kotlinx.serialization.serializer

${content}
`
}

/** A model source file for an object schema. */
export function pojo(schema: CodegenObjectSchema, ctx: KotlinModelContext): string {
	return modelFile(pojoFrag(schema, ctx), ctx)
}

/** A model source file for an enum schema. */
export function enumModel(schema: CodegenEnumSchema, ctx: KotlinModelContext): string {
	return modelFile(enumFrag(schema, ctx), ctx)
}

/** A model source file for an interface schema. */
export function interfaceModel(schema: CodegenInterfaceSchema, ctx: KotlinModelContext): string {
	return modelFile(interfaceFrag(schema, ctx), ctx)
}

/** A model source file for a hierarchy schema. */
export function hierarchy(schema: CodegenHierarchySchema, ctx: KotlinModelContext): string {
	return modelFile(oneOfFrag(schema, ctx), ctx)
}

/** A model source file for a oneOf schema. */
export function oneOf(schema: CodegenOneOfSchema, ctx: KotlinModelContext): string {
	return modelFile(oneOfFrag(schema, ctx), ctx)
}
