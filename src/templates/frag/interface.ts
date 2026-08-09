import { CodegenInterfaceSchema } from '@openapi-generator-plus/types'
import { each, ts, when } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { propertyValues } from '../helpers'
import { propertyDocumentation, schemaDocumentation } from './documentation'
import { nestedSchemas } from './nestedSchemas'

/** An interface schema rendered as a sealed interface with abstract properties. */
export function interfaceFrag(schema: CodegenInterfaceSchema, ctx: KotlinModelContext): string {
	return ts`
${schemaDocumentation(schema)}
sealed interface ${schema.name} {${each(propertyValues(schema.properties), p => '\n' + ts`

    ${propertyDocumentation(p)}
    ${when(p.deprecated, '@kotlin.Deprecated(message = "This property is deprecated.")')}
    val ${p.name}: ${p.nativeType}`)}

    ${nestedSchemas(schema, ctx)}
}`
}
