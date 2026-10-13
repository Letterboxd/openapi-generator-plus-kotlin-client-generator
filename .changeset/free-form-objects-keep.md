---
"@openapi-generator-plus/kotlin-client-generator": minor
---

Keep the members of an object schema that describes no properties.

An object schema without properties permits any properties, but its class had no properties, so decoding it discarded every member of the object. The class is now a data class with an `additionalProperties` map of `JsonElement` that holds them, and it encodes them again.
