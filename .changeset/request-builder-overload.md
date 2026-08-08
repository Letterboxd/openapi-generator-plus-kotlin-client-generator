---
"@openapi-generator-plus/kotlin-client-generator": minor
---

Add an optional trailing `modifyRequest` lambda (with a Ktor `HttpRequestBuilder` receiver) to every generated request function. The lambda runs after the generated request items (typed query parameters and body) are applied, letting callers customise the request directly — e.g. append raw query parameters (`url { parameters.appendAll(...) }`) or override the body (`setBody(...)`). It defaults to `{}`, so existing calls are unaffected, and authentication is still applied afterwards.
