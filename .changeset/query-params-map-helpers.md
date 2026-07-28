---
"@openapi-generator-plus/kotlin-client-generator": minor
---

Add `toQueryMap()` / `withQuery()` query-parameter map helpers and rename the per-operation parameters bundle.

The generated per-operation parameters class (and its interface) are renamed from `…QueryParams`/`I…QueryParams` to `…Params`/`I…Params`, since the class carries all parameters, not just query parameters. **This is a breaking change** for callers that reference the generated type by name.

The class now also exposes:

- `toQueryMap(): Map<String, List<String>>` — the query parameters serialized by their API names.
- `withQuery(query: Map<String, List<String>>): …Params` — a copy with query parameters overridden from the map, keeping the current value for keys absent from the map.
- a secondary `constructor(…non-query args…, query: Map<String, List<String>>)` that builds the bundle from the non-query arguments plus a query map, throwing `IllegalArgumentException` when a required query parameter is absent from the map.

Only query parameters reconstructable from a string (primitives, enums, dates, UUIDs, and arrays thereof) participate in the map; object-typed query parameters are passed as explicit constructor arguments and left unchanged by `withQuery`.
