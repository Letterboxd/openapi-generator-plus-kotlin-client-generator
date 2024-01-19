import { commonGenerator, configBoolean, configObject, configString, debugStringify } from '@openapi-generator-plus/generator-common'
import { emit, loadTemplates, registerStandardHelpers } from '@openapi-generator-plus/handlebars-templates'
import { ConstantStyle, JavaLikeContext, javaLikeGenerator, options as javaLikeOptions } from '@openapi-generator-plus/java-like-generator-helper'
import { CodegenAllOfStrategy, CodegenAnyOfStrategy, CodegenConfig, CodegenDocument, CodegenGenerator, CodegenGeneratorContext, CodegenGeneratorType, CodegenLogLevel, CodegenOneOfStrategy, CodegenSchemaType, isCodegenEnumSchema, isCodegenInterfaceSchema, isCodegenObjectSchema, isCodegenOneOfSchema } from '@openapi-generator-plus/types'
import Handlebars from 'handlebars'
import path from 'path'
import { CodegenOptionsKotlin } from './types'

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

function computeCustomTemplatesPath(configPath: string | undefined, customTemplatesPath: string) {
	if (configPath) {
		return path.resolve(path.dirname(configPath), customTemplatesPath) 
	} else {
		return customTemplatesPath
	}
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
	loadAdditionalTemplates?: (hbs: typeof Handlebars) => Promise<void>
	additionalWatchPaths?: () => string[]
	additionalExportTemplates?: (outputPath: string, doc: CodegenDocument, hbs: typeof Handlebars, rootContext: Record<string, unknown>) => Promise<void>
	additionalCleanPathPatterns?: () => string[]
}

export function chainKotlinGeneratorContext(base: KotlinGeneratorContext, add: Partial<KotlinGeneratorContext>): KotlinGeneratorContext {
	const result: KotlinGeneratorContext = {
		...base,
		loadAdditionalTemplates: async function(hbs) {
			/* Load the additional first, so that earlier contexts in the chain have priority */
			if (add.loadAdditionalTemplates) {
				await add.loadAdditionalTemplates(hbs)
			}
			if (base.loadAdditionalTemplates) {
				await base.loadAdditionalTemplates(hbs)
			}
		},
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
		additionalExportTemplates: async function(outputPath, doc, hbs, rootContext) {
			if (base.additionalExportTemplates) {
				await base.additionalExportTemplates(outputPath, doc, hbs, rootContext)
			}
			if (add.additionalExportTemplates) {
				await add.additionalExportTemplates(outputPath, doc, hbs, rootContext)
			}
		},
	}
	return result
}

/* https://kotlinlang.org/docs/keyword-reference.html#hard-keywords */
const RESERVED_WORDS = [
	'as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun', 'if', 'in', 'interface', 'is', 'null', 'object', 'package',
	'return', 'super', 'this', 'throw', 'true', 'try', 'typealias', 'typeof', 'val', 'var', 'when', 'while',
]

export function options(config: CodegenConfig, context: KotlinGeneratorContext): CodegenOptionsKotlin {
	const packageName = configString(config, 'package', 'com.example')
	const apiPackage = configString(config, 'apiPackage', packageName)
	
	const customTemplates = configString(config, 'customTemplates', undefined)

	const gradle = configObject(config, 'gradle', undefined)

	const options: CodegenOptionsKotlin = {
		...javaLikeOptions(config, createJavaLikeContext(context)),
		apiPackage,
		modelPackage: configString(config, 'modelPackage', `${packageName}.model`),
		customTemplatesPath: customTemplates ? computeCustomTemplatesPath(config.configPath, customTemplates) : null,
		hideGenerationTimestamp: configBoolean(config, 'hideGenerationTimestamp', false),

		dateImplementation: configString(config, 'dateImplementation', 'kotlinx.datetime.LocalDate'),
		timeImplementation: configString(config, 'timeImplementation', 'kotlinx.datetime.LocalTime'),
		dateTimeImplementation: configString(config, 'dateTimeImplementation', 'kotlinx.datetime.Instant'),
		binaryRepresentation: configString(config, 'binaryRepresentation', 'kotlin.ByteArray'),

		gradle: gradle ? {
			groupId: configString(gradle, 'groupId', 'com.example', 'gradle.'),
			version: configString(gradle, 'version', '0.0.1', 'gradle.'),
			versions: configObject(gradle, 'versions', {}, 'gradle.'),
		} : null,

		relativeSourceOutputPath: computeRelativeSourceOutputPath(config),
	}

	return options
}

