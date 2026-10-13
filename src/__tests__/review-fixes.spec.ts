import { testGenerate } from '@openapi-generator-plus/generator-common/dist/testing'
import { DEFAULT_CONFIG, prepare, runKotlinMain } from './common'

const SPEC = 'fixtures/review-fixes.yml'

describe('parameter styles, response headers and oneOf members', () => {
	test('compile, and go on the wire as the specification declares them', async() => {
		const result = await prepare(SPEC, DEFAULT_CONFIG)
		await testGenerate(result, {
			testName: 'review-fixes',
			postProcess: async(basePath) => {
				await runKotlinMain(basePath, 'fixtures/ReviewFixesCheck.kt', 'check.ReviewFixesCheckKt')
			},
		})
	})
})
