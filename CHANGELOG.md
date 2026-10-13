# @openapi-generator-plus/kotlin-client-generator

## 2.0.1

### Patch Changes

- ece3c5b: Name an enum member that matches the enum's nested `Unknown` or `Serializer` class in any case, such as `UNKNOWN`, with an `A` prefix, as a member named `Unknown` already is. Class files whose names differ only in case replace each other on a file system that ignores case, such as macOS's, so the generated client failed to compile or to load the member.

## 2.0.0

### Major Changes

- 359169c: Represent a value of any type as `kotlinx.serialization.json.JsonElement`, and the JSON Schema null type as `JsonNull`.

  These were `@Contextual kotlin.Any`, which has no serializer unless a caller registers one, so decoding them failed at run time. A map of any values, such as `additionalProperties: true`, is now a `Map<String, JsonElement>`. The generated `build.gradle.kts` now exposes `kotlinx-serialization-json` as an `api` dependency, as the generated types use it.

- b3e1365: Keep a discriminator property in the model of the schema that declares it, and fix a member's value to its type.

  A member of a discriminator now declares the discriminator property in its class body with its own value, rather than as a constructor parameter, and always writes it. A oneOf no longer removes the discriminator property before it decodes a member that declares it, so such a member can be decoded. A boolean discriminator is written as a boolean. The `Unknown` member of a oneOf now carries the discriminator value as a `String`, whatever the discriminator's type. A oneOf without a discriminator now decodes by trying each member in turn, and encodes a member that isn't an object.

- 4e79b73: Write an enum of numbers as JSON numbers, and look up enum literals by value.

  - An enum of integers or numbers is now written as JSON numbers, such as `{"level":2}`, rather than as strings, and its serializer declares a number kind. It reads a value written as a number or as text, and matches it as a number, such as `1.0` for `1`.
  - An enum default and a discriminator value are now written as `Type.valueOf("value")`, rather than as a member name, because core makes the names of the members unique. A default that isn't one of the enum's values now becomes `Unknown` when it's used, rather than failing to compile.
  - A oneOf without a discriminator decodes a value into an enum member that knows it first. A value that no member knows goes to the first enum member of its shape, as that enum's `Unknown`. An enum of numbers only reads JSON numbers there.

- 0e00a42: Give a caller the headers of a response, and refuse a response that breaks the operation's contract.

  - A response that declares headers carries them in its result class, as typed properties beside `value`. A response with no content that declares headers is now a data class rather than a data object.
  - Refuse a response body that arrives without the declared `Content-Type`, or with an empty body, or with a header that the API requires but the response leaves out or that doesn't parse, with `APIException.InvalidResponse`, whose new `cause` says why.
  - Encode request bodies and decode response bodies with the new `Configuration.json`. The API client no longer installs the content negotiation plugin, which added `application/json` to every `Accept` header. A text body of a date, an enum or another text type is read through its serializer, and a binary body of a `binaryRepresentation` other than `ByteArray` is read as that type.
  - Read a range response, such as `4XX`, for the codes in its range. Its result class, and the `Default` result class, carry the `status` code that the server sent, so `Default` is now a data class rather than a data object.

### Minor Changes

- b3e1365: Keep the members of an object schema that describes no properties.

  An object schema without properties permits any properties, but its class had no properties, so decoding it discarded every member of the object. The class is now a data class with an `additionalProperties` map of `JsonElement` that holds them, and it encodes them again.

- 0e00a42: Send every parameter and request body the way the specification declares it.

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

### Patch Changes

- 2fa9bf5: Fix the default `enumMemberStyle`, which failed with "Unsupported enumMemberStyle: contant" unless the config set the option. Upgrade `@openapi-generator-plus/java-like-generator-helper`, `generator-common` and `template-utils`.

## 1.0.0

### Major Changes

- ff06bff: Migrate templates from Handlebars to TypeScript. Templates are now TypeScript code and are customized via the generator's typed template APIs; the `customTemplates` config option is no longer supported.

### Patch Changes

- b0ffd06: Support the JSON Schema `null` type, mapping it to `kotlin.Any` with contextual serialization, matching the treatment of the any type.
- 8280ba6: Update dependencies

## 0.4.0

### Minor Changes

- efa1eb2: Default the generated Configuration's Json to `ignoreUnknownKeys = true`
  so clients tolerate additive API changes instead of failing on new response keys.
  The setting is applied before jsonBuilder, so callers can override it.
- 1592edb: Fix decoding of explicit JSON `null` for `Nullable<T>` properties

  `Nullable.Serializer.deserialize` unconditionally delegated to the value
  serializer, so any response containing an explicit `null` (e.g.
  `"editedAt": null`) threw a `JsonDecodingException` and failed the whole
  response. It now checks the decoder's null mark and returns `Nullable.Null`,
  and the serializer's descriptor is marked nullable to match.

## 0.3.0

### Minor Changes

