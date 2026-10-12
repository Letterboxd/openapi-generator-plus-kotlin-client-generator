import { commonGenerator, configBoolean, configObject, configString, configStringArray, debugStringify } from '@openapi-generator-plus/generator-common'
import { emit as emitTemplate } from '@openapi-generator-plus/template-utils'
import { ConstantStyle, EnumMemberStyle, JavaLikeContext, javaLikeGenerator, options as javaLikeOptions } from '@openapi-generator-plus/java-like-generator-helper'
import { CodegenAllOfStrategy, CodegenAnyOfStrategy, CodegenConfig, CodegenDocument, CodegenGenerator, CodegenGeneratorContext, CodegenGeneratorType, CodegenLogLevel, CodegenNativeType, CodegenOneOfStrategy, CodegenSchemaPurpose, CodegenSchemaType, isCodegenEnumSchema, isCodegenHierarchySchema, isCodegenInterfaceSchema, isCodegenObjectSchema, isCodegenOneOfSchema } from '@openapi-generator-plus/types'
import path from 'path'
import { CodegenOptionsKotlin } from './types'
import * as templates from './templates'
import { KotlinModelContext, RootContext } from './templates'

export { CodegenOptionsKotlin as CodegenOptionsTypeScript } from './types'

function escapeString(value: string | number | boolean) {
	if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
		throw new Error(`escapeString called with unsupported type: ${typeof value} (${value})`)
	}

	value = String(value)
	value = value.replace(/\\/g, '\\\\')
	value = value.replace(/"/g, '\\"')
	value = value.replace(/\r/g, '\\r')
	value = value.replace(/\n/g, '\\n')
	return value
}

/**
 * Turns a Java package name into a path
 * @param packageName Java package name
 */
export function packageToPath(packageName: string): string {
	return packageName.replace(/\./g, path.sep)
}

function computeRelativeSourceOutputPath(config: CodegenConfig) {
	const gradle = config.gradle
	const defaultPath = gradle ? path.join('src', 'main', 'kotlin') : ''

	return configString(config, 'relativeSourceOutputPath', defaultPath)
}

function toSafeTypeForComposing(nativeType: string): string {
	return nativeType
}

export interface KotlinGeneratorContext extends CodegenGeneratorContext {
	/**
	 * Emit additional generator-specific files, beyond the files this generator
	 * emits itself.
	 */
	exportFiles?: (outputPath: string, doc: CodegenDocument, rootContext: Record<string, unknown>) => Promise<void>
	additionalWatchPaths?: () => string[]
	additionalCleanPathPatterns?: () => string[]
}

/**
 * Merge `add` (a chaining generator's own contribution) with `base` (whatever
 * the calling — and so more specific — generator has already assembled) to
 * produce the context to pass to this generator's implementation.
 */
export function chainKotlinGeneratorContext(base: KotlinGeneratorContext, add: Partial<KotlinGeneratorContext>): KotlinGeneratorContext {
	const result: KotlinGeneratorContext = {
		...base,
		additionalWatchPaths: function() {
			const result: string[] = []
			if (base.additionalWatchPaths) {
				result.push(...base.additionalWatchPaths())
			}
			if (add.additionalWatchPaths) {
				result.push(...add.additionalWatchPaths())
			}
			return result
		},
		exportFiles: async function(outputPath, doc, rootContext) {
			if (base.exportFiles) {
				await base.exportFiles(outputPath, doc, rootContext)
			}
			if (add.exportFiles) {
				await add.exportFiles(outputPath, doc, rootContext)
			}
		},
	}
	return result
}

/* https://kotlinlang.org/docs/keyword-reference.html#hard-keywords */
const RESERVED_WORDS = [
	'as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun', 'if', 'in', 'interface', 'is', 'null', 'object', 'package',
	'return', 'super', 'this', 'throw', 'true', 'try', 'typealias', 'typeof', 'val', 'var', 'when', 'while',
	'Unknown', // for our enum cases
]

