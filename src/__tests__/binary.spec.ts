import { testGenerate } from '@openapi-generator-plus/generator-common/dist/testing'
import { build, DEFAULT_CONFIG, prepare } from './common'

describe('binaryRepresentation', () => {
	test('reads and sends a binary body of another type', async() => {
		const result = await prepare('fixtures/binary.yml', { ...DEFAULT_CONFIG, binaryRepresentation: 'java.io.InputStream' })
		await testGenerate(result, { testName: 'binary-input-stream', postProcess: build })
	})
})
