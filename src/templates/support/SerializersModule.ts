import { ts } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { generatedBy } from '../frag/generatedBy'

/**
 * The serializers module that holds the serializers of the types that aren't serializable themselves. A lookup
 * of a serializer for a type needs it, as the lookup ignores the serializer annotations of type arguments.
 */
export function serializersModule(ctx: KotlinModelContext): string {
	const root = ctx.root
	return ts`
/*
 * ${generatedBy(root)}
 */

package ${root.supportPackage}

/** The serializers of the types that the API uses but that aren't serializable themselves, such as \`java.util.UUID\`. */
val supportSerializersModule: kotlinx.serialization.modules.SerializersModule = kotlinx.serialization.modules.SerializersModule {
    contextual(java.util.UUID::class, KUUIDSerializer)
    contextual(${root.urlImplementation}::class, KURLSerializer)
}
`
}
