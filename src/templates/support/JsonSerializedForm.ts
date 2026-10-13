import { ts } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { generatedBy } from '../frag/generatedBy'

/** The form that a model which holds JSON values takes in Java serialization. */
export function jsonSerializedForm(ctx: KotlinModelContext): string {
	const root = ctx.root
	return ts`
/*
 * ${generatedBy(root)}
 */

package ${root.supportPackage}

/**
 * The form that a model which holds JSON values takes in Java serialization. A JSON value isn't
 * \`java.io.Serializable\`, so the model is written as its JSON text, and read back from it.
 */
class JsonSerializedForm private constructor(private val type: Class<*>, private val json: String) : java.io.Serializable {

    private fun readResolve(): Any = format.decodeFromString(kotlinx.serialization.serializer(type), json)

    companion object {
        private const val serialVersionUID: Long = 1L

        private val format = kotlinx.serialization.json.Json {
            ignoreUnknownKeys = true
            serializersModule = supportSerializersModule
        }

        /** The form of [value] in Java serialization. */
        fun of(value: Any): JsonSerializedForm =
            JsonSerializedForm(value.javaClass, format.encodeToString(kotlinx.serialization.serializer(value.javaClass), value))
    }
}
`
}
