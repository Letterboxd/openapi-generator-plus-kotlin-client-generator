import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import { CodegenConfig } from '@openapi-generator-plus/types'
import { CodegenResult, createCodegenResult } from '@openapi-generator-plus/testing'
import createGenerator from '..'

export const DEFAULT_CONFIG: CodegenConfig = {
	package: 'com.example.kotlin.api',
	gradle: {
		groupId: 'com.example.kotlin.api',
	},
}

export async function prepare(spec: string, config?: CodegenConfig): Promise<CodegenResult> {
	return createCodegenResult(path.resolve(__dirname, spec), config || DEFAULT_CONFIG, createGenerator)
}

/** Run Gradle with `args` in the project at `basePath`. */
function gradle(args: string, basePath: string): Promise<void> {
	return new Promise(function(resolve, reject) {
		exec(
			`gradle ${args}`,
			{
				cwd: basePath,
				maxBuffer: 1024 * 1024 * 32,
			},
			function(error, stdout, stderr) {
				if (error) {
					reject(new Error(`${error.cmd || '<unknown>'} exited with code ${error.code || 'unknown'}:\n ${stdout}\n${stderr}`))
				} else {
					resolve()
				}
			}
		)
	})
}

/** Build the generated Gradle project at `basePath`. */
export async function build(basePath: string): Promise<void> {
	return gradle('build', basePath)
}

/**
 * Add the Kotlin source file `source` to the generated Gradle project at `basePath`, then build the
 * project and run the `main` function in `mainClass`. Fails when the build fails, or when `main`
 * throws.
 */
export async function runKotlinMain(basePath: string, source: string, mainClass: string): Promise<void> {
	const target = path.join(basePath, 'src', 'main', 'kotlin', 'check')
	await fs.promises.mkdir(target, { recursive: true })
	await fs.promises.copyFile(path.resolve(__dirname, source), path.join(target, path.basename(source)))
	await fs.promises.appendFile(path.join(basePath, 'build.gradle.kts'), `

tasks.register<JavaExec>("check${path.basename(source, '.kt')}") {
    classpath = sourceSets["main"].runtimeClasspath
    mainClass.set("${mainClass}")
}
`)
	await gradle(`-q --console=plain check${path.basename(source, '.kt')}`, basePath)
}
