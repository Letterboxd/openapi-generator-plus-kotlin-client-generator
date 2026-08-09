import { ts } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { generatedBy } from '../frag/generatedBy'

/** The serializer for the configured URL implementation type. */
export function urlSerializer(ctx: KotlinModelContext): string {
	const root = ctx.root
	return ts`
/*
 * ${generatedBy(root)}
 */

package ${root.supportPackage}

object KURLSerializer : kotlinx.serialization.KSerializer<${root.urlImplementation}> {
    override val descriptor: kotlinx.serialization.descriptors.SerialDescriptor = kotlinx.serialization.descriptors.PrimitiveSerialDescriptor("URL", kotlinx.serialization.descriptors.PrimitiveKind.STRING)

    override fun serialize(encoder: kotlinx.serialization.encoding.Encoder, value: ${root.urlImplementation}) {
        encoder.encodeString(value.toString())
    }

    override fun deserialize(decoder: kotlinx.serialization.encoding.Decoder): ${root.urlImplementation} =
        ${root.urlFromString}(decoder.decodeString())

}
`
}
