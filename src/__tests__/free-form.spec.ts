import { testGenerate } from '@openapi-generator-plus/generator-common/dist/testing'
import fs from 'fs'
import path from 'path'
import { DEFAULT_CONFIG, prepare, runKotlinMain } from './common'

const SPEC = 'fixtures/free-form.yml'

/** The text of the generated model named `name`, in the project at `basePath`. */
function model(basePath: string, name: string): string {
	return fs.readFileSync(path.join(basePath, 'src', 'main', 'kotlin', 'com', 'example', 'kotlin', 'api', 'model', `${name}.kt`), 'utf8')
}

describe('free-form objects', () => {
	test('keep their JSON when decoded and encoded', async() => {
		const result = await prepare(SPEC, DEFAULT_CONFIG)
		await testGenerate(result, {
			testName: 'free-form',
			postProcess: async(basePath) => {
				const holder = model(basePath, 'Holder')
				/* A map of any values uses JsonElement, which needs no contextual serializer */
				expect(holder).not.toContain('kotlin.Any')
				expect(holder).toContain('val body: kotlin.collections.Map<kotlin.String, kotlinx.serialization.json.JsonElement>')
				expect(holder).toContain('val anything: kotlinx.serialization.json.JsonElement? = null')
				/* An object that describes no properties holds its members */
				expect(model(basePath, 'FreeForm')).toContain('val additionalProperties: kotlin.collections.Map<kotlin.String, kotlinx.serialization.json.JsonElement> = emptyMap()')

				await runKotlinMain(basePath, 'fixtures/FreeFormCheck.kt', 'check.FreeFormCheckKt')
			},
		})
	})
})
