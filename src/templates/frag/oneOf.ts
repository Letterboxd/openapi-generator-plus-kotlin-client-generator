import { CodegenDiscriminator, CodegenDiscriminatorReference, CodegenHierarchySchema, CodegenOneOfSchema, CodegenSchema, CodegenSchemaType } from '@openapi-generator-plus/types'
import { className, each, isAllOf, isArray, isBoolean, isEnum, isInterface, isMap, isNumeric, isObject, Skip, SKIP, stringLiteral, ts, when } from '@openapi-generator-plus/template-utils'
import { doubleLiteral, isNumericEnum, isTextValue, numericEnumKind, supportDateAccessor } from '../helpers'
import { KotlinModelContext } from '../types'
import { schemaDocumentation } from './documentation'
import { nestedSchemas } from './nestedSchemas'
import { holdsJsonValues, javaSerializationReplacement } from './pojo'
import { holdsDiscriminatorProperty, narrowsDiscriminator } from './discriminator'

/** The kind of number that `discriminator` is, or `null` when it isn't a number. */
function discriminatorNumberKind(discriminator: CodegenDiscriminator): 'LONG' | 'DOUBLE' | null {
	if (discriminator.schema.schemaType === CodegenSchemaType.INTEGER) {
		return 'LONG'
	}
	if (discriminator.schema.schemaType === CodegenSchemaType.NUMBER) {
		return 'DOUBLE'
	}
	return numericEnumKind(discriminator.schema)
}

/**
 * The name of the constant that holds the number of a mapping value of a numeric discriminator, as a \`BigDecimal\`, or
 * `null` when the value isn't a number.
 */
function mappingNumber(schema: CodegenOneOfSchema | CodegenHierarchySchema, discriminator: CodegenDiscriminator, ref: CodegenDiscriminatorReference): string | null {
	if (!isNumberText(ref.value)) {
		return null
	}
	return `mappingNumber${memberReferences(schema, discriminator).indexOf(ref)}`
}

/** The constants that hold the numbers of the mapping values of a numeric discriminator, which the decoder matches against. */
function mappingNumbers(schema: CodegenOneOfSchema | CodegenHierarchySchema, discriminator: CodegenDiscriminator, ctx: KotlinModelContext): string | Skip {
	if (discriminatorNumberKind(discriminator) === null) {
		return SKIP
	}
	return each(memberReferences(schema, discriminator), ref => {
		const number = mappingNumber(schema, discriminator, ref)
		return number ? `private val ${number} = java.math.BigDecimal(${stringLiteral(ctx.generatorContext, ref.value)})` : SKIP
	}, '\n')
}

/** Whether `value` is a JSON number. */
function isNumberText(value: string): boolean {
	return /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(value)
}

/**
 * A discriminator value as a `JsonPrimitive` of the type that it has on the wire: a boolean, a number
 * or a string.
 *
 * Members may each declare their own enum for the property, so an enum discriminator is written as
 * the string it's sent as, rather than as any one member's enum.
 */
function wireLiteral(discriminator: CodegenDiscriminator, value: string, ctx: KotlinModelContext): string {
	if (discriminator.schema.schemaType === CodegenSchemaType.BOOLEAN) {
		return `kotlinx.serialization.json.JsonPrimitive(${value === 'true' ? 'true' : 'false'})`
	}
	const kind = discriminatorNumberKind(discriminator)
	if (kind === 'LONG' && /^-?\d+$/.test(value)) {
		return `kotlinx.serialization.json.JsonPrimitive(${value}L)`
	}
	if (kind === 'LONG' && isNumberText(value)) {
		/* A mapping value such as 1.0, which the decoder matches as a number, is written as a number too */
		return `kotlinx.serialization.json.JsonPrimitive(java.math.BigDecimal(${stringLiteral(ctx.generatorContext, value)}).stripTrailingZeros().toPlainString().toBigDecimal())`
	}
	if (kind === 'DOUBLE' && isNumberText(value)) {
		return `kotlinx.serialization.json.JsonPrimitive(${doubleLiteral(value)})`
	}
	return `kotlinx.serialization.json.JsonPrimitive(${stringLiteral(ctx.generatorContext, value)})`
}

/** The members of the oneOf, which are the composed schemas that have a name, so that they have a member class. */
function members(schema: CodegenOneOfSchema | CodegenHierarchySchema): CodegenSchema[] {
	return schema.composes.filter(compose => !!compose.name)
}

/**
 * An expression of the serializer for the value of `member`. It's looked up in the support serializers module,
 * which holds the serializers of the types that aren't serializable themselves, such as \`java.util.UUID\`, as
 * a lookup ignores the serializer annotations of type arguments.
 */
