import { testGenerate } from '@openapi-generator-plus/generator-common/dist/testing'
import fs from 'fs'
import path from 'path'
import { prepare } from './common'

const SPEC = 'fixtures/request-overloads.yml'

function findFile(dir: string, name: string): string | undefined {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const entryPath = path.join(dir, entry.name)
		if (entry.isDirectory()) {
			const found = findFile(entryPath, name)
			if (found) {
				return found
			}
		} else if (entry.name === name) {
			return entryPath
		}
	}
	return undefined
}

async function generate(): Promise<(name: string) => string> {
	const result = await prepare(SPEC, { package: 'com.example.api' })
	let base = ''
	await testGenerate(result, {
		testName: 'request-overloads',
		postProcess: async(basePath) => {
			base = basePath 
		},
	})
	return (name: string) => {
		const file = findFile(base, name)
		if (!file) {
			throw new Error(`Generated file not found: ${name}`)
		}
		return fs.readFileSync(file, 'utf8')
	}
}

describe('request builder overload', () => {
	test('adds an optional trailing modifyRequest lambda to the standard method that runs after query params', async() => {
		const api = (await generate())('ItemsApi.kt')

		/* A single method with the typed params plus an optional trailing modifyRequest lambda */
		expect(api).toContain('open suspend fun listItems(q: kotlin.String? = null, allowsReauth: kotlin.Boolean = true, modifyRequest: io.ktor.client.request.HttpRequestBuilder.() -> Unit = {}): Result<ListItemsResponseStatus>')
		/* Query params are appended, then the caller's lambda runs after them */
		const query = api.indexOf('parameters.append("q", "$it")')
		const modifyCall = api.indexOf('modifyRequest()', query)
		expect(query).toBeGreaterThanOrEqual(0)
		expect(modifyCall).toBeGreaterThan(query)
	})

	test('the modifyRequest lambda runs after the body is set, and path params stay typed', async() => {
		const api = (await generate())('ItemsApi.kt')

		/* A single method: typed path param + typed body + optional trailing modifyRequest lambda */
		expect(api).toContain('open suspend fun createItem(id: kotlin.String, requestBody: com.example.api.model.Item, allowsReauth: kotlin.Boolean = true, modifyRequest: io.ktor.client.request.HttpRequestBuilder.() -> Unit = {}): Result<CreateItemResponseStatus>')
		/* Path substitution still happens */
		expect(api).toContain('.replace("{id}", "$id")')
		/* The body is set, then the caller's lambda runs after it */
		const setBody = api.indexOf('setBody(requestBody)')
		const modifyCall = api.indexOf('modifyRequest()', setBody)
		expect(setBody).toBeGreaterThanOrEqual(0)
		expect(modifyCall).toBeGreaterThan(setBody)
	})

	test('generates a single method per operation (no same-signature overload)', async() => {
		const api = (await generate())('ItemsApi.kt')

		const count = (needle: string) => api.split(needle).length - 1
		expect(count('open suspend fun listItems(')).toBe(1)
		expect(count('open suspend fun createItem(')).toBe(1)
	})
})
