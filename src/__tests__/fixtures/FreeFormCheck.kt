/*
 * Decodes JSON into the models of fixtures/free-form.yml, and checks that the
 * models keep every member of a free-form object or map, and encode it again.
 *
 * Run by free-form.spec.ts. It exits with an error when a check fails.
 */

package check

import com.example.kotlin.api.model.FreeForm
import com.example.kotlin.api.model.Holder
import com.example.kotlin.api.model.Status
import com.example.kotlin.api.support.Configuration
import com.example.kotlin.api.support.Nullable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

const val JSON = """
{
  "content": { "type": "doc", "content": [ { "type": "paragraph", "attrs": { "level": 1 } } ] },
  "body": { "type": "doc", "count": 2, "flag": true, "missing": null, "list": [1, "two"] },
  "nullableBody": null,
  "emptyAdditionalProperties": { "nested": { "deep": [ {} ] } },
  "freeForm": { "id": "abc", "values": [1.5, 2] },
  "anything": [ "a", { "b": 1 } ],
  "strings": { "a": "x" },
  "status": "something-new"
}
"""

fun check(condition: Boolean, message: String) {
    if (!condition) {
        throw IllegalStateException(message)
    }
}

fun main() {
    val json = Configuration().json
    val holder = json.decodeFromString(Holder.serializer(), JSON)

    check(holder.content.additionalProperties["type"]?.jsonPrimitive?.content == "doc", "content keeps its members: ${holder.content}")
    check(holder.content.additionalProperties["content"]?.jsonArray?.get(0)?.jsonObject?.get("attrs")?.jsonObject?.get("level") == JsonPrimitive(1), "content keeps nested members: ${holder.content}")
    check(holder.body["count"] == JsonPrimitive(2), "body keeps its members: ${holder.body}")
    check(holder.body["list"]?.jsonArray?.size == 2, "body keeps arrays: ${holder.body}")
    check(holder.nullableBody == Nullable.Null, "nullableBody is null: ${holder.nullableBody}")
    check(holder.emptyAdditionalProperties?.get("nested")?.jsonObject?.get("deep")?.jsonArray?.size == 1, "emptyAdditionalProperties keeps its members: ${holder.emptyAdditionalProperties}")
    check(holder.freeForm == FreeForm(mapOf("id" to JsonPrimitive("abc"), "values" to kotlinx.serialization.json.JsonArray(listOf(JsonPrimitive(1.5), JsonPrimitive(2))))), "freeForm keeps its members: ${holder.freeForm}")
    check(holder.anything?.jsonArray?.size == 2, "anything keeps its value: ${holder.anything}")
    check(holder.strings == mapOf("a" to "x"), "strings keeps its members: ${holder.strings}")
    check(holder.status == Status.Unknown("something-new"), "status keeps an unknown value: ${holder.status}")

    /* Every member survives a round trip */
    val encoded = json.encodeToJsonElement(Holder.serializer(), holder)
    val expected = json.parseToJsonElement(JSON) as JsonObject
    check(encoded == expected, "the JSON round-trips:\n$encoded\n$expected")

    /* A caller can make a free-form object */
    val made = Holder(content = Holder.Content(mapOf("a" to JsonPrimitive("b"))), body = mapOf("c" to JsonPrimitive(1)))
    check(json.encodeToString(Holder.serializer(), made) == """{"content":{"a":"b"},"body":{"c":1}}""", "a made object encodes: ${json.encodeToString(Holder.serializer(), made)}")
}
