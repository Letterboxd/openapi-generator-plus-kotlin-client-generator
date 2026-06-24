import { JavaLikeOptions } from '@openapi-generator-plus/java-like-generator-helper'

/**
 * Options specific to the template that the user can provide to the code generation process.
 */
export interface CodegenOptionsKotlin extends JavaLikeOptions {
	apiPackage: string
	modelPackage: string
	supportPackage: string
	securityPackage: string

	relativeSourceOutputPath: string
	customTemplatesPath: string | null
	hideGenerationTimestamp: boolean

	dateImplementation: string
	timeImplementation: string
	dateTimeImplementation: string
	binaryRepresentation: string

	/** The Kotlin type to use for the `url` string format (e.g. `java.net.URL`, `java.net.URI`, `android.net.Uri`). */
	urlImplementation: string
	/** An expression that constructs the {@link urlImplementation} type from a `String` argument (e.g. `java.net.URL`, `android.net.Uri.parse`). */
	urlFromString: string

	isJavaSerializable: boolean

	gradle: GradleOptions | null
	android: AndroidOptions | null
}

/**
 * When present, the generated `build.gradle.kts` is produced as an Android library module
 * (rather than a `kotlin("jvm")` library), so Android SDK types such as `android.net.Uri`
 * resolve natively.
 */
export interface AndroidOptions {
	/** The plugin declaration that replaces `alias(libs.plugins.kotlin.jvm)` in the `plugins { }` block, e.g. `alias(libs.plugins.android.library)`. */
	plugin: string
	/** The `compileSdk` value, inserted verbatim, e.g. `libs.versions.android.compileSdk.get().toInt()` or `35`. */
	compileSdk: string
	/** The Android `namespace`. Defaults to the Gradle `groupId`. */
	namespace: string
}

export interface GradleOptions {
	groupId: string
	version: string
	versions: {
		[name: string]: unknown
	}
	/** Extra lines to append verbatim to the generated `build.gradle.kts` `plugins { }` block, e.g. `alias(libs.plugins.android.library)`. */
	plugins: string[]
	/** Extra lines to append verbatim to the generated `build.gradle.kts` `dependencies { }` block, e.g. `compileOnly("com.google.android:android:4.1.1.4")`. */
	dependencies: string[]
}
