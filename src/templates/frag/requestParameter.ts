import { CodegenLogLevel, CodegenMapSchema, CodegenObjectSchema, CodegenParameterEncoding, CodegenProperty, CodegenSchema, CodegenSchemaUsage } from '@openapi-generator-plus/types'
import { allProperties, each, isAllOf, isAny, isAnyOf, isArray, isHierarchy, isInterface, isMap, isObject, isOneOf, isWrapper, stringLiteral, ts } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { isFreeFormObject } from './pojo'
import { serializerExpression } from '../helpers'

/** A schema usage that carries a serialized name: a parameter or a property. */
export type NamedSchemaUsage = CodegenSchemaUsage & { serializedName: string }

export interface RequestParameterOptions {
	/** The name of the `MutableList<Pair<String, String>>` to add the name/value pairs to. */
	dest: string
	/** The expression containing the value. */
	value: string
	/** The encoding to use for the parameter. */
	encoding: CodegenParameterEncoding | null | undefined
	/**
	 * Whether to percent encode each value, and each property name that an object style writes, but not
	 * the delimiters between them. Set it where nothing else encodes the values, such as in a cookie.
	 */
	percentEncode?: boolean
	/** Set once the optionality of the value has been unwrapped. */
	handledRequired?: boolean
	/** Set once the nullability of the value has been unwrapped. */
	handledNullable?: boolean
	/** How deeply the value is nested in unwrapping statements, so that each local variable has its own name. */
	depth?: number
}

/**
 * An expression converting `value`, a value of the given schema usage, to a
 * `String` for use in a URL, a header or a form-encoded body. The string is not
 * percent encoded, because the query, the form body or the header that it goes
 * into encodes it once.
 *
 * The behaviour for nested objects and arrays is undefined by the spec, but
 * editor.swagger.io transforms these into JSON, so we do too.
 */
export function schemaToString(usage: CodegenSchemaUsage, value: string): string {
	if (isAny(usage)) {
		return jsonElementToString(value, false)
	}
	if (isStructured(usage)) {
		/* A oneOf of scalars encodes as a JSON primitive, which is written as its content, like any scalar */
		return jsonElementToString(`configuration.json.encodeToJsonElement(${serializerExpression(usage.schema.nativeType)}, ${value})`, false)
	}
	return `${value}.toString()`
}

/** Whether a value of `usage` has structure, rather than being a scalar whose text is its `toString()`. */
function isStructured(usage: CodegenSchemaUsage): boolean {
	return isObject(usage) || isArray(usage) || isMap(usage) || isOneOf(usage) || isAnyOf(usage) || isAllOf(usage) || isHierarchy(usage) || isInterface(usage) || isWrapper(usage)
}

/**
 * The text of `element`, an element of an array or a value of a map, whose schema usage is `component`. A
 * nullable element is a \`Nullable\`, and a null element is written as an empty value, as for a null scalar.
 */
function elementToString(component: CodegenSchemaUsage, element: string, percentEncode: boolean | undefined, ctx: KotlinModelContext): string {
	if (component.nullable) {
		return `((${element} as? ${ctx.root.supportPackage}.Nullable.Some)?.let { ${valueToString(component, 'it.value', percentEncode)} } ?: "")`
	}
	return valueToString(component, element, percentEncode)
}

/** `schemaToString`, percent encoded when `percentEncode` is set. */
function valueToString(usage: CodegenSchemaUsage, value: string, percentEncode: boolean | undefined): string {
	const text = schemaToString(usage, value)
	return percentEncode ? `${text}.encodeURLParameter()` : text
}

/** A literal name, percent encoded when `percentEncode` is set. */
function literalName(name: string, percentEncode: boolean | undefined): string {
	return percentEncode ? encodeURIComponent(name) : name
}

/**
 * An expression that is the text of one property of an object for a style that joins the properties into one
 * value, or `null` when the object has no value for the property.
 */
function joinedProperty(property: CodegenProperty, value: string, keyValueSeparator: string, percentEncode: boolean | undefined, ctx: KotlinModelContext): string {
	const prefix = stringLiteral(ctx.generatorContext, `${literalName(property.serializedName, percentEncode)}${keyValueSeparator}`)
	const propertyValue = `${value}.${property.name}`
	if (property.nullable) {
		return `(${propertyValue} as? ${ctx.root.supportPackage}.Nullable.Some)?.let { ${prefix} + ${valueToString(property, 'it.value', percentEncode)} }`
	}
	if (!property.required) {
		return `${propertyValue}?.let { ${prefix} + ${valueToString(property, 'it', percentEncode)} }`
	}
	return `${prefix} + ${valueToString(property, propertyValue, percentEncode)}`
}

