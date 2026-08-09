import { CodegenSchema, CodegenSchemas, isCodegenEnumSchema, isCodegenInterfaceSchema, isCodegenObjectSchema, isCodegenOneOfSchema } from '@openapi-generator-plus/types'
import * as idx from '@openapi-generator-plus/indexed-type'
import { each, Skip, SKIP } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { enumFrag } from './enum'
import { interfaceFrag } from './interface'
import { pojoFrag } from './pojo'
import { oneOfFrag } from './oneOf'

/**
 * The schemas nested within a scope, each rendered in full and separated by
 * blank lines, ending with a trailing newline so the scope's closing brace
 * falls on its own line. Returns SKIP when the scope has nothing nested.
 */
export function nestedSchemas(scope: { schemas: CodegenSchemas | null }, ctx: KotlinModelContext): string | Skip {
	const schemas = scope.schemas ? idx.allValues(scope.schemas) : []
	const rendered = each(schemas, (schema: CodegenSchema) => {
		if (isCodegenEnumSchema(schema)) {
			return enumFrag(schema, ctx)
		} else if (isCodegenInterfaceSchema(schema)) {
			return interfaceFrag(schema, ctx)
		} else if (isCodegenObjectSchema(schema)) {
			return pojoFrag(schema, ctx)
		} else if (isCodegenOneOfSchema(schema)) {
			return oneOfFrag(schema, ctx)
		} else {
			return SKIP
		}
	}, '\n\n')
	if (typeof rendered !== 'string') {
		return SKIP
	}
	return `${rendered}\n`
}
