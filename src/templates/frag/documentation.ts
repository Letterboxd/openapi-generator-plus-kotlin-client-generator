import { CodegenExternalDocs, CodegenOperation } from '@openapi-generator-plus/types'
import { md, joinLines, Skip, SKIP, ts, maybe, when } from '@openapi-generator-plus/template-utils'
import { indentContinuation } from '../helpers'

interface Documented {
	description?: string | null
	externalDocs?: CodegenExternalDocs | null
}

/**
 * A KDoc comment for a schema: its description rendered as Markdown, plus any
 * external documentation. Returns SKIP when there is nothing to document.
 */
export function schemaDocumentation(target: Documented): string | Skip {
	const description = target.description || null
	const externalDocs = target.externalDocs || null
	if (!description && !externalDocs) {
		return SKIP
	}
	return ts`
/**
${maybe(description, d => ` * ${indentContinuation(md(d), ' * ')}`)}
${when(externalDocs, () => ts`
 * <p>External documentation: ${externalDocs!.url}</p>
${maybe(externalDocs!.description, d => ` * ${indentContinuation(d, ' * ')}`)}`)}
 */`
}

/**
 * A KDoc comment for an operation: its summary and description (verbatim, not
 * rendered as Markdown), plus any external documentation. Returns SKIP when
 * there is nothing to document.
 */
export function operationDocumentation(operation: CodegenOperation): string | Skip {
	const summary = operation.summary || null
	const description = operation.description || null
	const externalDocs = operation.externalDocs || null
	if (!summary && !description && !externalDocs) {
		return SKIP
	}
	return ts`
/**
${maybe(summary, s => ` * ${indentContinuation(s, ' * ')}`)}
${maybe(description, d => ` * ${indentContinuation(d, ' * ')}`)}
${when(externalDocs, () => ts`
 * <p>External documentation: ${externalDocs!.url}</p>
${maybe(externalDocs!.description, d => ` * ${indentContinuation(d, ' * ')}`)}`)}
 */`
}

/**
 * A single-line KDoc comment for a property or parameter, built from its
 * description with blank lines removed. Returns SKIP when there is no
 * description.
 */
export function propertyDocumentation(target: { description?: string | null }): string | Skip {
	const description = target.description ? joinLines(target.description, '\n') : ''
	if (!description) {
		return SKIP
	}
	return `/** ${description} */`
}