export function options(config: CodegenConfig, context: KotlinGeneratorContext): CodegenOptionsKotlin {
	const packageName = configString(config, 'package', 'com.example')
	const apiPackage = configString(config, 'apiPackage', packageName)
	const supportPackage = `${packageName}.support`

	if (config.customTemplates !== undefined) {
		context.log(CodegenLogLevel.WARN, 'The customTemplates config option is no longer supported, because the templates are now TypeScript code in the generator. To change the generated code, fork the generator.')
	}

	const gradle = configObject(config, 'gradle', undefined)
	const groupId = gradle ? configString(gradle, 'groupId', 'com.example', 'gradle.') : 'com.example'

	const android = configObject(config, 'android', undefined)

	/* The Android library configuration is written into the generated `build.gradle.kts`, which is
	   only emitted when `gradle` is configured. Fail fast rather than silently ignoring `android`. */
	if (android && !gradle) {
		throw new Error('The "android" option requires the "gradle" option to be set, as the Android library configuration is written to the generated build.gradle.kts')
	}

	/* `urlImplementation` may be given either as a string (the Kotlin type, constructed via `Type(string)`)
	   or as an object `{ type, fromString }` for types that aren't constructed directly from a String,
	   e.g. `android.net.Uri` which uses `android.net.Uri.parse(string)`. */
	const urlImplementationConfig = config['urlImplementation']
	const urlImplementationObject = (urlImplementationConfig !== null && typeof urlImplementationConfig === 'object')
		? configObject(config, 'urlImplementation', undefined)
		: undefined
	const urlImplementation = urlImplementationObject
		? configString(urlImplementationObject, 'type', 'java.net.URL', 'urlImplementation.')
		: configString(config, 'urlImplementation', 'java.net.URL')
	const urlFromString = urlImplementationObject
		? configString(urlImplementationObject, 'fromString', urlImplementation, 'urlImplementation.')
		: urlImplementation

	const options: CodegenOptionsKotlin = {
		...javaLikeOptions(config, createJavaLikeContext(context)),
		apiPackage,
		modelPackage: configString(config, 'modelPackage', `${packageName}.model`),
		supportPackage: configString(config, 'supportPackage', supportPackage),
		securityPackage: configString(config, 'securityPackage', `${packageName}.security`),
		hideGenerationTimestamp: configBoolean(config, 'hideGenerationTimestamp', false),

		dateImplementation: configString(config, 'dateImplementation', `${supportPackage}.LocalDate`),
		timeImplementation: configString(config, 'timeImplementation', `${supportPackage}.LocalTime`),
		dateTimeImplementation: configString(config, 'dateTimeImplementation', `${supportPackage}.Instant`),
		binaryRepresentation: configString(config, 'binaryRepresentation', 'kotlin.ByteArray'),

		urlImplementation,
		urlFromString,

		isJavaSerializable: configBoolean(config, 'isJavaSerializable', true),

		gradle: gradle ? {
			groupId,
			version: configString(gradle, 'version', '0.0.1', 'gradle.'),
			versions: configObject(gradle, 'versions', {}, 'gradle.'),
			plugins: configStringArray(gradle, 'plugins', [], 'gradle.'),
			dependencies: configStringArray(gradle, 'dependencies', [], 'gradle.'),
		} : null,

		android: android ? {
			plugin: configString(android, 'plugin', 'alias(libs.plugins.android.library)', 'android.'),
			/* `compileSdk` may be a literal API level (`36`) or a Kotlin expression
			   (`libs.versions.android.compileSdk.get().toInt()`); either is emitted verbatim. */
			compileSdk: typeof android['compileSdk'] === 'number'
				? String(android['compileSdk'])
				: configString(android, 'compileSdk', '35', 'android.'),
			namespace: configString(android, 'namespace', groupId, 'android.'),
		} : null,

		relativeSourceOutputPath: computeRelativeSourceOutputPath(config),
	}

	return options
}

function createJavaLikeContext(context: KotlinGeneratorContext): JavaLikeContext {
	const javaLikeContext: JavaLikeContext = {
		...context,
		reservedWords: () => RESERVED_WORDS,
		defaultConstantStyle: ConstantStyle.pascalCase,
		defaultEnumMemberStyle: EnumMemberStyle.constant,
	}
	return javaLikeContext
}


