import { testGenerate } from '@openapi-generator-plus/generator-common/dist/testing'
import { CodegenConfig } from '@openapi-generator-plus/types'
import fs from 'fs'
import path from 'path'
import { prepare } from './common'

const SPEC = 'fixtures/url-format.yml'

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

/** Generate the fixture with the given config and return a reader for the generated files. */
async function generate(testName: string, config: CodegenConfig, spec = SPEC): Promise<(name: string) => string> {
	const result = await prepare(spec, { package: 'com.example.api', ...config })
	let base = ''
	await testGenerate(result, {
		testName: `options-${testName}`,
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

describe('urlImplementation', () => {
	test('defaults to java.net.URL', async() => {
		const read = await generate('url-default', {})
		const serializer = read('URLSerializer.kt')
		expect(serializer).toContain('KSerializer<java.net.URL>')
		expect(serializer).toContain('java.net.URL(decoder.decodeString())')
		expect(read('Thing.kt')).toContain('java.net.URL')
	})

	test('string form sets the type, constructed via its constructor', async() => {
		const read = await generate('url-string', { urlImplementation: 'java.net.URI' })
		const serializer = read('URLSerializer.kt')
		expect(serializer).toContain('KSerializer<java.net.URI>')
		expect(serializer).toContain('java.net.URI(decoder.decodeString())')
	})

	test('object form sets the type and fromString expression', async() => {
		const read = await generate('url-object', {
			urlImplementation: { type: 'android.net.Uri', fromString: 'android.net.Uri.parse' },
		})
		const serializer = read('URLSerializer.kt')
		expect(serializer).toContain('KSerializer<android.net.Uri>')
		expect(serializer).toContain('android.net.Uri.parse(decoder.decodeString())')
		expect(read('Thing.kt')).toContain('android.net.Uri')
	})
})

describe('gradle injection', () => {
	test('appends plugins and dependencies verbatim', async() => {
		const read = await generate('gradle-inject', {
			gradle: {
				groupId: 'com.example',
				plugins: ['alias(libs.plugins.android.library)'],
				dependencies: ['compileOnly("com.google.android:android:4.1.1.4")'],
			},
		})
		const gradle = read('build.gradle.kts')
		expect(gradle).toContain('alias(libs.plugins.android.library)')
		expect(gradle).toContain('compileOnly("com.google.android:android:4.1.1.4")')
	})
})

describe('android', () => {
	test('generates an Android library module', async() => {
		const read = await generate('android-module', {
			gradle: { groupId: 'com.letterboxd.api' },
			android: { compileSdk: 36 },
		})
		const gradle = read('build.gradle.kts')
		expect(gradle).toContain('import com.android.build.api.dsl.LibraryExtension')
		expect(gradle).toContain('alias(libs.plugins.android.library)')
		expect(gradle).not.toContain('alias(libs.plugins.kotlin.jvm)')
		expect(gradle).toContain('configure<LibraryExtension>')
		expect(gradle).toContain('namespace = "com.letterboxd.api"')
		expect(gradle).toContain('compileSdk = 36')
	})

	test('throws when gradle is not configured', async() => {
		await expect(prepare(SPEC, {
			package: 'com.example.api',
			android: { compileSdk: 36 },
		})).rejects.toThrow(/requires the "gradle" option/)
	})
})

describe('enumMemberStyle', () => {
	test('defaults to constant names, without the option', async() => {
		const read = await generate('enum-member-style-default', {}, 'fixtures/free-form.yml')
		expect(read('Status.kt')).toContain('data object Active : Status()')
	})
})

describe('enum members', () => {
	test('never match a nested class of the enum in any case', async() => {
		const read = await generate('enum-case', { enumMemberStyle: 'constant' }, 'fixtures/enum-case.yml')
		const names = [...read('Thing.kt').matchAll(/(?:data object|data class|object) (\w+)/g)].map(match => match[1])
		const lowerCase = names.map(name => name.toLowerCase())
		expect(new Set(lowerCase).size).toBe(lowerCase.length)
		expect(names).toContain('KNOWN')
	})
})

describe('request builders', () => {
	test('keep the API class free of request customisation', async() => {
		const read = await generate('request-builder-api', {}, 'fixtures/request-builder.yml')
		const api = read('ThingsApi.kt')
		expect(api).not.toContain('HttpRequestBuilder')
		expect(api).toContain('open suspend fun getThings(cursor: kotlin.String? = null, perPage: kotlin.Int? = null, allowsReauth: kotlin.Boolean = true): Result<GetThingsResponseStatus>')
		expect(api).toContain('this.apiRequestBuilder.getThings(cursor = cursor, perPage = perPage).execute(allowsReauth = allowsReauth)')
	})

	test('make an APIRequest for each operation, which the retry after reauthenticating customises again', async() => {
		const read = await generate('request-builder', {}, 'fixtures/request-builder.yml')
		const builder = read('ThingsApiRequestBuilder.kt')
		const apiRequest = 'com.example.api.support.APIRequest<ThingsApi.GetThingsResponseStatus>'
		expect(builder).toContain('class ThingsApiRequestBuilder(')
		expect(builder).toContain(`fun getThings(cursor: kotlin.String? = null, perPage: kotlin.Int? = null): ${apiRequest}`)
		expect(builder).toContain(`fun getThings(queryParams: ThingsApi.IGetThingsQueryParams): ${apiRequest}`)
		expect(builder).toContain('private suspend fun performGetThings(')
		expect(builder).toContain('allowsReauth = false, customizeRequest = customizeRequest)')
		expect(read('APIRequest.kt')).toContain('fun customize(block: io.ktor.client.request.HttpRequestBuilder.() -> Unit): APIRequest<T>')
	})

	test('apply customisations after the parameters, and before security and finalizeRequestBlock', async() => {
		const read = await generate('request-builder-order', {}, 'fixtures/request-builder.yml')
		const builder = read('ThingsApiRequestBuilder.kt')
		const parameters = builder.indexOf('this.url.parameters.append(')
		const customise = builder.indexOf('customizeRequest()')
		const security = builder.indexOf('// Set request authentication')
		const finalize = builder.indexOf('configuration.finalizeRequestBlock?.invoke(this)')
		expect(parameters).toBeGreaterThan(-1)
		expect(customise).toBeGreaterThan(parameters)
		expect(security).toBeGreaterThan(customise)
		expect(finalize).toBeGreaterThan(security)
	})
})
