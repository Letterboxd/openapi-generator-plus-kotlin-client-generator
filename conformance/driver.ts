import { promises as fs } from 'fs'
import * as path from 'path'
import type { ConformanceDriver } from '@openapi-generator-plus/client-conformance/dist/drivers'
import { run, shellArgument } from '@openapi-generator-plus/client-conformance/dist/drivers'
import type { ConformanceSuite } from '@openapi-generator-plus/client-conformance/dist/types'

/** The package of the driver sources in the generated project. */
const DRIVER_PACKAGE = 'conformance'

/** The file that holds the scaffold that each suite's entry file builds on. */
const HARNESS = 'harness.kt'

/** The Gradle task that runs the driver. */
const DRIVER_TASK = 'conformance'

/**
 * The class that Kotlin compiles the top-level `main` of `suite`'s entry file into: the suite id in
 * upper camel case, then `Kt`. So the `conformance` suite runs `conformance.ConformanceKt`.
 */
function mainClass(suite: ConformanceSuite): string {
	const upperCamel = suite.id.replace(/(^|-)([a-z])/g, (_match, _separator, letter: string) => letter.toUpperCase())
	return `${DRIVER_PACKAGE}.${upperCamel}Kt`
}

/**
 * The conformance driver for a generated Kotlin project.
 *
 * `install` puts the driver sources into the project's own sources, so `gradle` checks the driver
 * against the generated API. The suite's entry file in this directory, named after the suite id,
 * holds the driver's `main`. `install` also adds a `JavaExec` task to the generated
 * `build.gradle.kts` that runs it with the project's runtime classpath.
 *
 * The generated project must use the package `com.example.kotlin.api`, and must be generated with
 * the `gradle` option.
 */
export const kotlinDriver: ConformanceDriver = {
	name: 'kotlin',
	async install(basePath, suite) {
		const target = path.join(basePath, 'src', 'main', 'kotlin', DRIVER_PACKAGE)
		await fs.mkdir(target, { recursive: true })
		await fs.copyFile(path.join(__dirname, HARNESS), path.join(target, HARNESS))
		await fs.copyFile(path.join(__dirname, `${suite.id}.kt`), path.join(target, `${suite.id}.kt`))

		/* A build script is Kotlin code, so a statement at its end can add a task to the project */
		await fs.appendFile(path.join(basePath, 'build.gradle.kts'), `

tasks.register<JavaExec>("${DRIVER_TASK}") {
    classpath = sourceSets["main"].runtimeClasspath
    mainClass.set("${mainClass(suite)}")
    args(providers.gradleProperty("conformanceBaseUrl").get(), providers.gradleProperty("conformanceResultsPath").get())
}
`)
	},
	async run(basePath, _suite, baseUrl, resultsPath) {
		await run(`gradle -q --console=plain ${DRIVER_TASK} ${shellArgument(`-PconformanceBaseUrl=${baseUrl}`)} ${shellArgument(`-PconformanceResultsPath=${resultsPath}`)}`, basePath)
	},
}