- 154e5ce: Add configuration for the URL type and Android library output

  - `urlImplementation` selects the Kotlin type used for the `url` string format (e.g. `java.net.URI` or `android.net.Uri`), with an optional `fromString` for types that aren't constructed directly from a `String`.
  - `gradle.plugins` and `gradle.dependencies` inject extra lines verbatim into the generated `build.gradle.kts`.
  - A new `android` option generates `build.gradle.kts` as an Android library module (`com.android.library` plugin and a `LibraryExtension` block) so Android SDK types resolve natively. `compileSdk` accepts a literal API level or a Kotlin expression.
  - `build.gradle.kts` is now regenerated on every run so configuration changes always take effect.

## 0.2.2

### Patch Changes

- 8c9eb28: Upgrade dependencies and node version

## 0.2.1

### Patch Changes

- 3cb3feb: Fix bad release missing code!

## 0.2.0

### Minor Changes

- fe6de67: Replace `kotlinx.datetime.Clock` and `kotlinx.datetime.Instant` with their `kotlin.time.\*` replacements.

### Patch Changes

- ce93078: Update dependency versions.

## 0.1.4

### Patch Changes

- 70fd5d9: Exclude status code 500 from being treated as an expected auth failure

## 0.1.3

### Patch Changes

- 154fd8b: Replace `nil` with `null`
- ce8835d: Upgrade dependencies including eslint 9 and updated linting rules

## 0.1.2

### Patch Changes

- a00552b: Update interface to sealed interface

## 0.1.1

### Patch Changes

- 6188874: Fix parameter naming not matching the actual name from the spec

## 0.1.0

### Minor Changes

- 93c1cd8: Update core including toEnumMemberName change

## 0.0.12

### Patch Changes

- 5023101: Update to latest core

## 0.0.11

### Patch Changes

- 9b20c8e: Fix serializability of URLs, UUIDs and introduce support for Any

## 0.0.10

### Patch Changes

- 5e5ede7: Generate interfaces for request parameters that are implemented by generated data classes to allow for custom request objects
- 2159e31: Use authenticationFailed to indicate token failure and unexpectedResponse to indicate that a retry might be possible

## 0.0.9

### Patch Changes

- a7e9f22: Wrap security clients with runCatching for consistency in handling errors

## 0.0.8

### Patch Changes

- 2633cc8: replace incorrect use of #join to #set
- 5a0fe81: Support FILE schema type
- c90b980: include comma even on last property
- b932240: Fix concrete types of collection types, and use Set for unique items
- ce894d3: Tidy property overrides logic
- cbad48a: Added configuration options and error handling to the Oauth flows
- fbc1a80: Update dependencies including OpenAPI Generator Plus

## 0.0.7

### Patch Changes

- 0938016: Add convenience constructors to create generator date time objects from Kotlin date time objects

## 0.0.6

### Patch Changes

- 4eaf56c: remove unnecessary ordinal field in enum
- 72381e2: make api models java serializable by default
- 6caecc5: add serializer extension function import for built-in types
- 261f265: Remove constructor for objects that have no properties
- 8a7e7df: refactor scheme parameters into template fragment
- bb61ba1: fix styling
- d17c6bc: Reserve 'Unknown' as a keyword for enum types
- f974998: fix outdated approach in accessing serializer
- aeed0aa: generify the flag name
- bab6d07: Added human readable error messages on APIException objects
- 781a92a: refactor enum schemes to better replicate enum class
- 8289c38: Catch network exceptions thrown by OkHttp and return a result
- 3a6f242: add correct one-of serializers
- 0caecef: make serializer objects java.io.Serializable
- d550a3b: specify httpclientconfig generic type
- 3406ce3: separate properties based on use cases
- 02c6016: ensure main-safety in api endpoints
- e4e06b3: fix improper imports for one-of schemas
- 2a6e7da: fix non-relative name used for superclass of unknown enum case
- d69658b: call did change func everytime access token updates in the manager
- 7189d86: cleanup datetime wrapper classes
- 09ec5a3: Fix oneOf discriminator
- e473df6: fix enum naming to pascal case
- 8fe460e: Add configuration block to allow customising the HttpClientConfig
- 76086a7: Allow JsonBuilder to be confgured
- b76e0da: leverage sealed class with oneOf types
- 73a6914: handle one-of models with implicit discrimators
- 62cc700: add android bundle compatibility build flag
- 03b11be: return a result object after revoke operations
- ec9e739: replace datetime classes with java serializable wrapper classes
- a507bfc: allow auth by default on api operations

## 0.0.5

### Patch Changes

- 89ea047: Tidy up passing of supportPackage
- 91e069f: Fix array responses
- cce1021: fix paths for base urls without trailing slashes being ignored
- 5934068: add support for catch-all response codes
- f871a3c: remove redundant absolute reference of Duration class

## 0.0.4

### Patch Changes

- 8b3344e: Fix a wrongly fixed package

## 0.0.3

### Patch Changes

- bb556b6: Fix internal package references

## 0.0.2

### Patch Changes

- c438667: Configuration style to match Swift generator
- d5360d6: Fix independent gradle build so tests can compile
- c438667: Authentication support