function memberSerializer(member: CodegenSchema, ctx: KotlinModelContext): string {
	return `${ctx.root.supportPackage}.supportSerializersModule.serializer<${member.nativeType}>()`
}

/** The name of the member class, within the oneOf's sealed class, that wraps `member`. */
function memberClass(member: CodegenSchema, ctx: KotlinModelContext): string {
	return className(ctx.generatorContext.generator(), member.name!)
}

/**
 * The discriminator's references to the members of the oneOf, with one reference for each value.
 *
 * A reference to a schema that isn't a member has no member class to decode into, so it's left out.
 */
function memberReferences(schema: CodegenOneOfSchema | CodegenHierarchySchema, discriminator: CodegenDiscriminator): CodegenDiscriminatorReference[] {
	const names = new Set(members(schema).map(member => member.name))
	const values = new Set<string>()
	return discriminator.references.filter(ref => {
		if (!names.has(ref.schema.name) || values.has(ref.value)) {
			return false
		}
		values.add(ref.value)
		return true
	})
}

/**
 * The body of `deserialize` for a oneOf with a discriminator.
 *
 * The discriminator is read as the text of the JSON value, so a boolean or an enum discriminator is
 * matched by the value that it has on the wire. A member that holds the discriminator property reads
 * it, and a member that doesn't never sees it.
 */
function decodeWithDiscriminator(schema: CodegenOneOfSchema | CodegenHierarchySchema, discriminator: CodegenDiscriminator, ctx: KotlinModelContext): string {
	const name = schema.name
	const numeric = discriminatorNumberKind(discriminator) !== null
	return ts`
require(decoder is kotlinx.serialization.json.JsonDecoder)

val jsonObject = decoder.decodeJsonElement() as? kotlinx.serialization.json.JsonObject
    ?: throw kotlinx.serialization.SerializationException("A \`${name}\` must be a JSON object.")
val discriminatorValue = (jsonObject[${stringLiteral(ctx.generatorContext, discriminator.serializedName)}] as? kotlinx.serialization.json.JsonPrimitive)
    ?.takeUnless { it is kotlinx.serialization.json.JsonNull }
    ?.content
    ?: throw kotlinx.serialization.SerializationException("The discriminator for a member of \`${name}\` could not be found.")

${numeric ? ts`
/*
 * A number matches its value however it's written, such as 1.0 for 1, and a member that holds the discriminator
 * property reads it as its mapping writes it, so that a member with an integer property can read 1.0.
 */
val discriminatorNumber = discriminatorValue.toBigDecimalOrNull()
return when {
    ${each(memberReferences(schema, discriminator), ref => {
		const propertyName = stringLiteral(ctx.generatorContext, discriminator.serializedName)
		const number = mappingNumber(schema, discriminator, ref)
		const matches = number !== null
			? `discriminatorNumber?.compareTo(${number}) == 0`
			: `discriminatorValue == ${stringLiteral(ctx.generatorContext, ref.value)}`
		const tree = !holdsDiscriminatorProperty(ref.schema, discriminator)
			? `kotlinx.serialization.json.JsonObject(jsonObject - ${propertyName})`
			: number !== null
				? `kotlinx.serialization.json.JsonObject(jsonObject + (${propertyName} to kotlinx.serialization.json.JsonPrimitive(${number})))`
				: 'jsonObject'
		return `${matches} -> decoder.json.decodeFromJsonElement(${name}.${memberClass(ref.schema, ctx)}.serializer(), ${tree})`
	}, '\n')}
    else -> Unknown(${discriminator.name} = discriminatorValue)
}` : ts`
return when (discriminatorValue) {
    ${each(memberReferences(schema, discriminator), ref => {
		const tree = holdsDiscriminatorProperty(ref.schema, discriminator)
			? 'jsonObject'
			: `kotlinx.serialization.json.JsonObject(jsonObject - ${stringLiteral(ctx.generatorContext, discriminator.serializedName)})`
		return `${stringLiteral(ctx.generatorContext, ref.value)} -> decoder.json.decodeFromJsonElement(${name}.${memberClass(ref.schema, ctx)}.serializer(), ${tree})`
	}, '\n')}
    else -> Unknown(${discriminator.name} = discriminatorValue)
}`}`
}

/**
 * The body of `serialize` for a oneOf with a discriminator, with one branch for each member.
 *
 * A member that fixes the discriminator property to its own value writes the property itself, so the
 * oneOf writes it only for a member that doesn't. It replaces any value that the member holds. A
 * member that more than one value maps to is written with the first. A member that no value maps to
 * has no value to write, so it's written as it is.
 */
