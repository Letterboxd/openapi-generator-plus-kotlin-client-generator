/*
 * The conformance driver for the kotlin-client generator.
 *
 * The suite copies this file into the generated project, so the project's own
 * compiler checks it against the generated types. A signature change that a
 * caller cannot write then fails the build.
 *
 * The driver only makes calls. It reports what each call produced, and the suite
 * asserts on that, and on what a recording server received.
 *
 * Run it as: gradle conformance --args="<baseUrl> <resultsPath>"
 */

package conformance

import com.example.kotlin.api.BodyApi
import com.example.kotlin.api.FormApi
import com.example.kotlin.api.JsonApi
import com.example.kotlin.api.MultipartApi
import com.example.kotlin.api.QueryApi
import com.example.kotlin.api.ResponseApi
import com.example.kotlin.api.RootApi
import com.example.kotlin.api.SecurityApi
import com.example.kotlin.api.model.FormArraysRequest
import com.example.kotlin.api.model.FormObjectsRequest
import com.example.kotlin.api.model.FormScalarsRequest
import com.example.kotlin.api.model.JsonBody
import com.example.kotlin.api.model.MultipartPartsRequest
import com.example.kotlin.api.model.FormDelimitedExplodeRequest
import com.example.kotlin.api.model.QueryObject
import com.example.kotlin.api.model.SharedBody
import com.example.kotlin.api.security.APIKeySecurityClient
import com.example.kotlin.api.security.BasicAuthenticationSecurityClient
import com.example.kotlin.api.security.RequestData
import com.example.kotlin.api.security.SecurityClient
import com.example.kotlin.api.security.SecurityClientController
import com.example.kotlin.api.security.SecurityScheme
import com.example.kotlin.api.support.Configuration
import com.example.kotlin.api.support.Instant
import com.example.kotlin.api.support.LocalDate
import com.example.kotlin.api.support.Nullable
import io.ktor.client.request.HttpRequestBuilder
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

val WHEN = Instant("2020-01-02T03:04:05.678Z")
val DAY = LocalDate("2020-01-02")
const val PATH_SEGMENT = "a b/c?d#e&f+g%h:i@j"
const val QUERY_VALUE = "a b+c&d=e%f#g"
const val TEXT_BODY = "plain \"text\" body"
const val BINARY_BODY = "binary content"
const val API_KEY_HEADER = "header-key"
const val API_KEY_QUERY = "query-key"
const val BEARER_TOKEN = "bearer-token"
const val BASIC_USERNAME = "basic-user"
const val BASIC_PASSWORD = "basic-secret"

fun anObject() = QueryObject(name = "x", count = 1, aWhen = WHEN)

/**
 * A second object, so a case that sends more than one object can tell them apart.
 * The driver passes its arguments by position, so two equal objects would hide a
 * call that passes them in the wrong order.
 */
fun anotherObject() = QueryObject(name = "y", count = 2, aWhen = WHEN)

/** A joined style writes every property into one value, so it needs values that no style has to encode. */
fun aPlainObject() = QueryObject(name = "x", count = 1)

/**
 * How the driver reports one property of a response model: "absent" when the
 * model carries no value, "null" when it carries a null, and the value as text
 * otherwise.
 *
 * A model holds a null and an absent property differently in each language, and
 * neither survives a plain serialisation. So the driver names the state itself.
 */
fun <T> state(value: Nullable<T>?): String = when (value) {
    null -> "absent"
    is Nullable.Null -> "null"
    is Nullable.Some -> value.value.toString()
}

/** The state of every property of a nullable response model. */
fun statesOf(model: JsonBody): JsonElement = buildJsonObject {
    put("name", model.name)
    put("nullableName", state(model.nullableName))
    put("nullableCount", state(model.nullableCount))
    put("nullableWhen", state(model.nullableWhen))
    put("nullableChild", state(model.nullableChild))
    put("nullableList", state(model.nullableList))
}

/** How the driver reports a response header: its value as text, or "absent" where the response carried none. */
fun headerState(value: Any?): String = value?.toString() ?: "absent"

/**
 * Sends a bearer token in the `Authorization` header.
 *
 * The client gives a caller a security client for an API key and for HTTP basic
 * authentication. A caller supplies any other scheme through `SecurityClient`.
 */
class BearerSecurityClient(private val token: String) : SecurityClient {
    override suspend fun reauthenticate(requestData: RequestData, securityScheme: SecurityScheme, scopes: List<String>?): Result<Unit> =
        Result.success(Unit)

    override suspend fun authorize(requestBuilder: HttpRequestBuilder, securityScheme: SecurityScheme, scopes: List<String>?): Result<Unit> {
        requestBuilder.headers.append("Authorization", "Bearer $token")
        return Result.success(Unit)
    }
}

