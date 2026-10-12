import { ts } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { generatedBy } from '../frag/generatedBy'

/** The `Nullable` support class that distinguishes an explicit `null` from an absent value. */
export function nullable(ctx: KotlinModelContext): string {
	const root = ctx.root
	return ts`
/*
 * ${generatedBy(root)}
 */

package ${root.supportPackage}

import kotlinx.serialization.descriptors.nullable

/**
 * Contains a value that may be explicitly set to \`null\` when sent via the API.
 */
@kotlinx.serialization.Serializable(with = Nullable.Serializer::class)
sealed class Nullable<out T>${root.isJavaSerializable ? ' : java.io.Serializable' : ''} {
    data class Some<T>(val value: T): Nullable<T>()
    data object Null: Nullable<Nothing>()

    open class Serializer<T>(
        private val valueSerializer: kotlinx.serialization.KSerializer<T>
    ) : kotlinx.serialization.KSerializer<Nullable<T>> {
        final override val descriptor: kotlinx.serialization.descriptors.SerialDescriptor = valueSerializer.descriptor.nullable

        @OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)
        final override fun serialize(encoder: kotlinx.serialization.encoding.Encoder, value: Nullable<T>) {
            when (value) {
                Nullable.Null -> encoder.encodeNull()
                is Nullable.Some -> valueSerializer.serialize(encoder, value.value)
            }
        }

        final override fun deserialize(decoder: kotlinx.serialization.encoding.Decoder): Nullable<T> =
            if (decoder.decodeNotNullMark()) {
                Nullable.Some(valueSerializer.deserialize(decoder))
            } else {
                decoder.decodeNull()
                Nullable.Null
            }
    }
}
`
}
