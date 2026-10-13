/*
 * The scaffold that every driver of the kotlin-client family builds on: announce
 * a case, make a call, and write the report.
 *
 * The suite copies this file into the generated project next to the entry file
 * of the suite that it runs. It depends only on the support types that every
 * generated project holds, so one copy serves every suite.
 *
 * The generated project must use the package com.example.kotlin.api, because
 * the drivers import the generated types from it.
 */

package conformance

import com.example.kotlin.api.support.APIException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse

/**
 * Announces cases to the recording server, records what each call produced, and
 * writes the report when the suite ends.
 *
 * Make one from the command line arguments, then call [startCase] before the
 * calls of each case, and [finish] after the last case.
 */
class ConformanceHarness(arguments: Array<String>) {

    /** The base URL of the recording server. */
    val baseUrl: String = arguments[0]
    private val resultsPath: String = arguments[1]

    private val cases = mutableListOf<Pair<String, MutableList<JsonObject>>>()
    private val http = HttpClient.newHttpClient()

    /** Tell the server which case is starting, so it records and answers for that case. */
    fun startCase(id: String) {
        cases.add(id to mutableListOf())

        val request = HttpRequest.newBuilder(URI.create("$baseUrl/__conformance/case"))
            .POST(HttpRequest.BodyPublishers.ofString(id))
            .build()
        http.send(request, HttpResponse.BodyHandlers.discarding())
    }

    /**
     * Make one call, and record the status of the result class that the client
     * produced, with the value that [reading] makes of the result.
     *
     * A generated operation returns a sealed class with a member for each
     * documented status, named after the status code, which carries the decoded
     * body. Give [reading] to report the body, or a value that the body alone
     * can't give, such as whether a property is null or absent.
     */
    suspend fun <R : Any> call(operation: suspend () -> Result<R>, reading: (R) -> JsonElement? = { null }) {
        record {
            val result = operation().getOrThrow()
            val status = statusOf(result) ?: throw IllegalStateException("Unknown result class: $result")
            buildJsonObject {
                put("outcome", if (status >= 400) "error" else "success")
                put("httpStatus", status)
                reading(result)?.let { put("value", it) }
            }
        }
    }

    /**
     * Make one call, and record the value that [reading] makes of the result,
     * whatever the status that the result carries.
     *
     * Use this where a case asks what a caller can read from a failure response.
     * [call] reports a failure status as an error.
     */
    suspend fun <R : Any> callReading(operation: suspend () -> Result<R>, reading: (R) -> JsonElement?) {
        record {
            val result = operation().getOrThrow()
            buildJsonObject {
                put("outcome", "success")
                reading(result)?.let { put("value", it) }
            }
        }
    }

    /** Record the call that [body] reports, or how it failed. */
    private suspend fun record(body: suspend () -> JsonObject) {
        val call = try {
            body()
        } catch (e: APIException.UnexpectedResponse) {
            /* The client reports an undocumented status as an error that carries the response */
            buildJsonObject {
                put("outcome", "error")
                put("httpStatus", e.response.status.value)
            }
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Throwable) {
            buildJsonObject {
                put("outcome", "exception")
                put("error", e.toString())
            }
        }
        cases.last().second.add(call)
    }

    /** Write the report of every case that ran. */
    fun finish() {
        val report = JsonObject(mapOf(
            "cases" to JsonArray(cases.map { (id, calls) ->
                JsonObject(mapOf("id" to JsonPrimitive(id), "calls" to JsonArray(calls)))
            }),
        ))
        java.io.File(resultsPath).writeText(report.toString())
    }

    /** The status code that a result class names, such as 200 for `` `200` ``. */
    private fun statusOf(result: Any): Int? = result::class.simpleName?.toIntOrNull()
}

/** [value] as JSON, through the serializer that the client uses for its type. */
inline fun <reified T> json(value: T): JsonElement =
    kotlinx.serialization.json.Json.encodeToJsonElement(kotlinx.serialization.serializer<T>(), value)