/**
 * The members of an object whose names its schema doesn't declare: the entries of a map, or the members of a
 * free-form object. `entries` is an expression of the `Map`, and `text` makes the text of a member's value.
 * `null` when the schema declares the object's properties.
 */
export function dynamicMembers(schema: CodegenSchema, value: string, ctx: KotlinModelContext): { entries: string; text: (element: string, percentEncode: boolean | undefined) => string } | null {
	if (isMap(schema)) {
		const component = (schema as CodegenMapSchema).component
		return { entries: value, text: (element, percentEncode) => elementToString(component, element, percentEncode, ctx) }
	}
	if (isObject(schema) && isFreeFormObject(schema as CodegenObjectSchema)) {
		return { entries: `${value}.additionalProperties`, text: jsonElementToString }
	}
	return null
}

/** An expression joining the properties of the object, or the entries of the map, in `value` into a single string. */
function objectToString(usage: NamedSchemaUsage, value: string, separator: string, keyValueSeparator: string, percentEncode: boolean | undefined, ctx: KotlinModelContext): string {
	const members = dynamicMembers(usage.schema, value, ctx)
	if (members) {
		const key = percentEncode ? 'localVarKey.encodeURLParameter()' : 'localVarKey'
		return `${members.entries}.entries.joinToString(${stringLiteral(ctx.generatorContext, separator)}) { (localVarKey, localVarElement) -> ${key} + ${stringLiteral(ctx.generatorContext, keyValueSeparator)} + ${members.text('localVarElement', percentEncode)} }`
	}
	const properties = allProperties(usage.schema as CodegenObjectSchema)
	return ts`
listOfNotNull(
    ${each(properties, property => `${joinedProperty(property, value, keyValueSeparator, percentEncode, ctx)},`, '\n')}
).joinToString(${stringLiteral(ctx.generatorContext, separator)})`
}

/** An expression joining the elements of the array in `value` into a single string. */
function arrayToString(usage: NamedSchemaUsage, value: string, separator: string, percentEncode: boolean | undefined, ctx: KotlinModelContext): string {
	const component = usage.schema.component
	if (!component) {
		throw new Error(`Array parameter has no component schema: ${usage.serializedName}`)
	}
	return `${value}.joinToString(${stringLiteral(ctx.generatorContext, separator)}) { ${elementToString(component, 'it', percentEncode, ctx)} }`
}

/** The style of a parameter or a form property, with the defaults of the form style when it declares no encoding. */
function queryEncoding(encoding: CodegenParameterEncoding | null | undefined): { style: string; explode: boolean } {
	return { style: encoding?.style ?? 'form', explode: encoding ? encoding.explode : true }
}

/** The statement that adds a single name/value pair, with the name percent encoded when `percentEncode` is set. */
function add(name: string, value: string, options: RequestParameterOptions, ctx: KotlinModelContext): string {
	return `${options.dest}.add(${stringLiteral(ctx.generatorContext, literalName(name, options.percentEncode))} to ${value})`
}

/**
 * An expression that is the text of `element`, a `JsonElement` such as a value of any type or a member of a
 * free-form object: the content of a primitive, an empty value for null, as for a null scalar, or the JSON of
 * an array or an object.
 */
function jsonElementToString(element: string, percentEncode: boolean | undefined): string {
	const text = `${element}.let { localVarJson -> if (localVarJson is kotlinx.serialization.json.JsonNull) "" else if (localVarJson is kotlinx.serialization.json.JsonPrimitive) localVarJson.content else localVarJson.toString() }`
	return percentEncode ? `${text}.encodeURLParameter()` : text
}

/**
 * Add the properties of an object one at a time, either as bare names or in `deepObject` brackets. Each name is
 * the property's name between `before` and `after`.
 *
 * A map, or a free-form object, adds each of its members.
 */
