import { CodegenHierarchySchema, CodegenOneOfSchema } from '@openapi-generator-plus/types'
import { className, each, ts, when } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { schemaDocumentation } from './documentation'
import { nestedSchemas } from './nestedSchemas'

/**
 * A oneOf (or hierarchy) schema rendered as a sealed class with a member data
 * class wrapping each composed schema, an `Unknown` member for unrecognised
 * values, and a serializer that dispatches on the discriminator.
 */
export function oneOfFrag(schema: CodegenOneOfSchema | CodegenHierarchySchema, ctx: KotlinModelContext): string {
	const generator = ctx.generatorContext.generator()
	const name = schema.name
	const serializable = ctx.root.isJavaSerializable
	const discriminator = schema.discriminator
	const parentType = schema.nativeType.parentType ?? ''

	const unknownMember = discriminator ? ts`
    @kotlinx.serialization.Serializable
    data class Unknown(

        /** The unknown discriminator value passed from the API. */
        @kotlinx.serialization.SerialName("${discriminator.serializedName}")
        val ${discriminator.name}: ${discriminator.nativeType}

    ) : ${parentType}()` : ts`
    @kotlinx.serialization.Serializable
    data object Unknown : ${parentType}()`

	const deserializeBody = discriminator ? ts`
require(decoder is kotlinx.serialization.json.JsonDecoder)

val jsonObject = decoder.decodeJsonElement() as? kotlinx.serialization.json.JsonObject ?: error("JsonElement is not a JsonObject")
val type = jsonObject["${discriminator.serializedName}"]?.let { decoder.json.decodeFromJsonElement(kotlinx.serialization.serializer<${discriminator.nativeType.concreteType}>(), it) }
requireNotNull(type) { "The discriminator for a child of \`${name}\` could not be found." }

val nextTree = kotlinx.serialization.json.JsonObject(jsonObject.toMutableMap().apply {
    remove(key = "${discriminator.serializedName}")
})

return when (type) {
    ${each(discriminator.references, ref => when(ref.schema.name, () => `${ref.literalValue} -> decoder.json.decodeFromJsonElement(${name}.${ref.schema.name}.serializer(), nextTree)`), '\n')}
    else -> Unknown(${discriminator.name} = type)
}` : 'TODO("Deserialization of models without an explicit discriminator is currently unsupported.")'

	const serializeBody = discriminator ? ts`
val completeObject = kotlinx.serialization.json.JsonObject(jsonObject.toMutableMap().apply {
    val discriminator = when (value) {
        ${each(discriminator.references, ref => when(ref.schema.name, () => `is ${name}.${ref.schema.name} -> "${ref.value}"`), '\n')}
        is ${name}.Unknown -> throw kotlinx.serialization.SerializationException("Cannot encode an unknown one-of value of \`${name}\`.")
    }

    put("${discriminator.serializedName}", kotlinx.serialization.json.JsonPrimitive(discriminator))
})

encoder.encodeJsonElement(completeObject)` : 'encoder.encodeJsonElement(jsonObject)'

	return ts`
${schemaDocumentation(schema)}
@kotlinx.serialization.Serializable(with = ${name}.Serializer::class)
sealed class ${className(generator, name)}${serializable ? ' : java.io.Serializable' : ''} {${each(schema.composes, compose => {
	const composeName = className(generator, compose.name)
	const serializer = `kotlinx.serialization.serializer<${compose.nativeType}>()`
	return '\n' + ts`

    @kotlinx.serialization.Serializable(with = ${composeName}.Serializer::class)
    data class ${composeName}(val value: ${compose.nativeType}) : ${parentType}() {
        object Serializer : kotlinx.serialization.KSerializer<${composeName}>${serializable ? ', java.io.Serializable' : ''} {
            ${when(serializable, () => ts`
private fun readResolve(): Any = Serializer
`)}
            override val descriptor: kotlinx.serialization.descriptors.SerialDescriptor =
                ${serializer}.descriptor

            override fun deserialize(decoder: kotlinx.serialization.encoding.Decoder) =
                ${composeName}(value = ${serializer}.deserialize(decoder))

            override fun serialize(encoder: kotlinx.serialization.encoding.Encoder, value: ${composeName}) =
                ${serializer}.serialize(encoder, value.value)
        }
    }`
})}

${unknownMember}

    object Serializer : kotlinx.serialization.KSerializer<${name}>${serializable ? ', java.io.Serializable' : ''} {
        ${when(serializable, () => ts`
private fun readResolve(): Any = Serializer
`)}
        @OptIn(
            kotlinx.serialization.InternalSerializationApi::class,
            kotlinx.serialization.ExperimentalSerializationApi::class
        )
        override val descriptor: kotlinx.serialization.descriptors.SerialDescriptor =
            kotlinx.serialization.descriptors.buildSerialDescriptor("${schema.nativeType}Serializer", kotlinx.serialization.descriptors.PolymorphicKind.OPEN) {
                element("${discriminator ? discriminator.serializedName : ''}", kotlinx.serialization.serializer<String>().descriptor)
            }

        override fun deserialize(decoder: kotlinx.serialization.encoding.Decoder): ${name} {
            ${deserializeBody}
        }

        override fun serialize(encoder: kotlinx.serialization.encoding.Encoder, value: ${name}) {
            require(encoder is kotlinx.serialization.json.JsonEncoder)

            val jsonObject: kotlinx.serialization.json.JsonObject = when (value) {
                ${each(schema.composes, compose => when(compose.name, () => `is ${name}.${compose.name} -> encoder.json.encodeToJsonElement(${name}.${compose.name}.serializer(), value)`), '\n')}
                is ${name}.Unknown -> throw kotlinx.serialization.SerializationException("Cannot encode an unknown one-of value of \`${name}\`.")
            } as? kotlinx.serialization.json.JsonObject ?: error("JsonElement is not a JsonObject")

            ${serializeBody}
        }
    }

    ${nestedSchemas(schema, ctx)}
}`
}
