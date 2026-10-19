---
"@openapi-generator-plus/kotlin-client-generator": minor
---

Give each operation a trailing `customizeRequest: HttpRequestBuilder.() -> Unit` lambda, which receives the request once the operation's own parameters, headers and body are applied, and before it's authorized and the configuration's `finalizeRequestBlock` runs. A caller can make a request that the specification doesn't describe, such as one with query parameters from elsewhere, and still go through the client's security, reauthentication and response handling. The `…QueryParams` overloads take and pass on the lambda too, as does the retry after reauthenticating.
