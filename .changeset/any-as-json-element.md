---
"@openapi-generator-plus/kotlin-client-generator": major
---

Represent a value of any type as `kotlinx.serialization.json.JsonElement`, and the JSON Schema null type as `JsonNull`.

These were `@Contextual kotlin.Any`, which has no serializer unless a caller registers one, so decoding them failed at run time. A map of any values, such as `additionalProperties: true`, is now a `Map<String, JsonElement>`. The generated `build.gradle.kts` now exposes `kotlinx-serialization-json` as an `api` dependency, as the generated types use it.
