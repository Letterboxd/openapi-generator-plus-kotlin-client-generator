---
"@openapi-generator-plus/kotlin-client-generator": minor
---

Send every parameter and request body the way the specification declares it.

- Write query parameters in their declared style: form (exploded or not), space and pipe delimited, and deepObject, for arrays and objects.
- Send header and cookie parameters, which the client dropped.
- Write path parameters in their declared style: simple, label or matrix. Percent encode each value, but not the delimiters between them.
- Percent encode each cookie value, but not the delimiters between them.
- Write a map or a free-form object parameter, or form body, entry by entry.
- Encode a `application/x-www-form-urlencoded` body, a `multipart/form-data` body, a text body and a binary body in their own format, rather than as JSON. A null form property or part is written as the format allows. A file part has a filename, and a part has the headers that its encoding declares.
- Send an `Accept` header with the media types that the operation's responses declare.
- Call `Configuration.finalizeRequestBlock`, which the client ignored.
- Send the `Basic` scheme name in the `Authorization` header from `BasicAuthenticationSecurityClient`.
- Rethrow a coroutine's `CancellationException`, rather than returning it as a failure.
