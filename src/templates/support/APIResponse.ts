import { ts } from '@openapi-generator-plus/template-utils'
import { KotlinModelContext } from '../types'
import { generatedBy } from '../frag/generatedBy'

/** The functions that the API classes use to read a response before they make it into an operation's result. */
export function apiResponse(ctx: KotlinModelContext): string {
	const root = ctx.root
	return ts`
/*
 * ${generatedBy(root)}
 */

package ${root.supportPackage}

import io.ktor.client.call.body
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsBytes
import io.ktor.client.statement.bodyAsText

/**
 * Check that the response declares a media type that matches [mediaType], before its body is read.
 *
 * A server that doesn't say what the body holds, or says that it holds something else, broke the
 * contract of the operation, so the client doesn't guess. [mediaType] may have a wildcard type or
 * subtype. Parameters, such as a charset, are ignored.
 *
 * @throws APIException.InvalidResponse with an [UnexpectedContentTypeException] when the media type doesn't match.
 */
fun HttpResponse.checkContentType(mediaType: String) {
    val actual = headers[io.ktor.http.HttpHeaders.ContentType]
    if (actual != null && mimeTypeMatches(actual, mediaType)) {
        return
    }
    if (actual == null && mediaType.substringBefore(';').trim() == "*/*") {
        /* A response of any media type may leave it out */
        return
    }
    throw APIException.InvalidResponse(this, UnexpectedContentTypeException(expected = mediaType, actual = actual))
}

/** Whether the MIME type of the [actual] media type matches the MIME type of [expected], which may be a wildcard. */
private fun mimeTypeMatches(actual: String, expected: String): Boolean {
    fun mimeType(mediaType: String): List<String> =
        mediaType.substringBefore(';').trim().lowercase().split('/', limit = 2)

    val actualParts = mimeType(actual)
    val expectedParts = mimeType(expected)
    if (actualParts.size != 2 || expectedParts.size != 2) {
        return false
    }
    return (expectedParts[0] == "*" || expectedParts[0] == actualParts[0]) && (expectedParts[1] == "*" || expectedParts[1] == actualParts[1])
}

/**
 * The body of the response decoded from JSON by [deserializer].
 *
 * @throws APIException.InvalidResponse when the body isn't valid JSON for [deserializer], including when it's empty.
 */
suspend fun <T> HttpResponse.decodeJsonBody(json: kotlinx.serialization.json.Json, deserializer: kotlinx.serialization.DeserializationStrategy<T>): T {
    val text = bodyAsText()
    return try {
        json.decodeFromString(deserializer, text)
    } catch (e: IllegalArgumentException) {
        /* kotlinx.serialization.SerializationException is an IllegalArgumentException */
        throw APIException.InvalidResponse(this, e)
    }
}

/** The body of the response as text. */
suspend fun HttpResponse.decodeTextBody(): String = bodyAsText()

/**
 * The body of the response, which is text, read by [deserializer] as a JSON string. It reads a type that the
 * API sends as text, such as a date or an enum.
 *
 * @throws APIException.InvalidResponse when [deserializer] can't read the text.
 */
suspend fun <T> HttpResponse.decodeTextBody(json: kotlinx.serialization.json.Json, deserializer: kotlinx.serialization.DeserializationStrategy<T>): T {
    val text = bodyAsText()
    return try {
        json.decodeFromJsonElement(deserializer, kotlinx.serialization.json.JsonPrimitive(text))
    } catch (e: IllegalArgumentException) {
        /* kotlinx.serialization.SerializationException is an IllegalArgumentException */
        throw APIException.InvalidResponse(this, e)
    }
}

/** The body of the response as bytes. */
suspend fun HttpResponse.decodeBinaryBody(): ByteArray = bodyAsBytes()

/** The body of the response as [T], a binary representation other than \`ByteArray\`, such as \`java.io.InputStream\`. */
suspend inline fun <reified T> HttpResponse.decodeBinaryBodyAs(): T = body()

/**
 * The value of the header [name], read by [parse], or \`null\` when the response doesn't carry it.
 *
 * @throws APIException.InvalidResponse with a [ResponseHeaderException] when [parse] can't read the value.
 */
fun <T : Any> HttpResponse.responseHeader(name: String, parse: (String) -> T?): T? {
    val text = headers.getAll(name)?.joinToString(", ") ?: return null
    return headerValue(name, text.trim(), parse)
}

/**
 * The value of the header [name], read by [parse].
 *
 * @throws APIException.InvalidResponse with a [ResponseHeaderException] when the response doesn't carry the
 *   header, or when [parse] can't read the value.
 */
fun <T : Any> HttpResponse.requiredResponseHeader(name: String, parse: (String) -> T?): T =
    responseHeader(name, parse) ?: throw APIException.InvalidResponse(this, ResponseHeaderException.Missing(name))

/**
 * The elements of the list header [name], each read by [parse], or \`null\` when the response doesn't carry it.
 *
 * The elements are separated by commas, which may have whitespace around them. A response that carries
 * the header on more than one line gives the elements of every line.
 *
 * @throws APIException.InvalidResponse with a [ResponseHeaderException] when [parse] can't read an element.
 */
fun <T : Any> HttpResponse.responseHeaderList(name: String, parse: (String) -> T?): List<T>? {
    val text = headers.getAll(name)?.joinToString(",")?.trim() ?: return null
    if (text.isEmpty()) {
        return emptyList()
    }
    return text.split(',').map { headerValue(name, it.trim(), parse) }
}

/**
 * The elements of the list header [name], each read by [parse].
 *
 * @throws APIException.InvalidResponse with a [ResponseHeaderException] when the response doesn't carry the
 *   header, or when [parse] can't read an element.
 */
fun <T : Any> HttpResponse.requiredResponseHeaderList(name: String, parse: (String) -> T?): List<T> =
    responseHeaderList(name, parse) ?: throw APIException.InvalidResponse(this, ResponseHeaderException.Missing(name))

private fun <T : Any> HttpResponse.headerValue(name: String, text: String, parse: (String) -> T?): T {
    val value = try {
        parse(text)
    } catch (e: Exception) {
        /* A parser reports text that it can't read with an exception of its own type, such as java.net.MalformedURLException */
        null
    }
    return value ?: throw APIException.InvalidResponse(this, ResponseHeaderException.Unreadable(name, text))
}
`
}
