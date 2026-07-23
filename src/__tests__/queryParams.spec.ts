import { testGenerate } from '@openapi-generator-plus/generator-common/dist/testing'
import fs from 'fs'
import path from 'path'
import { prepare } from './common'

/** Recursively find the first generated file whose name ends with `suffix`. */
function findFileEndingWith(dir: string, suffix: string): string | undefined {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const entryPath = path.join(dir, entry.name)
		if (entry.isDirectory()) {
			const found = findFileEndingWith(entryPath, suffix)
			if (found) {
				return found
			}
		} else if (entry.name.endsWith(suffix)) {
			return entryPath
		}
	}
	return undefined
}

async function generateApi(fixture: string, testName: string): Promise<string> {
	const result = await prepare(fixture, { package: 'com.example.api' })
	let base = ''
	await testGenerate(result, {
		testName,
		postProcess: async(basePath) => {
			base = basePath
		},
	})
	const api = findFileEndingWith(base, 'Api.kt')
	if (!api) {
		throw new Error('No generated Api.kt file found')
	}
	return fs.readFileSync(api, 'utf8')
}

describe('query params map helpers', () => {
	let api: string
	beforeAll(async() => {
		api = await generateApi('fixtures/query-params.yml', 'query-params')
	})

	test('the parameters bundle is named ...Params, not ...QueryParams', () => {
		expect(api).toContain('data class GetPetParams(')
		expect(api).toContain('interface IGetPetParams')
		expect(api).not.toContain('QueryParams')
	})

	test('toQueryMap serializes only query params, keyed by their API names', () => {
		expect(api).toContain('fun toQueryMap(): kotlin.collections.Map<kotlin.String, kotlin.collections.List<kotlin.String>>')
		expect(api).toContain('tags?.forEach { result.getOrPut("tags") { mutableListOf() }.add("$it") }')
		expect(api).toContain('limit?.let { result.getOrPut("limit") { mutableListOf() }.add("$it") }')
		expect(api).toContain('status?.let { result.getOrPut("status") { mutableListOf() }.add("$it") }')
		/* Path and header params must NOT appear in the query map. */
		expect(api).not.toContain('result.getOrPut("petId")')
		expect(api).not.toContain('result.getOrPut("X-Token")')
	})

	test('withQuery overrides query params from the map, parsing to their types', () => {
		expect(api).toContain('fun withQuery(query: kotlin.collections.Map<kotlin.String, kotlin.collections.List<kotlin.String>>): GetPetParams = copy(')
		/* String array: no per-element parsing, taken verbatim. */
		expect(api).toContain('tags = query["tags"] ?: this.tags')
		/* Scalar Int: firstOrNull + toInt. */
		expect(api).toContain('limit = query["limit"]?.firstOrNull()?.let { it.toInt() } ?: this.limit')
		/* Enum: valueOf. */
		expect(api).toContain('status = query["status"]?.firstOrNull()?.let { com.example.api.model.Status.valueOf(it) } ?: this.status')
		/* Path/header params are not part of the query override (carried over by copy()). */
		expect(api).not.toContain('petId = query[')
		expect(api).not.toContain('xToken = query[')
	})

	test('a map constructor takes non-query args plus a query map', () => {
		/* The secondary constructor's explicit args are the non-query params only. */
		expect(api).toContain('constructor(')
		expect(api).toMatch(/constructor\(\s*petId: kotlin\.String,\s*xToken: kotlin\.String\? = null,\s*query: kotlin\.collections\.Map<kotlin\.String, kotlin\.collections\.List<kotlin\.String>>,\s*\) : this\(/)
	})

	test('required query params throw when absent, optional ones do not', () => {
		/* Required scalar query param: requireNotNull with a message naming the parameter. */
		expect(api).toContain('q = requireNotNull(query["q"]?.firstOrNull()) { "Missing required query parameter \\"q\\"" }')
		/* Optional query params are read without requireNotNull. */
		expect(api).toContain('tags = query["tags"],')
		expect(api).toContain('limit = query["limit"]?.firstOrNull()?.let { it.toInt() },')
		/* Non-query args are passed straight through. */
		expect(api).toContain('petId = petId,')
		expect(api).toContain('xToken = xToken,')
	})

	test('the @throws doc is present when a required query param can throw', () => {
		expect(api).toContain('@throws IllegalArgumentException if a required query parameter is absent from [query].')
	})

	test('the bundle-arg overload delegates via params.', () => {
		expect(api).toContain('open suspend fun getPet(params: IGetPetParams)')
		expect(api).toContain('petId = params.petId')
	})
})

describe('query params map helpers with only optional query params', () => {
	let api: string
	beforeAll(async() => {
		api = await generateApi('fixtures/query-params-optional.yml', 'query-params-optional')
	})

	test('the map constructor is still generated', () => {
		expect(api).toContain('constructor(')
		expect(api).toContain('limit = query["limit"]?.firstOrNull()?.let { it.toInt() },')
	})

	test('the @throws doc is omitted when the constructor cannot throw', () => {
		/* No required query param, so no requireNotNull and nothing to document. */
		expect(api).not.toContain('requireNotNull')
		expect(api).not.toContain('@throws IllegalArgumentException')
	})
})