function encodeWithDiscriminator(schema: CodegenOneOfSchema | CodegenHierarchySchema, discriminator: CodegenDiscriminator, ctx: KotlinModelContext): string {
	const name = schema.name
	const references = memberReferences(schema, discriminator)
	return ts`
require(encoder is kotlinx.serialization.json.JsonEncoder)

when (value) {
    ${each(members(schema), member => {
		const ref = references.find(candidate => candidate.schema.name === member.name)
		if (!ref || narrowsDiscriminator(member, discriminator)) {
			return `is ${name}.${memberClass(member, ctx)} -> encoder.encodeSerializableValue(${name}.${memberClass(member, ctx)}.serializer(), value)`
		}
		return `is ${name}.${memberClass(member, ctx)} -> encoder.encodeJsonElement(withDiscriminator(encoder.json.encodeToJsonElement(${name}.${memberClass(member, ctx)}.serializer(), value), ${wireLiteral(discriminator, ref.value, ctx)}))`
	}, '\n')}
    is ${name}.Unknown -> throw kotlinx.serialization.SerializationException("Cannot encode an unknown member of \`${name}\`.")
}`
}

/**
 * A condition on a JSON value named `element` that it has the shape of a value of `member`, or `null` when any
 * shape may be. A member only tries to read a value of its shape, as a number member would read a string that
 * holds a number.
 */
function memberShape(member: CodegenSchema): string | null {
	if (isObject(member) || isMap(member) || isAllOf(member) || isInterface(member)) {
		return 'element is kotlinx.serialization.json.JsonObject'
	}
	if (isArray(member)) {
		return 'element is kotlinx.serialization.json.JsonArray'
	}
	if (isTextValue(member)) {
		return 'element is kotlinx.serialization.json.JsonPrimitive && element.isString'
	}
	if (isNumeric(member) || isBoolean(member) || isNumericEnum(member)) {
		return 'element is kotlinx.serialization.json.JsonPrimitive && !element.isString && element !is kotlinx.serialization.json.JsonNull'
	}
	return null
}

/**
 * The body of `deserialize` for a oneOf without a discriminator: try each member in turn, and
 * produce `Unknown` when none of them can read the value.
 *
 * The first pass doesn't let a member ignore a key that it doesn't declare, so that a member whose
 * properties are all optional doesn't read a value that another member describes. The second pass
 * lets it, as the configuration says, for a value with keys that no member declares.
 */
function decodeWithoutDiscriminator(schema: CodegenOneOfSchema | CodegenHierarchySchema, ctx: KotlinModelContext): string {
	const name = schema.name
	const attempts = (json: string) => each(members(schema), member => {
		/*
		 * A support date type holds any text, so its member checks that the text is a date. An enum reads any value of
		 * its shape, as Unknown when it doesn't know it, so its member takes a value that it knows, and the first enum
		 * member that reads a value as Unknown keeps it, in case no other member knows it.
		 */
		const parsed = supportDateAccessor(member.nativeType.concreteType, ctx)
		const check = parsed ? `.also { it.value.${parsed} }` : ''
		const result = isEnum(member)
			? `?.let { if (it.value !is ${member.nativeType.concreteType}.Unknown) return it; unknownMember = unknownMember ?: it }`
			: '?.let { return it }'
		const attempt = `runCatching { ${json}.decodeFromJsonElement(${name}.${memberClass(member, ctx)}.serializer(), element)${check} }.getOrNull()${result}`
		const shape = memberShape(member)
		return shape ? `if (${shape}) ${attempt}` : attempt
	}, '\n')
	const hasEnum = members(schema).some(member => isEnum(member))
	return ts`
require(decoder is kotlinx.serialization.json.JsonDecoder)

val element = decoder.decodeJsonElement()
${when(hasEnum, () => `var unknownMember: ${name}? = null`)}
val strictJson = strictJson(decoder.json)
${attempts('strictJson')}
if (strictJson !== decoder.json) {
    ${attempts('decoder.json')}
}
return ${hasEnum ? 'unknownMember ?: Unknown' : 'Unknown'}`
}

/** The body of `serialize` for a oneOf without a discriminator: write the member as it is. */
function encodeWithoutDiscriminator(schema: CodegenOneOfSchema | CodegenHierarchySchema, ctx: KotlinModelContext): string {
	const name = schema.name
	return ts`
when (value) {
    ${each(members(schema), member => `is ${name}.${memberClass(member, ctx)} -> encoder.encodeSerializableValue(${name}.${memberClass(member, ctx)}.serializer(), value)`, '\n')}
    is ${name}.Unknown -> throw kotlinx.serialization.SerializationException("Cannot encode an unknown member of \`${name}\`.")
}`
}

