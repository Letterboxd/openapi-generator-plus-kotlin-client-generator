import { CodegenObjectSchema } from '@openapi-generator-plus/types'
import { each, SKIP, stringLiteral, ts, when } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { propertyValues } from '../helpers'
import { propertyDocumentation, schemaDocumentation } from './documentation'
import { propertiesConstructor } from './propertiesConstructor'
import { nestedSchemas } from './nestedSchemas'
import { NarrowedDiscriminatorProperty, narrowedDiscriminatorProperties } from './discriminator'

/** The supertypes of the class for an object schema: its parents, its interfaces, and `java.io.Serializable` when configured. */
function supertypes(schema: CodegenObjectSchema, ctx: KotlinModelContext): string {
	const parents: string[] = []
	if (schema.parents) {
		for (const parent of schema.parents) {
			if (parent.nativeType.parentType) {
				parents.push(parent.nativeType.parentType)
			}
		}
	}
	if (schema.implements) {
		for (const implemented of schema.implements) {
			if (implemented.nativeType.parentType) {
				parents.push(implemented.nativeType.parentType)
			}
		}
	}
	if (ctx.root.isJavaSerializable) {
		parents.push('java.io.Serializable')
	}
	return parents.join(', ')
}

/**
 * A discriminator property that the class fixes to its own value, declared in the class body.
 *
 * It's always encoded, even though it holds its initial value, so that the class writes it whether
 * it's sent on its own or as a member of a oneOf.
 */
function narrowedProperty(narrowed: NarrowedDiscriminatorProperty, ctx: KotlinModelContext): string {
	return ts`
${narrowed.property ? propertyDocumentation(narrowed.property) : SKIP}
/** The discriminator value that identifies this type. It's fixed, so it always agrees with the type. */
${when(narrowed.property?.deprecated, '@kotlin.Deprecated(message = "This property is deprecated.")')}
@kotlinx.serialization.EncodeDefault(kotlinx.serialization.EncodeDefault.Mode.ALWAYS)
@kotlinx.serialization.SerialName(value = ${stringLiteral(ctx.generatorContext, narrowed.serializedName)})
${narrowed.property?.overrides ? 'override ' : ''}val ${narrowed.name}: ${narrowed.nativeType} = ${narrowed.literalValue}`
}

/**
 * An object schema rendered as a Kotlin class: a serializable data class when
 * it has properties, with its interfaces as supertypes and any nested schemas
 * in its body.
 *
 * A discriminator property that the class fixes to its own value is declared in the class body,
 * so it's left out of the constructor. Every other property, including a discriminator property
 * that the schema declares for its members to fix, is a constructor parameter.
 */
export function pojoFrag(schema: CodegenObjectSchema, ctx: KotlinModelContext): string {
	if (isFreeFormObject(schema)) {
		return freeFormFrag(schema, ctx)
	}

	const narrowed = narrowedDiscriminatorProperties(schema)
	const properties = propertyValues(schema.properties).filter(property => !narrowed.some(candidate => candidate.serializedName === property.serializedName))

	const parentsList = supertypes(schema, ctx)

	let declaration = `${properties.length ? 'data ' : ''}class ${schema.name}`
	if (properties.length) {
		declaration += ts`(

    ${propertiesConstructor(properties, ctx)}

)`
	}
	if (parentsList) {
		declaration += ` : ${parentsList}`
	}
	const replacement = ctx.root.isJavaSerializable && properties.some(property => holdsJsonValues(String(property.nativeType)))
	if (narrowed.length || schema.schemas || replacement) {
		declaration += ts` {

    ${each(narrowed, property => narrowedProperty(property, ctx), '\n\n')}

    ${when(replacement, () => javaSerializationReplacement(ctx))}

    ${nestedSchemas(schema, ctx)}
}`
	}

	return ts`
${schemaDocumentation(schema)}
${when(schema.deprecated, '@kotlin.Deprecated(message = "This class is deprecated.")')}
${when(narrowed.length, '@OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)')}
@kotlinx.serialization.Serializable
${declaration}`
}

/** Whether a value of the Kotlin type `nativeType` holds JSON values, which aren't \`java.io.Serializable\`. */
export function holdsJsonValues(nativeType: string): boolean {
	return nativeType.includes('kotlinx.serialization.json.Json')
}

/**
 * The member of a class that holds JSON values, which aren't \`java.io.Serializable\`, that replaces it with its
 * JSON text in Java serialization.
 */
export function javaSerializationReplacement(ctx: KotlinModelContext): string {
	return ts`
/** Java serialization writes this as its JSON text, as the JSON values that it holds aren't serializable. */
private fun writeReplace(): Any = ${ctx.root.supportPackage}.JsonSerializedForm.of(this)`
}

/**
 * Whether `schema` describes no properties, and takes part in no hierarchy, so that its class holds its
 * members in `additionalProperties`.
 */
export function isFreeFormObject(schema: CodegenObjectSchema): boolean {
	return !propertyValues(schema.properties).length && !narrowedDiscriminatorProperties(schema).length && !schema.discriminator && !schema.implements?.length
}

/**
 * An object schema that describes no properties, rendered as a Kotlin class that keeps every member
 * of the object.
 *
 * An object schema without properties permits any properties, so the class holds the members in
 * `additionalProperties`, rather than discarding them all as a class without properties would. The
 * class encodes and decodes as the JSON object itself.
 */
function freeFormFrag(schema: CodegenObjectSchema, ctx: KotlinModelContext): string {
	const parentsList = supertypes(schema, ctx)
	const serializable = ctx.root.isJavaSerializable
	const members = 'kotlin.collections.Map<kotlin.String, kotlinx.serialization.json.JsonElement>'

	return ts`
${schemaDocumentation(schema)}
${when(schema.deprecated, '@kotlin.Deprecated(message = "This class is deprecated.")')}
@kotlinx.serialization.Serializable(with = ${schema.name}.Serializer::class)
data class ${schema.name}(

    /** The members of the object. The specification describes no properties for it, so it may hold any. */
    val additionalProperties: ${members} = emptyMap(),

)${parentsList ? ` : ${parentsList}` : ''} {

    /** The members of the object as a [kotlinx.serialization.json.JsonObject]. */
    fun toJsonObject(): kotlinx.serialization.json.JsonObject = kotlinx.serialization.json.JsonObject(additionalProperties)

    object Serializer : kotlinx.serialization.KSerializer<${schema.name}>${serializable ? ', java.io.Serializable' : ''} {
        ${when(serializable, () => ts`
private fun readResolve(): Any = Serializer
`)}
        override val descriptor: kotlinx.serialization.descriptors.SerialDescriptor =
            kotlinx.serialization.json.JsonObject.serializer().descriptor

        override fun deserialize(decoder: kotlinx.serialization.encoding.Decoder): ${schema.name} =
            ${schema.name}(additionalProperties = kotlinx.serialization.json.JsonObject.serializer().deserialize(decoder))

        override fun serialize(encoder: kotlinx.serialization.encoding.Encoder, value: ${schema.name}) =
            kotlinx.serialization.json.JsonObject.serializer().serialize(encoder, value.toJsonObject())
    }

    ${when(serializable, () => javaSerializationReplacement(ctx))}

    ${nestedSchemas(schema, ctx)}
}`
}
