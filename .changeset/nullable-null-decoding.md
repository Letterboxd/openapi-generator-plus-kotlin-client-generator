---
"@openapi-generator-plus/kotlin-client-generator": minor
---

Fix decoding of explicit JSON `null` for `Nullable<T>` properties

`Nullable.Serializer.deserialize` unconditionally delegated to the value
serializer, so any response containing an explicit `null` (e.g.
`"editedAt": null`) threw a `JsonDecodingException` and failed the whole
response. It now checks the decoder's null mark and returns `Nullable.Null`,
and the serializer's descriptor is marked nullable to match.
