import { CodegenDiscriminator, CodegenObjectSchema, CodegenProperty, CodegenSchema, CodegenSchemaType } from '@openapi-generator-plus/types'
import { propertyValues } from '../helpers'

/**
 * A discriminator property that a member schema fixes to its own value.
 *
 * The member declares it in its class body with its value as the initializer, rather than as a
 * constructor parameter, so a caller can't give it a value that disagrees with the member's type.
 * The member always writes it when it's encoded.
 */
export interface NarrowedDiscriminatorProperty {
	/** The Kotlin name of the property. */
	name: string
	/** The name of the property on the wire. */
	serializedName: string
	/** The Kotlin type of the property. */
	nativeType: string
	/** The member's value, as a Kotlin literal. */
	literalValue: string
	/** The property as the schema declares it, if it does. */
	property: CodegenProperty | null
}

/** The narrowed properties of each schema, as the templates ask for them many times for each schema. */
const narrowedCache = new WeakMap<CodegenSchema, NarrowedDiscriminatorProperty[]>()

/**
 * The discriminator properties that `schema` fixes to its own value.
 *
 * A schema that is a member of a discriminator holds that discriminator's value. When every
 * discriminator that the schema is a member of agrees on the value of a property, the property is
 * narrowed to that value. When they disagree, the property can't be narrowed, so it's left for the
 * caller to set.
 *
 * The property keeps the type the schema declares, so that it still satisfies any interface that
 * requires it. When the schema doesn't declare the property, it takes the discriminator's type.
 */
export function narrowedDiscriminatorProperties(schema: CodegenSchema): NarrowedDiscriminatorProperty[] {
	let result = narrowedCache.get(schema)
	if (!result) {
		result = findNarrowedDiscriminatorProperties(schema)
		narrowedCache.set(schema, result)
	}
	return result
}

function findNarrowedDiscriminatorProperties(schema: CodegenSchema): NarrowedDiscriminatorProperty[] {
	if (schema.schemaType !== CodegenSchemaType.OBJECT) {
		return []
	}
	const objectSchema = schema as CodegenObjectSchema
	if (!objectSchema.discriminatorValues) {
		return []
	}

	const properties = propertyValues(objectSchema.properties)
	const valuesBySerializedName = new Map<string, { discriminator: CodegenDiscriminator; literalValues: Set<string> }>()
	for (const discriminatorValue of objectSchema.discriminatorValues) {
		const discriminator = discriminatorValue.discriminator
		if (!discriminator) {
			continue
		}
		const existing = valuesBySerializedName.get(discriminator.serializedName)
		if (existing) {
			existing.literalValues.add(discriminatorValue.literalValue)
		} else {
			valuesBySerializedName.set(discriminator.serializedName, { discriminator, literalValues: new Set([discriminatorValue.literalValue]) })
		}
	}

	const result: NarrowedDiscriminatorProperty[] = []
	for (const [serializedName, { discriminator, literalValues }] of valuesBySerializedName) {
		if (literalValues.size !== 1) {
			continue
		}
		const property = properties.find(candidate => candidate.serializedName === serializedName) || null
		result.push({
			name: property ? property.name : discriminator.name,
			serializedName,
			nativeType: property ? String(property.nativeType) : String(discriminator.nativeType),
			literalValue: [...literalValues][0],
			property,
		})
	}
	return result
}

/** Whether `schema` fixes the value of `discriminator`'s property itself, so that it writes the property when it's encoded. */
export function narrowsDiscriminator(schema: CodegenSchema, discriminator: CodegenDiscriminator): boolean {
	return narrowedDiscriminatorProperties(schema).some(narrowed => narrowed.serializedName === discriminator.serializedName)
}

/**
 * Whether `schema` holds `discriminator`'s property, either as a property that it declares or as
 * one that it narrows, so that it reads the property when it's decoded.
 */
export function holdsDiscriminatorProperty(schema: CodegenSchema, discriminator: CodegenDiscriminator): boolean {
	if (narrowsDiscriminator(schema, discriminator)) {
		return true
	}
	if (schema.schemaType !== CodegenSchemaType.OBJECT) {
		return false
	}
	return propertyValues((schema as CodegenObjectSchema).properties).some(property => property.serializedName === discriminator.serializedName)
}
