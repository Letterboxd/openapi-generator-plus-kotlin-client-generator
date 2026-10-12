import { CodegenExternalDocs, CodegenOperation } from '@openapi-generator-plus/types'
import { md, joinLines, Skip, SKIP, ts, maybe, when } from '@openapi-generator-plus/template-utils'
import { indentContinuation } from '../helpers'

/**
 * `text` made safe to put in a KDoc comment. Kotlin comments nest, so a slash and star would open a
 * comment inside it, and a star and slash would end it.
 */
function commentText(text: string): string {
	return text.replace(/\/\*/g, '/&#42;').replace(/\*\//g, '*&#47;')
}

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
${maybe(description, d => ` * ${indentContinuation(commentText(md(d)), ' * ')}`)}
${when(externalDocs, () => ts`
 * <p>External documentation: ${commentText(externalDocs!.url)}</p>
${maybe(externalDocs!.description, d => ` * ${indentContinuation(commentText(d), ' * ')}`)}`)}
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
${maybe(summary, s => ` * ${indentContinuation(commentText(s), ' * ')}`)}
${maybe(description, d => ` * ${indentContinuation(commentText(d), ' * ')}`)}
${when(externalDocs, () => ts`
 * <p>External documentation: ${commentText(externalDocs!.url)}</p>
${maybe(externalDocs!.description, d => ` * ${indentContinuation(commentText(d), ' * ')}`)}`)}
 */`
}

/**
 * A single-line KDoc comment for a property, a parameter or a response, built from its
 * description with its lines joined. Returns SKIP when there is no description.
 */
export function propertyDocumentation(target: { description?: string | null }): string | Skip {
	const description = target.description ? commentText(joinLines(target.description, ' ')) : ''
	if (!description) {
		return SKIP
	}
	return `/** ${description} */`
}
