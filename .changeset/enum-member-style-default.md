---
"@openapi-generator-plus/kotlin-client-generator": patch
---

Fix the default `enumMemberStyle`, which failed with "Unsupported enumMemberStyle: contant" unless the config set the option. Upgrade `@openapi-generator-plus/java-like-generator-helper`, `generator-common` and `template-utils`.