function explodedObject(usage: NamedSchemaUsage, options: RequestParameterOptions, before: string, after: string, ctx: KotlinModelContext): string {
	const members = dynamicMembers(usage.schema, options.value, ctx)
	if (members) {
		const key = options.percentEncode ? 'localVarKey.encodeURLParameter()' : 'localVarKey'
		const name = [before, after].map(part => part ? stringLiteral(ctx.generatorContext, literalName(part, options.percentEncode)) : null)
		const nameExpression = [name[0], key, name[1]].filter(part => part !== null).join(' + ')
		return `${members.entries}.forEach { (localVarKey, localVarElement) -> ${options.dest}.add(${nameExpression} to ${members.text('localVarElement', options.percentEncode)}) }`
	}
	const name = (property: CodegenProperty) => `${before}${property.serializedName}${after}`
	return each(allProperties(usage.schema as CodegenObjectSchema), property => {
		const propertyValue = `${options.value}.${property.name}`
		if (property.nullable) {
			return `(${propertyValue} as? ${ctx.root.supportPackage}.Nullable.Some)?.let { ${add(name(property), valueToString(property, 'it.value', options.percentEncode), options, ctx)} }`
		}
		if (!property.required) {
			return `${propertyValue}?.let { ${add(name(property), valueToString(property, 'it', options.percentEncode), options, ctx)} }`
		}
		return add(name(property), valueToString(property, propertyValue, options.percentEncode), options, ctx)
	}, '\n') as string
}

/**
 * The statements that add an array-valued parameter, according to its encoding style.
 *
 * An exploded delimited style writes one pair for each element, the same as the exploded form style, as
 * OpenAPI 3.1 defines it.
 */
function arrayParameter(usage: NamedSchemaUsage, options: RequestParameterOptions, ctx: KotlinModelContext): string {
	const { value, encoding } = options
	const component = usage.schema.component
	if (!component) {
		throw new Error(`Array parameter has no component schema: ${usage.serializedName}`)
	}

	const joined = (comment: string, separator: string) => ts`
/* ${comment} */
${add(usage.serializedName, arrayToString(usage, value, separator, options.percentEncode, ctx), options, ctx)}`
	const exploded = (comment: string) => ts`
/* ${comment} */
${value}.forEach { ${add(usage.serializedName, elementToString(component, 'it', options.percentEncode, ctx), options, ctx)} }`

	const { style, explode } = queryEncoding(encoding)
	switch (style) {
		case 'form':
			return explode ? exploded('array form exploded') : joined('array form', ',')
		case 'spaceDelimited':
			return explode ? exploded('array space delimited exploded') : joined('array space delimited', ' ')
		case 'pipeDelimited':
			return explode ? exploded('array pipe delimited exploded') : joined('array pipe delimited', '|')
		case 'simple':
			return joined('array simple', ',')
		default:
			ctx.generatorContext.log(CodegenLogLevel.WARN, `Array encoding style ${style} not supported`)
			return 'throw UnsupportedOperationException("Unsupported parameter encoding")'
	}
}

