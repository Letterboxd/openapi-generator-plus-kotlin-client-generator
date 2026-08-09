import { CodegenOperation } from '@openapi-generator-plus/types'
import { each, ts, undefinedValueLiteral } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { parameterValues } from '../helpers'
import { propertyDocumentation } from './documentation'

/**
 * The query-parameters holder for an operation with multiple parameters: an
 * interface of the parameters and a data class implementing it with defaults
 * for optional parameters.
 */
export function parametersStruct(operation: CodegenOperation, queryParamsClassName: string, ctx: KotlinModelContext): string {
	const parameters = parameterValues(operation.parameters)
	return ts`
interface I${queryParamsClassName}{
${each(parameters, p => ts`
    ${propertyDocumentation(p)}
    val ${p.name}: ${p.nativeType}`, '\n')}
}

data class ${queryParamsClassName}(
${each(parameters, p => ts`
    ${propertyDocumentation(p)}
    override val ${p.name}: ${p.nativeType}${p.required ? '' : ` = ${undefinedValueLiteral(ctx.generatorContext, p.schema)}`},`, '\n')}
) : I${queryParamsClassName}`
}
