---
"@openapi-generator-plus/kotlin-client-generator": minor
---

Add configuration for the URL type and Android library output

- `urlImplementation` selects the Kotlin type used for the `url` string format (e.g. `java.net.URI` or `android.net.Uri`), with an optional `fromString` for types that aren't constructed directly from a `String`.
- `gradle.plugins` and `gradle.dependencies` inject extra lines verbatim into the generated `build.gradle.kts`.
- A new `android` option generates `build.gradle.kts` as an Android library module (`com.android.library` plugin and a `LibraryExtension` block) so Android SDK types resolve natively. `compileSdk` accepts a literal API level or a Kotlin expression.
- `build.gradle.kts` is now regenerated on every run so configuration changes always take effect.