/** The statements that add an object-valued parameter, according to its encoding style. */
function objectParameter(usage: NamedSchemaUsage, options: RequestParameterOptions, ctx: KotlinModelContext): string {
	const { value, encoding } = options
	const joined = (comment: string, separator: string, keyValueSeparator: string) => ts`
/* ${comment} */
${add(usage.serializedName, objectToString(usage, value, separator, keyValueSeparator, options.percentEncode, ctx), options, ctx)}`

	const { style, explode } = queryEncoding(encoding)
	switch (style) {
		case 'form':
			if (explode) {
				return ts`
/* object form exploded */
${explodedObject(usage, options, '', '', ctx)}`
			}
			return joined('object form', ',', ',')
		case 'spaceDelimited':
			return joined('object space delimited', ' ', ' ')
		case 'pipeDelimited':
			return joined('object pipe delimited', '|', '|')
		case 'deepObject':
			return ts`
/* object deepObject */
${explodedObject(usage, options, `${usage.serializedName}[`, ']', ctx)}`
		case 'simple':
			if (explode) {
				return joined('object simple exploded', ',', '=')
			}
			return joined('object simple', ',', ',')
		default:
			ctx.generatorContext.log(CodegenLogLevel.WARN, `Object encoding style ${style} not supported`)
			return 'throw UnsupportedOperationException("Unsupported parameter encoding")'
	}
}

/**
 * Whether a null value goes on the wire as an empty value.
 *
 * Text has no null, so an empty value stands for it. An object or a map in a style that names each
 * of its properties, rather than the parameter, has no place for the empty value, so it's left out.
 */
function writesNullAsEmpty(usage: NamedSchemaUsage, encoding: CodegenParameterEncoding | null | undefined): boolean {
	if (!isObject(usage) && !isMap(usage)) {
		return true
	}
	const { style, explode } = queryEncoding(encoding)
	return style !== 'deepObject' && !(style === 'form' && explode)
}

/**
 * The statements that add a parameter, or a property of a form body, to a list of name/value pairs:
 * unwrapping optionality and nullability first, then adding the value according to its encoding.
 */
export function requestParameter(usage: NamedSchemaUsage, options: RequestParameterOptions, ctx: KotlinModelContext): string {
	const depth = options.depth ?? 0
	if (!usage.required && !options.handledRequired) {
		const name = `localVarValue${depth}`
		return ts`
${options.value}?.let { ${name} ->
    ${requestParameter(usage, { ...options, value: name, handledRequired: true, depth: depth + 1 }, ctx)}
}`
	}

	if (usage.nullable && !options.handledNullable) {
		const name = `localVarNullable${depth}`
		return ts`
when (val ${name} = ${options.value}) {
    is ${ctx.root.supportPackage}.Nullable.Null -> ${writesNullAsEmpty(usage, options.encoding) ? add(usage.serializedName, '""', options, ctx) : '{}'}
    is ${ctx.root.supportPackage}.Nullable.Some -> {
        ${requestParameter(usage, { ...options, value: `${name}.value`, handledNullable: true, depth: depth + 1 }, ctx)}
    }
}`
	}

	if (isArray(usage)) {
		return arrayParameter(usage, options, ctx)
	}
	if (isObject(usage) || isMap(usage)) {
		return objectParameter(usage, options, ctx)
	}
	return add(usage.serializedName, valueToString(usage, options.value, options.percentEncode), options, ctx)
}

/**
 * The text of a path parameter, according to its encoding style, to put in place of its template
 * expression in the path.
 *
 * Each value, and each property name that an object style writes, is percent encoded, but the
 * delimiters between them are not. The `simple` style is the default for a path parameter.
 */
export function pathParameterValue(usage: NamedSchemaUsage, encoding: CodegenParameterEncoding | null | undefined, value: string, ctx: KotlinModelContext): string {
	const style = encoding?.style ?? 'simple'
	const explode = encoding ? encoding.explode : false
	if (style !== 'simple' && style !== 'label' && style !== 'matrix') {
		ctx.generatorContext.log(CodegenLogLevel.WARN, `Path parameter encoding style ${style} not supported`)
		return 'throw UnsupportedOperationException("Unsupported parameter encoding")'
	}

	const name = literalName(usage.serializedName, true)
	/* The text in front of a value: a label's dot, or the parameter's name for a matrix */
	const prefix = style === 'simple' ? null : style === 'label' ? '"."' : stringLiteral(ctx.generatorContext, `;${name}=`)
	const prefixed = (text: string) => prefix ? `${prefix} + ${text}` : text

	if (isArray(usage)) {
		if (style === 'matrix') {
			/* An empty array names the parameter without a value */
			const separator = explode ? `;${name}=` : ','
			return `${value}.let { localVarArray -> if (localVarArray.isEmpty()) ${stringLiteral(ctx.generatorContext, `;${name}`)} else ${prefixed(arrayToString(usage, 'localVarArray', separator, true, ctx))} }`
		}
		return prefixed(arrayToString(usage, value, style === 'label' && explode ? '.' : ',', true, ctx))
	}
	if (isObject(usage) || isMap(usage)) {
		if (!explode) {
			return prefixed(objectToString(usage, value, ',', ',', true, ctx))
		}
		if (style === 'matrix') {
			/* An exploded matrix object names each of its properties instead of the parameter, so an object without a value for any property has no text */
			return `${objectToString(usage, value, ';', '=', true, ctx)}.let { if (it.isEmpty()) it else ";" + it }`
		}
		return prefixed(objectToString(usage, value, style === 'label' ? '.' : ',', '=', true, ctx))
	}
	return prefixed(valueToString(usage, value, true))
}