/**
 * A oneOf (or hierarchy) schema rendered as a sealed class with a member data
 * class wrapping each composed schema, an `Unknown` member for unrecognised
 * values, and a serializer that dispatches on the discriminator, or that tries
 * each member in turn when there is no discriminator.
 */
export function oneOfFrag(schema: CodegenOneOfSchema | CodegenHierarchySchema, ctx: KotlinModelContext): string {
	const generator = ctx.generatorContext.generator()
	const name = schema.name
	const serializable = ctx.root.isJavaSerializable
	const discriminator = schema.discriminator
	const parentType = schema.nativeType.parentType ?? ''

	const unknownMember = discriminator ? ts`
    /** A member that this client doesn't know, which the API identified with a discriminator value that the client doesn't recognise. */
    data class Unknown(

        /** The unknown discriminator value passed from the API. */
        val ${discriminator.name}: kotlin.String

    ) : ${parentType}()` : ts`
    /** A value that none of the members could read. */
    data object Unknown : ${parentType}()`

	return ts`
${schemaDocumentation(schema)}
@kotlinx.serialization.Serializable(with = ${name}.Serializer::class)
sealed class ${className(generator, name)}${serializable ? ' : java.io.Serializable' : ''} {${each(members(schema), compose => {
	const composeName = memberClass(compose, ctx)
	return '\n' + ts`

    @kotlinx.serialization.Serializable(with = ${composeName}.Serializer::class)
    data class ${composeName}(val value: ${compose.nativeType}) : ${parentType}() {
        object Serializer : kotlinx.serialization.KSerializer<${composeName}>${serializable ? ', java.io.Serializable' : ''} {
            ${when(serializable, () => ts`
private fun readResolve(): Any = Serializer
`)}
            private val valueSerializer: kotlinx.serialization.KSerializer<${compose.nativeType}> = ${memberSerializer(compose, ctx)}

            override val descriptor: kotlinx.serialization.descriptors.SerialDescriptor =
                valueSerializer.descriptor

            override fun deserialize(decoder: kotlinx.serialization.encoding.Decoder) =
                ${composeName}(value = valueSerializer.deserialize(decoder))

            override fun serialize(encoder: kotlinx.serialization.encoding.Encoder, value: ${composeName}) =
                valueSerializer.serialize(encoder, value.value)
        }
        ${when(serializable && holdsJsonValues(String(compose.nativeType)), () => javaSerializationReplacement(ctx))}
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
                element(${stringLiteral(ctx.generatorContext, discriminator ? discriminator.serializedName : '')}, kotlinx.serialization.serializer<String>().descriptor)
            }

        override fun deserialize(decoder: kotlinx.serialization.encoding.Decoder): ${name} {
            ${discriminator ? decodeWithDiscriminator(schema, discriminator, ctx) : decodeWithoutDiscriminator(schema, ctx)}
        }

        override fun serialize(encoder: kotlinx.serialization.encoding.Encoder, value: ${name}) {
            ${discriminator ? encodeWithDiscriminator(schema, discriminator, ctx) : encodeWithoutDiscriminator(schema, ctx)}
        }
        ${when(discriminator, () => ts`

${mappingNumbers(schema, discriminator!, ctx)}

/** The JSON object of a member, with the discriminator property set to \`discriminatorValue\`. */
private fun withDiscriminator(element: kotlinx.serialization.json.JsonElement, discriminatorValue: kotlinx.serialization.json.JsonPrimitive): kotlinx.serialization.json.JsonObject {
    val jsonObject = element as? kotlinx.serialization.json.JsonObject
        ?: throw kotlinx.serialization.SerializationException("A member of \`${name}\` must be a JSON object.")
    return kotlinx.serialization.json.JsonObject(jsonObject + (${stringLiteral(ctx.generatorContext, discriminator!.serializedName)} to discriminatorValue))
}`)}${when(!discriminator, () => ts`

@kotlin.jvm.Volatile
private var strictJsonCache: Pair<kotlinx.serialization.json.Json, kotlinx.serialization.json.Json>? = null

/** \`json\`, or a copy of it that doesn't ignore unknown keys when it does. */
private fun strictJson(json: kotlinx.serialization.json.Json): kotlinx.serialization.json.Json {
    if (!json.configuration.ignoreUnknownKeys) {
        return json
    }
    strictJsonCache?.let { (source, strict) -> if (source === json) return strict }
    return kotlinx.serialization.json.Json(from = json) { ignoreUnknownKeys = false }.also { strictJsonCache = json to it }
}`)}
    }

    ${nestedSchemas(schema, ctx)}
}`
}
