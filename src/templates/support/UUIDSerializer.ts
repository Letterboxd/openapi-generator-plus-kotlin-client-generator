import { ts } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { generatedBy } from '../frag/generatedBy'

/** The serializer for `java.util.UUID` values. */
export function uuidSerializer(ctx: KotlinModelContext): string {
	const root = ctx.root
	return ts`
/*
 * ${generatedBy(root)}
 */

package ${root.supportPackage}

object KUUIDSerializer : kotlinx.serialization.KSerializer<java.util.UUID> {
    override val descriptor: kotlinx.serialization.descriptors.SerialDescriptor = kotlinx.serialization.descriptors.PrimitiveSerialDescriptor("UUID", kotlinx.serialization.descriptors.PrimitiveKind.STRING)

    override fun serialize(encoder: kotlinx.serialization.encoding.Encoder, value: java.util.UUID) {
        encoder.encodeString(value.toString())
    }

    override fun deserialize(decoder: kotlinx.serialization.encoding.Decoder): java.util.UUID =
        java.util.UUID.fromString(decoder.decodeString())

}
`
}
