import { CodegenEnumSchema } from '@openapi-generator-plus/types'
import { className, each, ts, when } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { schemaDocumentation } from './documentation'

/**
 * An enum schema rendered as a sealed class with a case per enum value plus an
 * `Unknown` case that captures unrecognised API values.
 */
export function enumFrag(schema: CodegenEnumSchema, ctx: KotlinModelContext): string {
	const generator = ctx.generatorContext.generator()
	const name = schema.name ?? ''
	const serializable = ctx.root.isJavaSerializable

	return ts`
${schemaDocumentation(schema)}
@kotlinx.serialization.Serializable(with = ${name}.Serializer::class)
sealed class ${name}${serializable ? ' : java.io.Serializable' : ''} {

    companion object {

        /** Returns all enum cases in an immutable list, excluding the unknown case. */
        val entries = listOf(
            ${each(schema.enumValues, v => `${name}.${className(generator, v.name)}`, ',\n')}
        )

        /**
         * Returns the enum constant of this type with the specified name.
         * The string must match exactly an identifier used to declare an enum constant in this type.
         * (Extraneous whitespace characters are not permitted.)
         * If an enum constant of this type with the specified name does not exist,
         * a default case of [Unknown] case will be returned that contains the provided value.
         */
        fun valueOf(value: kotlin.String): ${name} = when (value) {
            ${each(schema.enumValues, v => `"${v.value}" -> ${name}.${className(generator, v.name)}`, '\n')}
            else -> ${name}.Unknown(value)
        }

    }

    /** Returns the API value of this enum constant. */
    abstract val value: kotlin.String

    /** Returns the name of this enum constant, exactly as declared in its enum declaration. */
    abstract val name: kotlin.String

    ${each(schema.enumValues, v => ts`
data object ${className(generator, v.name)} : ${name}() {
    override val name = "${className(generator, v.name)}"
    override val value = "${v.value}"
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
                kotlinx.serialization.descriptors.PrimitiveKind.STRING
            )

        override fun serialize(
            encoder: kotlinx.serialization.encoding.Encoder,
            value: ${name}
        ) {
            encoder.encodeString(value.value)
        }

        override fun deserialize(decoder: kotlinx.serialization.encoding.Decoder): ${name} =
            valueOf(decoder.decodeString())
    }

}`
}
