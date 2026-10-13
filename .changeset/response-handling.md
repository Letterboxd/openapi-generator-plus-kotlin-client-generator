---
"@openapi-generator-plus/kotlin-client-generator": major
---

Give a caller the headers of a response, and refuse a response that breaks the operation's contract.

- A response that declares headers carries them in its result class, as typed properties beside `value`. A response with no content that declares headers is now a data class rather than a data object.
- Refuse a response body that arrives without the declared `Content-Type`, or with an empty body, or with a header that the API requires but the response leaves out or that doesn't parse, with `APIException.InvalidResponse`, whose new `cause` says why.
- Encode request bodies and decode response bodies with the new `Configuration.json`. The API client no longer installs the content negotiation plugin, which added `application/json` to every `Accept` header. A text body of a date, an enum or another text type is read through its serializer, and a binary body of a `binaryRepresentation` other than `ByteArray` is read as that type.
- Read a range response, such as `4XX`, for the codes in its range. Its result class, and the `Default` result class, carry the `status` code that the server sent, so `Default` is now a data class rather than a data object.
