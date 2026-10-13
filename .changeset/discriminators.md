---
"@openapi-generator-plus/kotlin-client-generator": major
---

Keep a discriminator property in the model of the schema that declares it, and fix a member's value to its type.

A member of a discriminator now declares the discriminator property in its class body with its own value, rather than as a constructor parameter, and always writes it. A oneOf no longer removes the discriminator property before it decodes a member that declares it, so such a member can be decoded. A boolean discriminator is written as a boolean. The `Unknown` member of a oneOf now carries the discriminator value as a `String`, whatever the discriminator's type. A oneOf without a discriminator now decodes by trying each member in turn, and encodes a member that isn't an object.
