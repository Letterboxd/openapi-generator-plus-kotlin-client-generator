# @openapi-generator-plus/kotlin-client-generator

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
