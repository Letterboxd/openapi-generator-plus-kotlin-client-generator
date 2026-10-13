---
"@openapi-generator-plus/kotlin-client-generator": patch
---

Name an enum member that matches the enum's nested `Unknown` or `Serializer` class in any case, such as `UNKNOWN`, with an `A` prefix, as a member named `Unknown` already is. Class files whose names differ only in case replace each other on a file system that ignores case, such as macOS's, so the generated client failed to compile or to load the member.