export default function createGenerator(config: CodegenConfig, context: KotlinGeneratorContext): CodegenGenerator {
	const generatorOptions = options(config, context)

	const baseGenerator = context.baseGenerator(config, context)
	const aCommonGenerator = commonGenerator(config, context)
	return {
		...baseGenerator,
		...aCommonGenerator,
		...javaLikeGenerator(config, createJavaLikeContext(context)),
		toLiteral: (value, options) => {
			if (value === undefined) {
				const defaultValue = context.generator().defaultValue(options)
				if (defaultValue === null) {
					return null
				}
				return defaultValue.literalValue
			}

			const { type, format, nullable, schemaType } = options
			if (value === null) {
				if (nullable) {
					return 'null'
				}

				const defaultValue = context.generator().defaultValue(options)
				if (defaultValue === null) {
					return null
				}
				return defaultValue.literalValue
			}

			if (schemaType === CodegenSchemaType.ENUM) {
				return `${options.nativeType.concreteType}.${context.generator().toEnumMemberName(String(value))}`
			}

			switch (type) {
				case 'integer': {
					if (typeof value === 'string') {
						const parsedValue = parseInt(value)
						if (isNaN(parsedValue)) {
							throw new Error(`toLiteral with type integer called with non-number: ${typeof value} (${value})`)
						}
						value = parsedValue
					}
					if (typeof value !== 'number') {
						throw new Error(`toLiteral with type integer called with non-number: ${typeof value} (${value})`)
					}

					if (format === 'int32' || !format) {
						return `${value}`
					} else if (format === 'int64') {
						return `${value}L`
					} else {
						throw new Error(`Unsupported ${type} format: ${format}`)
					}
				}
				case 'number': {
					if (typeof value === 'string') {
						const parsedValue = parseFloat(value)
						if (isNaN(parsedValue)) {
							throw new Error(`toLiteral with type number called with non-number: ${typeof value} (${value})`)
						}
						value = parsedValue
					}
					if (typeof value !== 'number') {
						throw new Error(`toLiteral with type number called with non-number: ${typeof value} (${value})`)
					}

					if (format === 'float') {
						return `${value}f`
					} else if (format === 'double' || !format) {
						return `${value}`
					} else {
						throw new Error(`Unsupported ${type} format: ${format}`)
					}
				}
				case 'string': {
					if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
						throw new Error(`toLiteral with type string called with unsupported type: ${typeof value} (${value})`)
					}

					if (format === 'byte') {
						return `"${escapeString(value)}"`
					} else if (format === 'binary') {
						return `"${escapeString(value)}".toByteArray(kotlin.text.Charsets.UTF_8)`
					} else if (format === 'date') {
						return `${generatorOptions.dateImplementation}(value = "${escapeString(value)}")`
					} else if (format === 'time') {
						return `${generatorOptions.timeImplementation}(value = "${escapeString(value)}")`
					} else if (format === 'date-time') {
						return `${generatorOptions.dateTimeImplementation}(value = "${escapeString(value)}")`
					} else if (format === 'uuid') {
						return `java.util.UUID.fromString("${escapeString(value)}")`
					} else {
						return `"${escapeString(value)}"`
					}
				}
				case 'boolean':
					if (typeof value === 'string') {
						value = value.toLowerCase() === 'true'
					}
					if (typeof value === 'number') {
						value = value !== 0
					}
					if (typeof value !== 'boolean') {
						throw new Error(`toLiteral with type boolean called with non-boolean: ${typeof value} (${value})`)
					}

					return `${value}`
				case 'object':
					if (typeof value === 'string') {
						if (value) {
							return value
						} else {
							return 'null'
						}
					} else {
						context.log(CodegenLogLevel.WARN, `Literal is unsupported for schema type object: ${debugStringify(value)}`)
						return 'null'
					}
				case 'anyOf':
				case 'oneOf':
					context.log(CodegenLogLevel.WARN, `Literal value of type ${typeof value} is unsupported for schema type object: ${debugStringify(value)}`)
					return 'null'
				case 'file':
					throw new Error(`Cannot format literal for type ${type}`)
				case 'array': {
					const arrayValue = Array.isArray(value) ? value : [value]
					const component = options.component
					if (!component) {
						throw new Error(`toLiteral cannot format array literal without a component type: ${value}`)
					}
					return `listOf(${arrayValue.map(v => context.generator().toLiteral(v, { ...component.schema, ...component })).join(', ')})`
				}
			}

			throw new Error(`Unsupported literal type name "${type}" in options: ${debugStringify(options)}`)
		},
		toNativeType: (options) => {
			const { format, schemaType, vendorExtensions } = options

			/* Note that we return separate componentTypes in this function in case the type
			   is transformed, using nativeTypeTransformer, and the native type becomes primitive
			   as the component type must still be non-primitive.
			 */
			if (vendorExtensions && vendorExtensions['x-kotlin-type']) {
				return new context.NativeType(String(vendorExtensions['x-kotlin-type']))
			}

			/* See https://github.com/OAI/OpenAPI-Specification/blob/master/versions/2.0.md#data-types */
			switch (schemaType) {
				case CodegenSchemaType.INTEGER: {
					// TODO, DISCUSS WITH KARL & GRANT : Really...? Why do we want to use int which only has a precision of 32 bit when we are unsure of its format
					// instead of long which has more precision and thus support for larger numbers?
					//
					// See also:
					// - https://swagger.io/docs/specification/data-models/data-types/#numbers
					// - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number#number_encoding
					// - https://www.w3schools.com/js/js_numbers.asp

					if (format === 'int32' || !format) {
						return new context.NativeType('kotlin.Int')
					} else if (format === 'int64') {
						return new context.NativeType('kotlin.Long')
					} else {
						throw new Error(`Unsupported integer format: ${format}`)
					}
				}
				case CodegenSchemaType.NUMBER: {
					if (format === 'float') {
						return new context.NativeType('kotlin.Float')
					} else if (format === 'double' || !format) {
						return new context.NativeType('kotlin.Double')
					} else {
						throw new Error(`Unsupported number format: ${format}`)
					}
				}
				case CodegenSchemaType.DATE:
					return new context.NativeType(generatorOptions.dateImplementation, {
						serializedType: 'String',
					})
				case CodegenSchemaType.TIME:
					return new context.NativeType(generatorOptions.timeImplementation, {
						serializedType: 'String',
					})
				case CodegenSchemaType.DATETIME:
					return new context.NativeType(generatorOptions.dateTimeImplementation, {
						serializedType: 'String',
					})
				case CodegenSchemaType.STRING: {
					if (format === 'byte') {
						/* base64 encoded characters */
						return new context.NativeType('kotlin.String')
					} else if (format === 'uuid') {
						return new context.NativeType('java.util.UUID', {
							serializedType: 'String',
							info: {
								serialized: `@kotlinx.serialization.Serializable(with = ${generatorOptions.supportPackage}.KUUIDSerializer::class) java.util.UUID`,
							},
						})
					} else if (format === 'url') {
						return new context.NativeType(generatorOptions.urlImplementation, {
							serializedType: 'String',
							info: {
								serialized: `@kotlinx.serialization.Serializable(with = ${generatorOptions.supportPackage}.KURLSerializer::class) ${generatorOptions.urlImplementation}`,
							},
						})
					} else {
						return new context.NativeType('kotlin.String')
					}
				}
				case CodegenSchemaType.BOOLEAN: {
					return new context.NativeType('kotlin.Boolean')
				}
				case CodegenSchemaType.BINARY:
				case CodegenSchemaType.FILE: {
					return new context.NativeType(generatorOptions.binaryRepresentation)
				}
				case CodegenSchemaType.ANY: {
					return new context.NativeType('kotlin.Any', {
						info: {
							serialized: '@kotlinx.serialization.Contextual kotlin.Any',
						},
					})
				}
				case CodegenSchemaType.NULL: {
					return new context.NativeType('kotlin.Any', {
						info: {
							serialized: '@kotlinx.serialization.Contextual kotlin.Any',
						},
					})
				}
			}

			throw new Error(`Unsupported schema type: ${schemaType}`)
		},
		toNativeObjectType: function(options) {
			const { scopedName } = options
			let modelName = `${generatorOptions.modelPackage}`
			for (const name of scopedName) {
				modelName += `.${context.generator().toClassName(name)}`
			}
			return new context.NativeType(modelName)
		},
		toNativeArrayType: (options) => {
			const { componentNativeType, uniqueItems } = options
			if (uniqueItems) {
				return new context.TransformingNativeType(componentNativeType, {
					default: (nativeType) => `kotlin.collections.Set<${(nativeType.componentType || nativeType).nativeType}>`,
					literalType: () => 'kotlin.collections.Set',
					concreteType: (nativeType) => `kotlin.collections.Set<${(nativeType.componentType || nativeType).nativeType}>`,
					info: function(nativeType) {
						if (nativeType.componentType && nativeType.componentType.info && nativeType.componentType.info.serialized) {
							return {
								...nativeType.info,
								serialized: `kotlin.collections.Set<${nativeType.componentType.info.serialized}>`,
							}
						} else if (nativeType.info && nativeType.info.serialized) {
							return {
								...nativeType.info,
								serialized: `kotlin.collections.Set<${nativeType.info.serialized}>`,
							}
						}

						return nativeType.info
					},
				})
			} else {
				return new context.TransformingNativeType(componentNativeType, {
					default: (nativeType) => `kotlin.collections.List<${(nativeType.componentType || nativeType).nativeType}>`,
					literalType: () => 'kotlin.collections.List',
					concreteType: (nativeType) => `kotlin.collections.List<${(nativeType.componentType || nativeType).nativeType}>`,
					info: function(nativeType) {
						if (nativeType.componentType && nativeType.componentType.info && nativeType.componentType.info.serialized) {
							return {
								...nativeType.info,
								serialized: `kotlin.collections.List<${nativeType.componentType.info.serialized}>`,
							}
						} else if (nativeType.info && nativeType.info.serialized) {
							return {
								...nativeType.info,
								serialized: `kotlin.collections.List<${nativeType.info.serialized}>`,
							}
						}

						return nativeType.info
					},
				})
			}
		},
		toNativeMapType: (options) => {
			const { keyNativeType, componentNativeType } = options
			return new context.ComposingNativeType([keyNativeType, componentNativeType], {
				default: ([keyNativeType, componentNativeType]) => `kotlin.collections.Map<${(keyNativeType.componentType || keyNativeType).nativeType}, ${(componentNativeType.componentType || componentNativeType).nativeType}>`,
				literalType: () => 'kotlin.collections.Map',
				concreteType: ([keyNativeType, componentNativeType]) => `kotlin.collections.Map<${(keyNativeType.componentType || keyNativeType).nativeType}, ${(componentNativeType.componentType || componentNativeType).nativeType}>`,
				info: function([keyNativeType, componentNativeType], defaultComposer) {
					const actualKeyNativeType = keyNativeType.componentType || keyNativeType
					const actualComponentNativeType = componentNativeType.componentType || componentNativeType

					return {
						...defaultComposer([keyNativeType, componentNativeType]),
						serialized: `kotlin.collections.Map<${actualKeyNativeType.info?.serialized || actualKeyNativeType.nativeType}, ${actualComponentNativeType.info?.serialized || actualComponentNativeType.nativeType}>`,
					}
				},
			})
		},
		nativeTypeUsageTransformer: ({ nullable, required }) => ({
			default: function(nativeType, nativeTypeString) {
				if (nullable) {
					nativeTypeString = `${generatorOptions.supportPackage}.Nullable<${toSafeTypeForComposing(nativeTypeString)}>`
				}
				if (!required) {
					nativeTypeString = `${toSafeTypeForComposing(nativeTypeString)}?`
				}

				return nativeTypeString
			},
			/* We don't transform the concrete type as the concrete type is never null; we use it to make new objects */
			concreteType: null,
			parentType: null,
			info: function(nativeType) {
				if (nativeType.info && nativeType.info.serialized) {
					let nativeTypeString = nativeType.info.serialized as string

					if (nullable) {
						nativeTypeString = `${generatorOptions.supportPackage}.Nullable<${toSafeTypeForComposing(nativeTypeString)}>`
					}
					if (!required) {
						nativeTypeString = `${toSafeTypeForComposing(nativeTypeString)}?`
					}

					return {
						...nativeType.info,
						serialized: nativeTypeString,
					}
				}

				return nativeType.info
			},
		}),
		toSuggestedSchemaName: (name, options) => {
			if (options.schemaType === CodegenSchemaType.ENUM) {
				name = `${name}`
			} else if (options.purpose === CodegenSchemaPurpose.INTERFACE) {
				name = `i_${name}`
			} else if (options.purpose === CodegenSchemaPurpose.ABSTRACT_IMPLEMENTATION) {
				name = `abstract_${name}`
			} else if (options.purpose === CodegenSchemaPurpose.IMPLEMENTATION) {
				name = `${name}_impl`
			}
			return name
		},
		defaultValue: (options) => {
			const { schemaType, required } = options

			if (!required) {
				return { value: null, literalValue: 'null' }
			}

			switch (schemaType) {
				case CodegenSchemaType.ENUM:
				case CodegenSchemaType.DATE:
				case CodegenSchemaType.TIME:
				case CodegenSchemaType.DATETIME:
				case CodegenSchemaType.BINARY:
				case CodegenSchemaType.OBJECT:
				case CodegenSchemaType.STRING:
				case CodegenSchemaType.ARRAY:
				case CodegenSchemaType.MAP:
				case CodegenSchemaType.INTERFACE:
					return { value: null, literalValue: 'null' }
				case CodegenSchemaType.NUMBER: {
					const literalValue = context.generator().toLiteral(0.0, options)
					if (literalValue === null) {
						return null
					}
					return { value: 0.0, literalValue }
				}
				case CodegenSchemaType.INTEGER: {
					const literalValue = context.generator().toLiteral(0, options)
					if (literalValue === null) {
						return null
					}
					return { value: 0, literalValue }
				}
				case CodegenSchemaType.BOOLEAN: {
					const literalValue = context.generator().toLiteral(false, options)
					if (literalValue === null) {
						return null
					}
					return { value: false, literalValue }
				}
			}

			throw new Error(`Unsupported default value type: ${schemaType}`)
		},
		initialValue: (options) => {
			const { required, schemaType, nativeType, defaultValue } = options

			/*
			  Default values in the spec are intended to be applied when a client or server receives a
			  response or request, respectively, and values are missing.

			  This implementation means that properties with defaults will get those default values as
			  their initial value, meaning that any properties that are omitted in the _received_ request or
			  response will have the default value.

			  TODO But it also means that any requests or responses _sent_ will _also_ have the default values,
			  rather than omitting the property and letting the receiving side apply the default value. This
			  is NOT according to the spec and should be fixed.
			 */
			if (defaultValue) {
				return defaultValue
			}

			if (!required) {
				return null
			}

			/*
			  We create empty collections for required properties in the Java code. This is because we generate
			  convenience methods for collections that initialise the collection when adding the first element,
			  which would mean if we didn't initialise required collection properties we might end up sending
			  a null collection value if the code didn't _add_ any elements. This would then require
			  explicitly initialising each required collection in user code, either every time, or whenever
			  no elements are added to it.

			  Therfore we are not able to detect whether the user code has forgotten to populate the collection, like
			  we are with scalar required properties, so we populate it with an empty collection so we always generate
			  a valid result.
			 */
			switch (schemaType) {
				case CodegenSchemaType.ARRAY:
					/* Initialise required array properties with an empty array */
					return { value: [], literalValue: `listOf<${nativeType.componentType}>()` }
				case CodegenSchemaType.MAP:
					/* Initialise empty map properties with an empty map */
					return { value: {}, literalValue: `mapOf<${nativeType.componentType}>()` }
				default:
					return null
			}
		},
		operationGroupingStrategy: () => {
			return context.operationGroupingStrategies.addToGroupsByTagOrPath
		},

		allOfStrategy: () => CodegenAllOfStrategy.HIERARCHY,
		anyOfStrategy: () => CodegenAnyOfStrategy.OBJECT,
		oneOfStrategy: () => CodegenOneOfStrategy.NATIVE,

		supportsInheritance: () => false,
		supportsMultipleInheritance: () => false,
		nativeCompositionCanBeScope: () => false,
		nativeComposedSchemaRequiresName: () => true,
		nativeComposedSchemaRequiresObjectLikeOrWrapper: () => false,
		interfaceCanBeNested: () => true,

		watchPaths: () => {
			const result: string[] = []
			if (context.additionalWatchPaths) {
				result.push(...context.additionalWatchPaths())
			}
			return result.length ? result : undefined
		},

		generatorType: () => CodegenGeneratorType.CLIENT,

		cleanPathPatterns: () => {
			const relativeSourceOutputPath = generatorOptions.relativeSourceOutputPath

			const apiPackagePath = packageToPath(generatorOptions.apiPackage)
			const modelPackagePath = packageToPath(generatorOptions.modelPackage)

			const result = [
				path.join(relativeSourceOutputPath, apiPackagePath, '*Api.kt'),
				path.join(relativeSourceOutputPath, modelPackagePath, '*.kt'),
			]
			if (context.additionalCleanPathPatterns) {
				result.push(...context.additionalCleanPathPatterns())
			}
			return result
		},

		templateRootContext: () => {
			return {
				...aCommonGenerator.templateRootContext(),
				...generatorOptions,
				generatorClass: '@openapi-generator-plus/kotlin-client-generator',
			}
		},

		exportTemplates: async(outputPath, doc) => {
			/* `securitySchemes` and `servers` are document-wide, so they're merged in here rather
			   than contributed by `templateRootContext` — every template can rely on them. */
			const rootContext = {
				...context.generator().templateRootContext(),
				securitySchemes: doc.securitySchemes,
				servers: doc.servers,
			} as RootContext

			const modelContext: KotlinModelContext = {
				generatorContext: context,
				root: rootContext,
			}

			const relativeSourceOutputPath = generatorOptions.relativeSourceOutputPath

			const apiPackagePath = packageToPath(generatorOptions.apiPackage)
			for (const group of doc.groups) {
				const operations = group.operations
				if (!operations.length) {
					continue
				}

				await emitTemplate(templates.api(group, modelContext), path.join(outputPath, relativeSourceOutputPath, apiPackagePath, `${context.generator().toClassName(group.name)}Api.kt`), true)
			}

			const modelPackagePath = packageToPath(generatorOptions.modelPackage)
			for (const schema of context.utils.values(doc.schemas)) {
				if (isCodegenObjectSchema(schema)) {
					await emitTemplate(templates.pojo(schema, modelContext), path.join(outputPath, relativeSourceOutputPath, modelPackagePath, `${context.generator().toClassName(schema.name)}.kt`), true)
				} else if (isCodegenEnumSchema(schema)) {
					await emitTemplate(templates.enumModel(schema, modelContext), path.join(outputPath, relativeSourceOutputPath, modelPackagePath, `${context.generator().toClassName(schema.name)}.kt`), true)
				} else if (isCodegenInterfaceSchema(schema)) {
					await emitTemplate(templates.interfaceModel(schema, modelContext), path.join(outputPath, relativeSourceOutputPath, modelPackagePath, `${context.generator().toClassName(schema.name)}.kt`), true)
				} else if (isCodegenHierarchySchema(schema)) {
					await emitTemplate(templates.hierarchy(schema, modelContext), path.join(outputPath, relativeSourceOutputPath, modelPackagePath, `${context.generator().toClassName(schema.name)}.kt`), true)
				} else if (isCodegenOneOfSchema(schema)) {
					await emitTemplate(templates.oneOf(schema, modelContext), path.join(outputPath, relativeSourceOutputPath, modelPackagePath, `${context.generator().toClassName(schema.name)}.kt`), true)
				}
			}

			const gradle = generatorOptions.gradle
			if (gradle) {
				await emitTemplate(templates.buildGradleKts(gradle, modelContext), path.join(outputPath, 'build.gradle.kts'), true)
				await emitTemplate(templates.settingsGradleKts(), path.join(outputPath, 'settings.gradle.kts'), false)
				await emitTemplate(templates.libsVersionsToml(), path.join(outputPath, 'gradle', 'libs.versions.toml'), false)
			}

			/* Support */
			const supportPackagePath = packageToPath(generatorOptions.supportPackage)
			const supportFiles: [string, (ctx: KotlinModelContext) => string][] = [
				['APIException.kt', templates.apiException],
				['Configuration.kt', templates.configuration],
				['DateTime.kt', templates.dateTime],
				['Nullable.kt', templates.nullable],
				['Types.kt', templates.supportTypes],
				['URLSerializer.kt', templates.urlSerializer],
				['UUIDSerializer.kt', templates.uuidSerializer],
			]
			for (const [fileName, template] of supportFiles) {
				await emitTemplate(template(modelContext), path.join(outputPath, relativeSourceOutputPath, supportPackagePath, fileName), true)
			}

			/* Security */
			const securityPackagePath = packageToPath(generatorOptions.securityPackage)
			const securityFiles: [string, (ctx: KotlinModelContext) => string][] = [
				['APIKeySecurityClient.kt', templates.apiKeySecurityClient],
				['AbstractOAuthFlowClient.kt', templates.abstractOAuthFlowClient],
				['BasicAuthenticationSecurityClient.kt', templates.basicAuthenticationSecurityClient],
				['OAuthAccessToken.kt', templates.oauthAccessToken],
				['OAuthAccessTokenManager.kt', templates.oauthAccessTokenManager],
				['OAuthAuthorizationCodeFlowClient.kt', templates.oauthAuthorizationCodeFlowClient],
				['OAuthClientCredentialsFlowClient.kt', templates.oauthClientCredentialsFlowClient],
				['OAuthPasswordFlowClient.kt', templates.oauthPasswordFlowClient],
				['RequestData.kt', templates.requestData],
				['SecurityClient.kt', templates.securityClient],
				['SecurityClientController.kt', templates.securityClientController],
				['SecurityScheme.kt', templates.securityScheme],
			]
			for (const [fileName, template] of securityFiles) {
				await emitTemplate(template(modelContext), path.join(outputPath, relativeSourceOutputPath, securityPackagePath, fileName), true)
			}

			if (context.exportFiles) {
				await context.exportFiles(outputPath, doc, rootContext)
			}
		},

		postProcessSchema(schema, helper) {
			function suggestedNameForType(type: CodegenNativeType): string {
				if (type.componentType) {
					return `${type.componentType.nativeType}_array`
				} else {
					return type.nativeType
				}
			}
			if (isCodegenOneOfSchema(schema)) {
				/* oneOf schemas turn into an enum, so each member needs a `name` for our enum */
				for (const comp of schema.composes) {
					if (comp.name === null) {
						comp.name = helper.uniqueName(suggestedNameForType(comp.nativeType), helper.scopeOf(schema), comp.schemaType, comp.purpose)
					}
				}
			}
		},

		checkPropertyCompatibility: (parentProp, childProp) => {
			if (!baseGenerator.checkPropertyCompatibility(parentProp, childProp)) {
				return false
			}

			/**
			 * Because in Kotlin we use `Nullable` if a value of a property can be specifically "null",
			 * properties are not compatible if their nullability varies.
			 */
			if (!parentProp.nullable !== !childProp.nullable) {
				return false
			}

			/**
			 * Because in Kotlin we use an interface for allOf,
			 * we can't comply if the required status mismatches at all,
			 * for the same reason as nullability above.
			 */
			if (parentProp.required !== childProp.required) {
				return false
			}
			return true
		},
	}
}
