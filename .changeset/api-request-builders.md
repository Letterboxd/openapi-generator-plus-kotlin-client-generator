---
"@openapi-generator-plus/kotlin-client-generator": minor
---

Generate a request builder beside each API class, such as `PetsApiRequestBuilder` for `PetsApi`, as a way out for requests that the API specification doesn't describe. Its functions make an operation's request without sending it, as an `APIRequest`, which a caller can `customize` with Ktor's `HttpRequestBuilder` and then `execute`, still going through the client's security, reauthentication and response handling. A customisation runs after the operation's own parameters are applied, before the request is authorized and the configuration's `finalizeRequestBlock` runs, and again on the retry after reauthenticating. The API classes send the requests that their request builders make, and their functions are unchanged. This is the counterpart of the Swift client's request builders.
