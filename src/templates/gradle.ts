import { each, ts, when } from '@openapi-generator-plus/template-utils'
import { GradleOptions } from '../types'
import { KotlinModelContext } from './types'
import { generatedBy } from './frag/generatedBy'

/** The generated `build.gradle.kts`: a Kotlin JVM library, or an Android library when the `android` option is configured. */
export function buildGradleKts(gradle: GradleOptions, ctx: KotlinModelContext): string {
	const root = ctx.root
	const android = root.android

	return ts`
/*
 * ${generatedBy(root)}
 */
${when(android, () => ts`

import com.android.build.api.dsl.LibraryExtension`)}

plugins {
    ${android ? android.plugin : 'alias(libs.plugins.kotlin.jvm)'}
    alias(libs.plugins.kotlin.serialization)
    ${each(gradle.plugins, plugin => plugin, '\n')}
}

group = "${gradle.groupId}"
version = "${gradle.version}"
${when(android, () => ts`


configure<LibraryExtension> {
    namespace = "${android!.namespace}"
    compileSdk = ${android!.compileSdk}
}`)}

dependencies {
    api(libs.ktor.client.core)
    implementation(libs.ktor.client.okhttp)
    implementation(libs.ktor.client.content.negotiation)
    implementation(libs.ktor.serialization.kotlinx.json)
    api(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.datetime)
    ${each(gradle.dependencies, dependency => dependency, '\n')}
}`
}

/** The generated `settings.gradle.kts`, emitted only when one does not already exist. */
export function settingsGradleKts(): string {
	return ts`
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}`
}

/** The generated `gradle/libs.versions.toml` version catalog, emitted only when one does not already exist. */
export function libsVersionsToml(): string {
	return ts`
[versions]
kotlin = "2.4.21"
kotlinx-datetime = "0.8.0"
kotlinx-serialization = "1.11.0"
ktor = "3.6.0"

[libraries]
kotlinx-datetime = { module = "org.jetbrains.kotlinx:kotlinx-datetime", version.ref = "kotlinx-datetime" }
kotlinx-serialization-json = { module = "org.jetbrains.kotlinx:kotlinx-serialization-json", version.ref = "kotlinx-serialization" }
ktor-client-content-negotiation = { module = "io.ktor:ktor-client-content-negotiation", version.ref = "ktor" }
ktor-client-core = { module = "io.ktor:ktor-client-core", version.ref = "ktor" }
ktor-client-okhttp = { module = "io.ktor:ktor-client-okhttp", version.ref = "ktor" }
ktor-serialization-kotlinx-json = { module = "io.ktor:ktor-serialization-kotlinx-json", version.ref = "ktor" }

[plugins]
kotlin-jvm = { id = "org.jetbrains.kotlin.jvm", version.ref = "kotlin" }
kotlin-serialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin" }`
}