function createJavaLikeContext(context: KotlinGeneratorContext): JavaLikeContext {
	const javaLikeContext: JavaLikeContext = {
		...context,
		reservedWords: () => RESERVED_WORDS,
		defaultConstantStyle: ConstantStyle.camelCase,
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
	
			const { type, format, required, nullable, schemaType } = options
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

					if (!format) {
						return `new java.math.BigDecimal("${value}")`
					} else if (format === 'float') {
						return `${value}f`
					} else if (format === 'double') {
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
						return `"${escapeString(value)}".getByteArray(kotlin.text.Charsets.UTF_8)`
					} else if (format === 'date') {
						return `${generatorOptions.dateImplementation}.parse("${escapeString(value)}")`
					} else if (format === 'time') {
						return `${generatorOptions.timeImplementation}.parse("${escapeString(value)}")`
					} else if (format === 'date-time') {
						return `${generatorOptions.dateTimeImplementation}.parse("${escapeString(value)}")`
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
					break
				case 'file':
					throw new Error(`Cannot format literal for type ${type}`)
				case 'array': {
					const arrayValue = Array.isArray(value) ? value : [value]
					const component = options.component
					if (!component) {
						throw new Error(`toLiteral cannot format array literal without a component type: ${value}`)
					}
					return `java.util.Arrays.asList(${arrayValue.map(v => context.generator().toLiteral(v, { ...component.schema, ...component })).join(', ')})`
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
					if (format === 'int32' || !format) {
						return new context.NativeType('kotlin.Int')
					} else if (format === 'int64') {
						return new context.NativeType('kotlin.Long')
					} else {
						throw new Error(`Unsupported integer format: ${format}`)
					}
				}
				case CodegenSchemaType.NUMBER: {
					if (!format) {
						return new context.NativeType('java.math.BigDecimal')
					} else if (format === 'float') {
						return new context.NativeType('kotlin.Float')
					} else if (format === 'double') {
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
						return new context.NativeType('String')
					} else if (format === 'uuid') {
						return new context.NativeType('java.util.UUID', {
							serializedType: 'String',
						})
					} else if (format === 'url') {
						return new context.NativeType('java.net.URL', {
							serializedType: 'String',
						})
					} else {
						return new context.NativeType('kotlin.String')
					}
				}
				case CodegenSchemaType.BOOLEAN: {
					return new context.NativeType('kotlin.Boolean')
				}
				case CodegenSchemaType.BINARY: {
					return new context.NativeType(generatorOptions.binaryRepresentation)
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
					default: (nativeType) => `kotlin.collections.List<${(nativeType.componentType || nativeType).nativeType}>`,
					literalType: () => 'kotlin.collections.List',
					concreteType: (nativeType) => `${(nativeType.componentType || nativeType).nativeType}`,
				})
			} else {
				return new context.TransformingNativeType(componentNativeType, {
					default: (nativeType) => `kotlin.collections.List<${(nativeType.componentType || nativeType).nativeType}>`,
					literalType: () => 'kotlin.collections.List',
					concreteType: (nativeType) => `${(nativeType.componentType || nativeType).nativeType}`,
				})
			}
		},
		toNativeMapType: (options) => {
			const { keyNativeType, componentNativeType } = options
			return new context.ComposingNativeType([keyNativeType, componentNativeType], {
				default: ([keyNativeType, componentNativeType]) => `kotlin.collections.Map<${(keyNativeType.componentType || keyNativeType).nativeType}, ${(componentNativeType.componentType || componentNativeType).nativeType}>`,
				literalType: () => 'kotlin.collections.Map',
				concreteType: ([keyNativeType, componentNativeType]) => `${(keyNativeType.componentType || keyNativeType).nativeType}, ${(componentNativeType.componentType || componentNativeType).nativeType}`,
			})
		},
		nativeTypeUsageTransformer: ({ nullable, required }) => ({
			default: function(nativeType, nativeTypeString) {
				if (nullable) {
					nativeTypeString = `Nullable<${toSafeTypeForComposing(nativeTypeString)}>`
				}
				if (!required) {
					nativeTypeString = `${toSafeTypeForComposing(nativeTypeString)}?`
				}

				return nativeTypeString
			},
			/* We don't transform the concrete type as the concrete type is never null; we use it to make new objects */
			concreteType: null,
			parentType: null,
		}),
		defaultValue: (options) => {
			const { schemaType } = options
	
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
					return { value: [], literalValue: `listOf<${nativeType.concreteType}>()` }
				case CodegenSchemaType.MAP:
					/* Initialise empty map properties with an empty map */
					return { value: {}, literalValue: `mapOf<${nativeType.concreteType}>()` }
				default:
					return null
			}
		},
		operationGroupingStrategy: () => {
			return context.operationGroupingStrategies.addToGroupsByTagOrPath
		},

		allOfStrategy: () => CodegenAllOfStrategy.OBJECT,
		anyOfStrategy: () => CodegenAnyOfStrategy.OBJECT,
		oneOfStrategy: () => CodegenOneOfStrategy.NATIVE,

		supportsInheritance: () => true,
		supportsMultipleInheritance: () => false,
		nativeCompositionCanBeScope: () => false,
		nativeComposedSchemaRequiresName: () => false,
		nativeComposedSchemaRequiresObjectLikeOrWrapper: () => false,
		interfaceCanBeNested: () => true,

		watchPaths: () => {
			const result = [path.resolve(__dirname, '..', 'templates')]
			if (context.additionalWatchPaths) {
				result.push(...context.additionalWatchPaths())
			}
			if (generatorOptions.customTemplatesPath) {
				result.push(generatorOptions.customTemplatesPath)
			}
			return result
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
			const hbs = Handlebars.create()

			registerStandardHelpers(hbs, context)

			await loadTemplates(path.resolve(__dirname, '..', 'templates'), hbs)
			if (context.loadAdditionalTemplates) {
				await context.loadAdditionalTemplates(hbs)
			}

			if (generatorOptions.customTemplatesPath) {
				await loadTemplates(generatorOptions.customTemplatesPath, hbs)
			}

			const rootContext = context.generator().templateRootContext()
			
			const relativeSourceOutputPath = generatorOptions.relativeSourceOutputPath

			const apiPackagePath = packageToPath(generatorOptions.apiPackage)
			for (const group of doc.groups) {
				const operations = group.operations
				if (!operations.length) {
					continue
				}
	
				await emit('api', path.join(outputPath, relativeSourceOutputPath, apiPackagePath, `${context.generator().toClassName(group.name)}Api.kt`), 
					{ ...rootContext, ...group, operations, servers: doc.servers }, true, hbs)
			}

			const modelPackagePath = packageToPath(generatorOptions.modelPackage)
			for (const schema of context.utils.values(doc.schemas)) {
				if (isCodegenObjectSchema(schema)) {
					await emit('pojo', path.join(outputPath, relativeSourceOutputPath, modelPackagePath, `${context.generator().toClassName(schema.name)}.kt`), 
						{ ...rootContext, pojo: schema }, true, hbs)
				} else if (isCodegenEnumSchema(schema)) {
					await emit('enum', path.join(outputPath, relativeSourceOutputPath, modelPackagePath, `${context.generator().toClassName(schema.name)}.kt`), 
						{ ...rootContext, enum: schema }, true, hbs)
				} else if (isCodegenInterfaceSchema(schema)) {
					await emit('interface', path.join(outputPath, relativeSourceOutputPath, modelPackagePath, `${context.generator().toClassName(schema.name)}.kt`), 
						{ ...rootContext, interface: schema }, true, hbs)
				} else if (isCodegenOneOfSchema(schema)) {
					await emit('oneOf', path.join(outputPath, relativeSourceOutputPath, modelPackagePath, `${context.generator().toClassName(schema.name)}.kt`), 
						{ ...rootContext, oneOf: schema }, true, hbs)
				}
			}
	
			const gradle = generatorOptions.gradle
			if (gradle) {
				await emit('build.gradle', path.join(outputPath, 'build.gradle'), { ...rootContext, ...gradle }, false, hbs)
			}
	
			if (context.additionalExportTemplates) {
				await context.additionalExportTemplates(outputPath, doc, hbs, rootContext)
			}
		},
	}
}
