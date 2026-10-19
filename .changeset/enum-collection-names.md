---
"@openapi-generator-plus/kotlin-client-generator": patch
---

Qualify the `List` and `Map` types in an enum's companion object as `kotlin.collections.List` and `kotlin.collections.Map`, as the rest of the generated code does. An API with a model named `List` or `Map` put that model in the enum's package, where it shadowed the Kotlin type and the generated client failed to compile.
