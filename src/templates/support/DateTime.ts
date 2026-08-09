import { ts, when } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { generatedBy } from '../frag/generatedBy'

/** A date/time wrapper class with its serializer, preserving the API's string representation. */
function dateTimeClass(name: string, kotlinType: string, accessorName: string, documentation: string, ctx: KotlinModelContext): string {
	const root = ctx.root
	const serializable = root.isJavaSerializable
	return ts`
/** [value] will be a string in ${documentation} */
@kotlinx.serialization.Serializable(with = ${name}.Serializer::class)
data class ${name}(val value: String)${serializable ? ' : java.io.Serializable' : ''} {

    constructor(value: ${kotlinType}): this(value.toString())

    val ${accessorName}: ${kotlinType}
        get() = ${kotlinType}.parse(value)

    override fun toString(): String = value

    object Serializer : kotlinx.serialization.KSerializer<${name}>${serializable ? ', java.io.Serializable' : ''} {
        ${when(serializable, () => ts`
private fun readResolve(): Any = Serializer
`)}
        override val descriptor: kotlinx.serialization.descriptors.SerialDescriptor
            get() = kotlinx.serialization.descriptors.PrimitiveSerialDescriptor(
                "${root.supportPackage}.${name}",
                kotlinx.serialization.descriptors.PrimitiveKind.STRING
            )

        override fun deserialize(decoder: kotlinx.serialization.encoding.Decoder) =
            ${name}(decoder.decodeString())

        override fun serialize(encoder: kotlinx.serialization.encoding.Encoder, value: ${name}) =
            encoder.encodeString(value.value)
    }
}`
}

/** The date/time support classes: `Instant`, `LocalDate` and `LocalTime`. */
export function dateTime(ctx: KotlinModelContext): string {
	return ts`
/*
 * ${generatedBy(ctx.root)}
 */

package ${ctx.root.supportPackage}

${dateTimeClass('Instant', 'kotlin.time.Instant', 'kInstant', 'ISO 8601 date time format, e.g. 2020-08-30T18:43:00Z', ctx)}

${dateTimeClass('LocalDate', 'kotlinx.datetime.LocalDate', 'kLocalDate', 'ISO 8601 date format, e.g. 2020-08-30', ctx)}

${dateTimeClass('LocalTime', 'kotlinx.datetime.LocalTime', 'kLocalTime', 'ISO 8601 time format, e.g. 18:43:00.004', ctx)}
`
}
