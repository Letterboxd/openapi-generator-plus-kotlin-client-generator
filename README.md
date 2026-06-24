# OpenAPI Generator Plus Kotlin Client Generator

This generator uses [Kotlin Serialization](https://kotlinlang.org/docs/serialization.html), Ktor and OkHttp.

## Configuration options

These options can be supplied in your `config.yml` (or equivalent) under the generator configuration.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `package` | string | `com.example` | Base package for generated code. |
| `apiPackage` | string | `package` | Package for the generated `*Api` classes. |
| `modelPackage` | string | `{package}.model` | Package for the generated model classes. |
| `supportPackage` | string | `{package}.support` | Package for the generated support classes (serializers, configuration, etc.). |
| `securityPackage` | string | `{package}.security` | Package for the generated security classes. |
| `customTemplates` | string | _(none)_ | Path (relative to the config file) to a directory of custom Handlebars templates that override the built-in ones. |
| `hideGenerationTimestamp` | boolean | `false` | Omit the generation timestamp from the generated code. |
| `dateImplementation` | string | `{supportPackage}.LocalDate` | Kotlin type used for the `date` string format. |
| `timeImplementation` | string | `{supportPackage}.LocalTime` | Kotlin type used for the `time` string format. |
| `dateTimeImplementation` | string | `{supportPackage}.Instant` | Kotlin type used for the `date-time` string format. |
| `binaryRepresentation` | string | `kotlin.ByteArray` | Kotlin type used for binary / file data. |
| `urlImplementation` | string \| object | `java.net.URL` | Kotlin type used for the `url` string format. See [URL implementation](#url-implementation) below. |
| `isJavaSerializable` | boolean | `true` | Make generated models implement `java.io.Serializable`. |
| `gradle` | object | _(none)_ | When present, generate `build.gradle.kts`, `settings.gradle.kts` and `gradle/libs.versions.toml`. See [Gradle](#gradle) below. |
| `android` | object | _(none)_ | When present, generate `build.gradle.kts` as an Android library module instead of a `kotlin("jvm")` library. See [Android library module](#android-library-module) below. |

### URL implementation

By default, properties with `format: url` are mapped to `java.net.URL`. You can override this with `urlImplementation`.

For types that are constructed directly from a `String` (i.e. via a `Type(string)` constructor) you can pass the type name as a string:

```yaml
urlImplementation: java.net.URI
```

For types that aren't constructed via a `String` constructor — such as `android.net.Uri`, which is created via `Uri.parse(string)` — use the object form and specify `fromString`, the expression used to construct the type from a `String`:

```yaml
urlImplementation:
  type: android.net.Uri
  fromString: android.net.Uri.parse
```

`fromString` defaults to `type`, and the value is always serialized to a `String` via `toString()`.

> **Note:** `android.net.Uri` is part of the Android SDK and is not on the classpath of the default `kotlin("jvm")` module. To compile against it, generate the module as an [Android library module](#android-library-module) (recommended), or — if you want to keep it a plain JVM module — add the Android SDK as a `compileOnly` dependency via [`gradle.dependencies`](#gradle) (its implementation is provided by the Android runtime on-device):
>
> ```yaml
> gradle:
>   dependencies:
>     - compileOnly("com.google.android:android:4.1.1.4")
> ```

### Gradle

When the `gradle` option is present, the generator emits `build.gradle.kts`, `settings.gradle.kts` and `gradle/libs.versions.toml`. The `gradle` object supports:

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `groupId` | string | `com.example` | The Gradle `group`. |
| `version` | string | `0.0.1` | The Gradle `version`. |
| `versions` | object | `{}` | A map of version overrides. |
| `plugins` | string[] | `[]` | Extra lines appended verbatim to the generated `plugins { }` block. |
| `dependencies` | string[] | `[]` | Extra lines appended verbatim to the generated `dependencies { }` block. |

`plugins` and `dependencies` entries are inserted exactly as written, so you can use any Gradle declaration — a version-catalog alias (`implementation(libs.google.android)`) or a literal coordinate (`compileOnly("com.google.android:android:4.1.1.4")`).

> **Note:** `build.gradle.kts` is regenerated on every run, so anything you need in it must come from your config (`gradle.plugins` / `gradle.dependencies`) rather than hand-edits. `settings.gradle.kts` and `gradle/libs.versions.toml` are only generated if they don't already exist.

### Android library module

If your generated types require the Android SDK — for example using `android.net.Uri` for [`urlImplementation`](#url-implementation) — provide an `android` option. The generated `build.gradle.kts` is then produced as an Android library module: the `com.android.library` plugin replaces `alias(libs.plugins.kotlin.jvm)`, and a `configure<LibraryExtension> { … }` block is added. This puts the Android SDK on the classpath, so Android types resolve without a `compileOnly` stub.

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `plugin` | string | `alias(libs.plugins.android.library)` | The plugin declaration that replaces `alias(libs.plugins.kotlin.jvm)` in the `plugins { }` block. |
| `compileSdk` | number \| string | `35` | The `compileSdk` value, inserted verbatim — a literal API level (`36`) or a Kotlin expression (`libs.versions.android.compileSdk.get().toInt()`). |
| `namespace` | string | `gradle.groupId` | The Android `namespace`. |

```yaml
android:
  plugin: "alias(libs.plugins.android.library)"
  compileSdk: "libs.versions.android.compileSdk.get().toInt()"

gradle:
  groupId: "com.letterboxd.api"
```

produces:

```kotlin
import com.android.build.api.dsl.LibraryExtension

plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.serialization)
}

group = "com.letterboxd.api"
version = "0.0.1"

configure<LibraryExtension> {
    namespace = "com.letterboxd.api"
    compileSdk = libs.versions.android.compileSdk.get().toInt()
}

dependencies {
    // …
}
```

> **Note:** the `android.library` and `kotlin.jvm` plugins are mutually exclusive, which is why `kotlin.jvm` is removed when `android` is present. You'll likely also need the Kotlin Android plugin and the relevant version-catalog entries (`libs.plugins.android.library`, `libs.versions.android.compileSdk`, etc.) defined in your project; add any further plugins via [`gradle.plugins`](#gradle).

## Development

To use this library in development we use the `link` command.

Get started by ensuring that your target project is using the same node version so that the global link will be discoverable. We use a `.nvmrc` file in this project to set the version.

First check that this project builds

```
pnpm install
pnpm run build
```

Then to register this directory with the global registry

```
pnpm run link
```

Then in your target project run

```
pnpm link --global @openapi-generator-plus/kotlin-client-generator
```

## Limitations
- This library uses Ktor with OkHttp engine for making network calls. Thus, it follows the current compatibility of OkHttp engines in Ktor, which are JVM and Android.
- This library assumes JSON is used for model representation during network calls.
- This library has a limitation in only supporting one-of discriminators of type string or an enum that is represented in string.
- The generated model objects are not `java.io.Serializable`, because Kotlin date and time classes are not `java.io.Serializable`. If you want to put model objects into an `android.os.Bundle` or `android.os.Intent`, you need to serialize the model object first (such as to json).

## Requirements
- The library was developed with the latest version of Kotlin at the time of development (version 1.9.22), and so it utilises Kotlin language features that were introduced after version 1.9.0, such as `data object`. Therefore, it’s strongly recommended to use the latest version of Kotlin, if not, at least 1.9.22.
- Gradle version catalog is necessary for the generated `build.gradle.kts` to reference necessary versions. Ensure you have this in your project before including the API module to the project.

## Implementation
There are two approaches you can take when implementing the generated API into an existing project.

### 1. File browser approach
1. Copy the folder containing the generated API files into the project root directory. 
	- The folder generated by the API should contain `src/` folder and `build.gradle.kts`.
	- The folder may be appropriately renamed, e.g. `api/`, but in this guide, we’ll reference it in the code blocks as `{api_folder}`.
2. At the root directory of the project, open `settings.gradle.kts` and add the `api` directory in the `include(...)` line along with all the other modules of the project.
	- If this is a plain, standard Android app, it should look something like `include(":app", ":{api_folder}")`
3. Inside `gradle/` directory, create a version catalog if the project does not have it already. Conventionally, it should be named `libs.versions.toml`. 
4. Add the required versions, libraries, and plugins inside the version catalog. Following code block contains the essential set of versions, libraries, and plugins, as specified in the auto-generated `build.gradle.kts` file.

```
[versions]
kotlin = "{latest_version that is >= 1.9.22}"
kotlinx-datetime = "{latest_version that is >= 0.5.0}"
kotlinx-serialization = "{latest_version that is >= 1.6.2}"
ktor = "{latest_version that is >= 2.3.7}"

[libraries]
kotlinx-datetime = { module = "org.jetbrains.kotlinx:kotlinx-datetime", version.ref = "kotlinx-datetime" }
kotlinx-serialization-json = { module = "org.jetbrains.kotlinx:kotlinx-serialization-json", version.ref = "kotlinx-serialization" }
ktor-client-content-negotiation = { module = "io.ktor:ktor-client-content-negotiation", version.ref = "ktor" }
ktor-client-core = { module = "io.ktor:ktor-client-core", version.ref = "ktor" }
ktor-client-okhttp = { module = "io.ktor:ktor-client-okhttp", version.ref = "ktor" }
ktor-serialization-kotlinx-json = { module = "io.ktor:ktor-serialization-kotlinx-json", version.ref = "ktor" }

[plugins]
kotlin-jvm = { id = "org.jetbrains.kotlin.jvm", version.ref = "kotlin" }
kotlin-serialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin" }
```

5. Go to `build.gradle.kts` in the root directory, and append aliases to the two plugins required by the API module, as specified in the version catalog.

```
plugins {
    … existing list of plugins …

    /** Needed for :api library. */
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}
```

6. [Optional] At this point, you may also go ahead and refactor version managements for all libraries and plugins into `libs.versions.toml` so that it’s consistent throughout the codebase.

7. Go to `build.gradle.kts` for the module that uses the generated API, and add the generated API module as a project dependency by appending the following line in the `dependencies {…}` closure.
```
implementation(project(":{api_folder}"))
```

8. Open command prompt in the project root directory and run the following command to build the project to see if all the configurations were done correctly. The build should **succeed** if every configuration was made correctly.
```
./gradlew build
```

### 2. Android Studio approach

1. Set up version catalog in your project if you haven't done so.

2. Add libraries and plugins required by the generated API module.

```
[versions]
kotlin = "{latest_version that is >= 1.9.22}"
kotlinx-datetime = "{latest_version that is >= 0.5.0}"
kotlinx-serialization = "{latest_version that is >= 1.6.2}"
ktor = "{latest_version that is >= 2.3.7}"

[libraries]
kotlinx-datetime = { module = "org.jetbrains.kotlinx:kotlinx-datetime", version.ref = "kotlinx-datetime" }
kotlinx-serialization-json = { module = "org.jetbrains.kotlinx:kotlinx-serialization-json", version.ref = "kotlinx-serialization" }
ktor-client-content-negotiation = { module = "io.ktor:ktor-client-content-negotiation", version.ref = "ktor" }
ktor-client-core = { module = "io.ktor:ktor-client-core", version.ref = "ktor" }
ktor-client-okhttp = { module = "io.ktor:ktor-client-okhttp", version.ref = "ktor" }
ktor-serialization-kotlinx-json = { module = "io.ktor:ktor-serialization-kotlinx-json", version.ref = "ktor" }

[plugins]
kotlin-jvm = { id = "org.jetbrains.kotlin.jvm", version.ref = "kotlin" }
kotlin-serialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin" }
```

3. Go to `build.gradle.kts` in the root directory, and append aliases to the two plugins required by the API module, as specified in the version catalog.
```
plugins {
  …remaining plugins…

  /** Needed for :api library. */
  alias(libs.plugins.kotlin.jvm) apply false
  alias(libs.plugins.kotlin.serialization) apply false
}
```

4. Click [File -> New -> Import Module…] from the menu bar and specify the source directory to the generated API.

5. [Optional] Android Studio may have created `settings.gradle` to include the new module instead of utilising the existing `settings.gradle.kts`. In that case, remove `settings.gradle`, and manually append the newly-included module in `settings.gradle.kts`. e.g...
```
include(":app", ":api")
```

6. Go to `build.gradle.kts` for the module that uses the generated API, and add the generated API module as a project dependency by appending the following line in the `dependencies {…}` closure.
```
implementation(project(":{api_folder}"))
```
