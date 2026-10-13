---
"@openapi-generator-plus/kotlin-client-generator": major
---

Write an enum of numbers as JSON numbers, and look up enum literals by value.

- An enum of integers or numbers is now written as JSON numbers, such as `{"level":2}`, rather than as strings, and its serializer declares a number kind. It reads a value written as a number or as text, and matches it as a number, such as `1.0` for `1`.
- An enum default and a discriminator value are now written as `Type.valueOf("value")`, rather than as a member name, because core makes the names of the members unique. A default that isn't one of the enum's values now becomes `Unknown` when it's used, rather than failing to compile.
- A oneOf without a discriminator decodes a value into an enum member that knows it first. A value that no member knows goes to the first enum member of its shape, as that enum's `Unknown`. An enum of numbers only reads JSON numbers there.