fun main(arguments: Array<String>) = runBlocking {
    val harness = ConformanceHarness(arguments)

    /*
     * The client asks for the credential of one scheme at a time, and names the
     * scheme. Each scheme has its own value, so a client that reads the credential
     * of another scheme shows it.
     */
    val configuration = Configuration(
        basePath = harness.baseUrl,
        securityClient = SecurityClientController(mutableMapOf(
            SecurityScheme.APIKEYHEADER to APIKeySecurityClient(API_KEY_HEADER, APIKeySecurityClient.Mode.HEADER, "X-Api-Key"),
            SecurityScheme.APIKEYQUERY to APIKeySecurityClient(API_KEY_QUERY, APIKeySecurityClient.Mode.QUERY, "api_key"),
            SecurityScheme.BEARERAUTH to BearerSecurityClient(BEARER_TOKEN),
            SecurityScheme.BASICAUTH to BasicAuthenticationSecurityClient(BASIC_USERNAME, BASIC_PASSWORD),
        )),
    )
    val query = QueryApi(configuration)
    val form = FormApi(configuration)
    val multipart = MultipartApi(configuration)
    val json = JsonApi(configuration)
    val body = BodyApi(configuration)
    val response = ResponseApi(configuration)
    val security = SecurityApi(configuration)
    val root = RootApi(configuration)

    harness.startCase("query-scalars-values")
    harness.call({ query.queryScalars(str = "hello world", num = 42, dbl = 1.5, flag = false, aWhen = WHEN, day = DAY) })

    harness.startCase("query-scalars-absent")
    harness.call({ query.queryScalars() })

    harness.startCase("query-scalars-empty-string")
    harness.call({ query.queryScalars(str = "") })

    harness.startCase("query-arrays-form")
    harness.call({ query.queryArrays(formExplode = listOf("a", "b"), formNoExplode = listOf("c", "d"), dateTimes = listOf(WHEN, WHEN)) })

    harness.startCase("query-arrays-delimited")
    harness.call({ query.queryArrays(pipe = listOf("a", "b"), space = listOf("c", "d")) })

    harness.startCase("query-arrays-empty")
    harness.call({ query.queryArrays(formExplode = listOf(), formNoExplode = listOf(), dateTimes = listOf()) })

    harness.startCase("query-objects-values")
    harness.call({ query.queryObjects(explode = anObject(), noExplode = aPlainObject(), deep = anotherObject()) })

    harness.startCase("joined-values-encoded-once")
    harness.call({ query.queryArrays(formExplode = listOf("a b"), formNoExplode = listOf("a b")) })
    harness.call({ query.queryObjects(noExplode = QueryObject(name = "a b", aWhen = WHEN)) })

    harness.startCase("query-headers-values")
    harness.call({ query.queryHeaders(xText = "hello", xNumbers = listOf(1, 2)) })

    harness.startCase("query-cookies-values")
    harness.call({ query.queryCookies(sessionId = "abc", theme = "dark") })

    harness.startCase("query-required-values")
    harness.call({ query.queryRequired(needed = "needed value", xNeeded = "needed header") })

    harness.startCase("query-reserved-value")
    harness.call({ query.queryScalars(str = QUERY_VALUE) })

    harness.startCase("query-path-segment")
    harness.call({ query.queryPathSegment(value = PATH_SEGMENT) })

    harness.startCase("path-root")
    harness.call({ root.root() })

    harness.startCase("form-scalars-values")
    harness.call({ form.formScalars(FormScalarsRequest(str = "a", num = 1, flag = false, aWhen = WHEN)) })

    harness.startCase("form-scalars-null")
    harness.call({ form.formScalars(FormScalarsRequest(nullableStr = Nullable.Null, nullableNum = Nullable.Null, nullableFlag = Nullable.Null, nullableWhen = Nullable.Null)) })

    harness.startCase("form-scalars-absent")
    harness.call({ form.formScalars(FormScalarsRequest()) })

    harness.startCase("form-arrays-values")
    harness.call({ form.formArrays(FormArraysRequest(strs = listOf("a", "b"), pipeStrs = listOf("c", "d"))) })

    harness.startCase("form-arrays-null")
    harness.call({ form.formArrays(FormArraysRequest(nullableStrs = Nullable.Null, nullablePipeStrs = Nullable.Null)) })

    harness.startCase("form-objects-values")
    harness.call({ form.formObjects(FormObjectsRequest(obj = aPlainObject(), explodeObj = anObject(), deepObj = anotherObject())) })

    harness.startCase("form-objects-null")
    harness.call({ form.formObjects(FormObjectsRequest(nullableObj = Nullable.Null, nullableExplodeObj = Nullable.Null, nullableDeepObj = Nullable.Null)) })

    harness.startCase("form-arrays-delimited-explode")
    harness.call({ form.formDelimitedExplode(FormDelimitedExplodeRequest(pipeStrs = listOf("a", "b"), spaceStrs = listOf("c", "d"))) })

    harness.startCase("form-optional-absent")
    harness.call({ form.formOptional(null) })

    harness.startCase("multipart-values")
    harness.call({
        multipart.multipartParts(MultipartPartsRequest.MultipartFormData(
            text = "a",
            json = anObject(),
            file = MultipartPartsRequest.MultipartFormData.FilePart(value = "file content".toByteArray()),
        ))
    })

    harness.startCase("multipart-json-content-type")
    harness.call({ multipart.multipartParts(MultipartPartsRequest.MultipartFormData(json = anObject())) })

    harness.startCase("multipart-null")
    harness.call({ multipart.multipartParts(MultipartPartsRequest.MultipartFormData(nullableText = Nullable.Null, nullableJson = Nullable.Null, nullableFile = Nullable.Null)) })

    harness.startCase("json-null-properties")
    harness.call({
        json.jsonBody(JsonBody(
            name = "n",
            nullableName = Nullable.Null,
            nullableCount = Nullable.Null,
            nullableWhen = Nullable.Null,
            nullableChild = Nullable.Null,
            nullableList = Nullable.Null,
        ))
    })

    harness.startCase("json-absent-properties")
    harness.call({ json.jsonBody(JsonBody(name = "n")) })

    harness.startCase("body-array")
    harness.call({ body.bodyArray(listOf(anObject(), anotherObject())) })

    harness.startCase("body-text")
    harness.call({ body.bodyText(TEXT_BODY) })

    harness.startCase("body-binary")
    harness.call({ body.bodyBinary(BINARY_BODY.toByteArray()) })

    harness.startCase("body-shared-model")
    harness.call({ body.bodySharedJson(SharedBody(name = "j", tags = listOf("a", "b"))) })
    harness.call({ body.bodySharedForm(SharedBody(name = "f", tags = listOf("c", "d"))) })

    harness.startCase("response-json")
    harness.call({ response.responseJson() }) { result ->
        when (result) {
            is ResponseApi.ResponseJsonResponseStatus.`200` -> json(result.value)
        }
    }

    harness.startCase("response-content-type-charset")
    harness.call({ response.responseJson() }) { result ->
        when (result) {
            is ResponseApi.ResponseJsonResponseStatus.`200` -> json(result.value)
        }
    }

    harness.startCase("response-unknown-property")
    harness.call({ response.responseJson() }) { result ->
        when (result) {
            is ResponseApi.ResponseJsonResponseStatus.`200` -> json(result.value)
        }
    }

    harness.startCase("response-array")
    harness.call({ response.responseArray() }) { result ->
        when (result) {
            is ResponseApi.ResponseArrayResponseStatus.`200` -> json(result.value)
        }
    }

    harness.startCase("response-null-properties")
    harness.call({ response.responseNullable() }) { result ->
        when (result) {
            is ResponseApi.ResponseNullableResponseStatus.`200` -> statesOf(result.value)
        }
    }

    harness.startCase("response-headers")
    harness.call({ response.responseHeaders() }) { result ->
        when (result) {
            is ResponseApi.ResponseHeadersResponseStatus.`200` -> buildJsonObject {
                put("name", result.value.name)
                put("totalCount", headerState(result.xTotalCount))
                put("note", headerState(result.xNote))
            }
        }
    }

    harness.startCase("response-empty-body")
    harness.call({ response.responseJson() })

    harness.startCase("response-no-content-type")
    harness.call({ response.responseJson() })

    harness.startCase("response-none")
    harness.call({ response.responseNone() })

    harness.startCase("response-error")
    harness.call({ response.responseError() })

    /* The failure declares a header, so its result class carries the body and the header together */
    harness.startCase("response-error-body")
    harness.call({ response.responseError() }) { result ->
        when (result) {
            is ResponseApi.ResponseErrorResponseStatus.`200` -> json(result.value)
            is ResponseApi.ResponseErrorResponseStatus.`400` -> json(result.value)
        }
    }

    harness.startCase("response-error-headers")
    harness.callReading({ response.responseError() }) { result ->
        when (result) {
            is ResponseApi.ResponseErrorResponseStatus.`200` -> buildJsonObject { put("errorCode", "no failure") }
            is ResponseApi.ResponseErrorResponseStatus.`400` -> buildJsonObject { put("errorCode", headerState(result.xErrorCode)) }
        }
    }

    harness.startCase("response-header-list")
    harness.call({ response.responseHeaderTypes() }) { result ->
        when (result) {
            is ResponseApi.ResponseHeaderTypesResponseStatus.`200` -> buildJsonObject {
                put("name", result.value.name)
                put("ids", result.xIds?.let { ids -> JsonArray(ids.map { JsonPrimitive(it.toString()) }) } ?: JsonPrimitive("absent"))
                put("count", result.xCount.toString())
            }
        }
    }

    harness.startCase("response-header-required-absent")
    harness.call({ response.responseHeaderTypes() })

    harness.startCase("response-header-unparseable")
    harness.call({ response.responseHeaderTypes() })

    harness.startCase("response-undocumented-status")
    harness.call({ response.responseJson() })

    harness.startCase("security-api-key-header")
    harness.call({ security.securityApiKeyHeader() })

    harness.startCase("security-api-key-query")
    harness.call({ security.securityApiKeyQuery() })

    harness.startCase("security-bearer")
    harness.call({ security.securityBearer() })

    harness.startCase("security-basic")
    harness.call({ security.securityBasic() })

    harness.finish()
}
