import { CodegenEnumSchema } from '@openapi-generator-plus/types'
import { className, each, stringLiteral, ts, when } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { schemaDocumentation } from './documentation'
import { numericEnumKind } from '../helpers'

/**
 * An enum schema rendered as a sealed class with a case per enum value plus an
 * `Unknown` case that captures unrecognised API values.
 */
export function enumFrag(schema: CodegenEnumSchema, ctx: KotlinModelContext): string {
	const generator = ctx.generatorContext.generator()
	const name = schema.name ?? ''
	const serializable = ctx.root.isJavaSerializable
	const numericKind = numericEnumKind(schema)
	const numeric = numericKind !== null

	return ts`
${schemaDocumentation(schema)}
@kotlinx.serialization.Serializable(with = ${name}.Serializer::class)
sealed class ${name}${serializable ? ' : java.io.Serializable' : ''} {

    companion object {

        /**
         * Returns all enum cases in an immutable list, excluding the unknown case. It's made when it's first used,
         * because a case that's used before this class is initialized isn't yet set while the class initializes.
         */
        val entries: List<${name}> by lazy {
            listOf(
                ${each(schema.enumValues, v => `${name}.${className(generator, v.name)}`, ',\n')}
            )
        }

        /**
         * Returns the enum constant of this type with the specified API value.
         * ${numeric ? 'A value matches as a number, however it\'s written, such as 1.0 for 1.' : 'The value must match exactly. (Extraneous whitespace characters are not permitted.)'}
         * If no enum constant of this type has the value, an [Unknown] case that contains the value is returned.
         */
        fun valueOf(value: kotlin.String): ${name} = when (value) {
            ${each(schema.enumValues, v => `${stringLiteral(ctx.generatorContext, v.value)} -> ${name}.${className(generator, v.name)}`, '\n')}
            else -> ${numeric ? `value.toBigDecimalOrNull()?.let { entriesByNumber[it.stripTrailingZeros()] } ?: ${name}.Unknown(value)` : `${name}.Unknown(value)`}
        }${numeric ? ts`

        /** The enum cases by their values as numbers, so that a value matches however it's written, such as 1.0 for 1. */
        private val entriesByNumber: Map<java.math.BigDecimal, ${name}> by lazy {
            entries.associateBy { it.value.toBigDecimal().stripTrailingZeros() }
        }` : ''}

    }

    /** Returns the API value of this enum constant. */
    abstract val value: kotlin.String

    /** Returns the name of this enum constant, exactly as declared in its enum declaration. */
    abstract val name: kotlin.String

    ${each(schema.enumValues, v => ts`
data object ${className(generator, v.name)} : ${name}() {
    override val name = "${className(generator, v.name)}"
    override val value = ${stringLiteral(ctx.generatorContext, v.value)}
    override fun toString() = value
}`, '\n')}

    data class Unknown(
        override val value: kotlin.String,
    ) : ${name}() {
        override val name = value
        override fun toString() = value
    }

    object Serializer : kotlinx.serialization.KSerializer<${name}>${serializable ? ', java.io.Serializable' : ''} {
        ${when(serializable, () => ts`
private fun readResolve(): Any = Serializer
`)}
        override val descriptor: kotlinx.serialization.descriptors.SerialDescriptor =
            kotlinx.serialization.descriptors.PrimitiveSerialDescriptor(
                "${schema.nativeType.concreteType}Serializer",
                kotlinx.serialization.descriptors.PrimitiveKind.${numericKind ?? 'STRING'}
            )

        ${numeric ? ts`
/* The values are numbers, which JSON writes as numbers, and an unknown value is written as it is */
override fun serialize(
    encoder: kotlinx.serialization.encoding.Encoder,
    value: ${name}
) {
    if (encoder is kotlinx.serialization.json.JsonEncoder) {
        encoder.encodeJsonElement(value.value.toBigDecimalOrNull()?.let { kotlinx.serialization.json.JsonPrimitive(it) } ?: kotlinx.serialization.json.JsonPrimitive(value.value))
    } else {
        encoder.encodeString(value.value)
    }
}

/* A value may be written as a number or as text */
override fun deserialize(decoder: kotlinx.serialization.encoding.Decoder): ${name} {
    if (decoder !is kotlinx.serialization.json.JsonDecoder) {
        return valueOf(decoder.decodeString())
    }
    val element = decoder.decodeJsonElement()
    if (element !is kotlinx.serialization.json.JsonPrimitive || element is kotlinx.serialization.json.JsonNull) {
        throw kotlinx.serialization.SerializationException("A \`${name}\` must be a number.")
    }
    return valueOf(element.content)
}` : ts`
override fun serialize(
    encoder: kotlinx.serialization.encoding.Encoder,
    value: ${name}
) {
    encoder.encodeString(value.value)
}

override fun deserialize(decoder: kotlinx.serialization.encoding.Decoder): ${name} =
    valueOf(decoder.decodeString())`}
    }

}`
}
