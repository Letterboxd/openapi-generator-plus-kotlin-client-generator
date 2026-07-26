---
"@openapi-generator-plus/kotlin-client-generator": minor
---

Default the generated Configuration's Json to `ignoreUnknownKeys = true`
so clients tolerate additive API changes instead of failing on new response keys.
The setting is applied before jsonBuilder, so callers can override it.
