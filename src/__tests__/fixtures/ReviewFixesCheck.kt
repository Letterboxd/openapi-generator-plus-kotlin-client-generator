/*
 * Calls the operations of fixtures/review-fixes.yml against a local recording
 * server, and checks what the client put on the wire, and what it made of the
 * responses.
 *
 * Run by review-fixes.spec.ts. It exits with an error when a check fails.
 */

package check

import com.example.kotlin.api.ItemsApi.GetHeadersResponseStatus
import com.example.kotlin.api.ItemsApi.GetRangeResponseStatus
import com.example.kotlin.api.ItemsApi.PostMixedResponseStatus
import com.example.kotlin.api.ItemsApi.GetNullablesResponseStatus
import com.example.kotlin.api.ItemsApi.MapQueryResponseStatus
import com.example.kotlin.api.PetsApi.GetOddResponseStatus
import com.example.kotlin.api.ItemsApi
import com.example.kotlin.api.PetsApi
import com.example.kotlin.api.PetsApi.GetShapeResponseStatus
import com.example.kotlin.api.PetsApi.PostPetResponseStatus
import com.example.kotlin.api.model.Cat
import com.example.kotlin.api.model.Dog
import com.example.kotlin.api.model.Bike
import com.example.kotlin.api.model.Car
import com.example.kotlin.api.model.Filter
import com.example.kotlin.api.model.Free
import com.example.kotlin.api.model.Ident
import com.example.kotlin.api.model.IdValue
import com.example.kotlin.api.model.AnyHolder
import com.example.kotlin.api.model.Tone
import com.example.kotlin.api.model.WeirdOrFilter
import com.example.kotlin.api.model.WeirdOrTone
import com.example.kotlin.api.model.LevelOrCount
import com.example.kotlin.api.model.Circle
import com.example.kotlin.api.model.Ratio
import com.example.kotlin.api.model.Gadget
import com.example.kotlin.api.model.Phone
import com.example.kotlin.api.model.Level
import com.example.kotlin.api.model.LevelHolder
import com.example.kotlin.api.model.When
import com.example.kotlin.api.model.Mixed
import com.example.kotlin.api.model.NullableHolder
import com.example.kotlin.api.model.Ids
import com.example.kotlin.api.model.PostMixedRequest
import com.example.kotlin.api.model.Odd
import com.example.kotlin.api.model.OtherVehicle
import com.example.kotlin.api.model.Tagged
import com.example.kotlin.api.model.UploadPrefs
import com.example.kotlin.api.model.UploadRequest
import com.example.kotlin.api.model.Vehicle
import com.example.kotlin.api.model.Weird
import com.example.kotlin.api.model.Loose
import com.example.kotlin.api.model.Pet
import com.example.kotlin.api.model.PostFormRequest
import com.example.kotlin.api.model.PostScalarsHolder
import com.example.kotlin.api.model.PostScalarsId
import com.example.kotlin.api.model.Shape
import com.example.kotlin.api.model.Strict
import com.example.kotlin.api.support.APIException
import com.example.kotlin.api.support.Configuration
import com.example.kotlin.api.support.Instant
import com.example.kotlin.api.support.ResponseHeaderException
import com.sun.net.httpserver.HttpServer
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import java.net.InetSocketAddress
import java.net.URLDecoder

/** A request that the server received. */
class Recorded(val rawPath: String, val rawQuery: String?, val cookie: String?, val accept: List<String>, val contentType: String?, val body: String)

/** A response for the server to send. */
class Canned(val status: Int, val headers: Map<String, String> = emptyMap(), val body: String = "")

/**
 * The value that a member of a oneOf wraps. Core names the members of scalars uniquely across the specification,
 * so a check reads the value rather than naming the member.
 */
fun memberValue(member: Any): Any? = member.javaClass.getMethod("getValue").invoke(member)

fun check(condition: Boolean, message: String) {
    if (!condition) {
        throw IllegalStateException(message)
    }
}

fun main() = runBlocking {
    /* A case of an enum that's used before the enum is initialized is still in its entries */
    val firstTone = Tone._10
    val recorded = mutableListOf<Recorded>()
    var canned = Canned(204)

    val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
    server.createContext("/") { exchange ->
        recorded.add(Recorded(exchange.requestURI.rawPath, exchange.requestURI.rawQuery, exchange.requestHeaders.getFirst("Cookie"), exchange.requestHeaders["Accept"].orEmpty(), exchange.requestHeaders.getFirst("Content-Type"), exchange.requestBody.readBytes().decodeToString()))
        val response = canned
        response.headers.forEach { (name, value) -> exchange.responseHeaders.add(name, value) }
        val bytes = response.body.encodeToByteArray()
        exchange.sendResponseHeaders(response.status, if (bytes.isEmpty()) -1 else bytes.size.toLong())
        if (bytes.isNotEmpty()) {
            exchange.responseBody.use { it.write(bytes) }
        }
        exchange.close()
    }
    server.start()

    try {
        val configuration = Configuration(basePath = "http://127.0.0.1:${server.address.port}/")
        val items = ItemsApi(configuration)
        val pets = PetsApi(configuration)

        /* Path parameters follow their style, and encode each value but not the delimiters */
        canned = Canned(204)
        items.getItems(
            ids = listOf(1, 2),
            filter = Filter(kind = "a b", size = 3),
            label = listOf("x", "y"),
            matrix = listOf("p", "q"),
            name = "n/m@",
            tags = listOf("t 1", "t2"),
        ).getOrThrow()
        val itemsRequest = recorded.last()
        check(itemsRequest.rawPath == "/items/1,2/kind=a%20b,size=3/.x,y/;matrix=p;matrix=q/n%2Fm%40", "path parameters: ${itemsRequest.rawPath}")
        /* A cookie encodes each value, but keeps the comma between them */
        check(itemsRequest.cookie == "tags=t%201,t2", "cookie: ${itemsRequest.cookie}")

        /* An empty matrix array names the parameter without a value */
        items.getItems(ids = listOf(1), filter = Filter(kind = "k"), label = listOf("x"), matrix = emptyList(), name = "n").getOrThrow()
        check(recorded.last().rawPath == "/items/1/kind=k/.x/;matrix/n", "empty matrix: ${recorded.last().rawPath}")

        /* A free-form object in the query writes each of its members */
        canned = Canned(200, mapOf("Content-Type" to "application/json"), """{"kind":"k"}""")
        items.search(
            free = Free(mapOf("a" to JsonPrimitive("x y"), "n" to JsonPrimitive(1))),
            deep = Free(mapOf("k" to JsonPrimitive("v"))),
        ).getOrThrow()
        val query = URLDecoder.decode(recorded.last().rawQuery ?: "", "UTF-8").split("&").sorted()
        check(query == listOf("a=x y", "deep[k]=v", "n=1"), "free-form query: $query")

        /* A 401 is never one of an operation's responses, as in the Swift client, also when an operation without security declares it */
        canned = Canned(401, mapOf("Content-Type" to "application/json"), """{"kind":"denied"}""")
        val denied = items.search().exceptionOrNull()
        check(denied is APIException.UnexpectedResponse && denied.response.status.value == 401, "401: $denied")

        /* A date header that doesn't parse is an invalid response */
        canned = Canned(204, mapOf("X-Expires" to "not-a-date"))
        val badDate = items.getExpires().exceptionOrNull()
        check(badDate is APIException.InvalidResponse && badDate.cause is ResponseHeaderException.Unreadable, "bad date: $badDate")
        canned = Canned(204, mapOf("X-Expires" to "2020-01-02T03:04:05Z"))
        items.getExpires().getOrThrow()

        /* A file part has a filename, a part of a JSON media type is JSON, a value of any type is its text, and a cookie encodes the names of an object's properties */
        canned = Canned(204)
        items.upload(
            q = JsonPrimitive("abc"),
            prefs = UploadPrefs(aB = "1"),
            requestBody = UploadRequest.MultipartFormData(
                file = UploadRequest.MultipartFormData.FilePart(value = "bytes".encodeToByteArray(), xPartId = "p1"),
                meta = Filter(kind = "m"),
                image = "png".encodeToByteArray(),
            ),
        ).getOrThrow()
        val upload = recorded.last()
        check(upload.rawQuery == "q=abc", "any query: ${upload.rawQuery}")
        check(upload.cookie == "a%20b=1", "object cookie: ${upload.cookie}")
        check(upload.body.contains("filename=\"file\""), "file part: ${upload.body}")
        check(upload.body.contains("""{"kind":"m"}"""), "json part: ${upload.body}")
        check(upload.body.contains("X-Part-Id: p1"), "part header: ${upload.body}")
        check(upload.body.contains("Content-Type: image/png\r\n"), "list content type: ${upload.body}")

        /* A map in the query writes each entry, a free-form form body sends its members, and a text body reads as its type */
        canned = Canned(200, mapOf("Content-Type" to "text/plain"), "2020-01-02T03:04:05Z")
        val mapped = items.mapQuery(m = mapOf("a" to "b c"), requestBody = Free(mapOf("k" to JsonPrimitive("v")))).getOrThrow()
        check(URLDecoder.decode(recorded.last().rawQuery ?: "", "UTF-8") == "a=b c", "map query: ${recorded.last().rawQuery}")
        check(recorded.last().body == "k=v", "free-form form body: ${recorded.last().body}")
        /* The client accepts only the media types that the operation declares */
        check(recorded.last().accept.flatMap { it.split(",") }.map { it.trim() } == listOf("text/plain"), "accept: ${recorded.last().accept}")
        check(mapped == MapQueryResponseStatus.`200`(Instant("2020-01-02T03:04:05Z")), "text date: $mapped")

        /* A oneOf value is its text, a nested UUID uses its serializer, a text body of a number is its text, and a null member is empty */
        canned = Canned(204)
        val uuid = java.util.UUID.fromString("123e4567-e89b-12d3-a456-426614174000")
        items.postScalars(
            id = configuration.json.decodeFromString(PostScalarsId.serializer(), "\"abc\""),
            holder = PostScalarsHolder(ids = listOf(uuid)),
            requestBody = 42,
        ).getOrThrow()
        val scalarsQuery = URLDecoder.decode(recorded.last().rawQuery ?: "", "UTF-8").split("&").sorted()
        check(scalarsQuery == listOf("holder[ids]=[\"$uuid\"]", "id=abc"), "scalars query: $scalarsQuery")
        check(recorded.last().body == "42", "text body: ${recorded.last().body}")
        canned = Canned(200, mapOf("Content-Type" to "application/json"), """{"kind":"k"}""")
        items.search(free = Free(mapOf("a" to kotlinx.serialization.json.JsonNull))).getOrThrow()
        check(recorded.last().rawQuery == "a=", "null member: ${recorded.last().rawQuery}")

        /* A null element of an array or a map is an empty value, and a oneOf member that is a UUID reads */
        canned = Canned(200, mapOf("Content-Type" to "application/json"), "\"$uuid\"")
        val ident = (items.getNullables(
            ids = listOf(com.example.kotlin.api.support.Nullable.Some("a"), com.example.kotlin.api.support.Nullable.Null),
            m = mapOf("k" to com.example.kotlin.api.support.Nullable.Null),
        ).getOrThrow() as GetNullablesResponseStatus.`200`).value
        check(recorded.last().rawQuery == "ids=a&ids=&k=", "nullables: ${recorded.last().rawQuery}")
        check(ident is Ident.JavaUtilUUID && ident.value == uuid, "uuid member: $ident")

        /* A multipart/mixed body declares its type, a unique-items header is a Set, and a response of any media type may leave out its type */
        canned = Canned(200, mapOf("X-Tags" to "a, b, a"), "[\"$uuid\"]")
        val mixed = items.postMixed(PostMixedRequest(note = "n")).getOrThrow() as PostMixedResponseStatus.`200`
        check(recorded.last().contentType?.startsWith("multipart/mixed; boundary=") == true, "mixed: ${recorded.last().contentType}")
        check(mixed.xTags == setOf("a", "b"), "set header: ${mixed.xTags}")
        check(mixed.value == Ids.KotlinCollectionsListJavaUtilUUIDArray(listOf(uuid)), "uuid list member: ${mixed.value}")

        /* A body of a media type that the client can't encode is sent as JSON */
        canned = Canned(204)
        items.postXml(Filter(kind = "x")).getOrThrow()
        check(recorded.last().contentType == "application/xml" && recorded.last().body == """{"kind":"x"}""", "xml: ${recorded.last().contentType} ${recorded.last().body}")

        /* A serializer that jsonBuilder registers for a support type wins */
        Configuration(jsonBuilder = { serializersModule = kotlinx.serialization.modules.SerializersModule { contextual(java.util.UUID::class, com.example.kotlin.api.support.KUUIDSerializer) } })

        /* A range response reads every code in it but the codes that the operation declares themselves */
        canned = Canned(400, mapOf("Content-Type" to "application/json"), """{"kind":"bad"}""")
        check(items.getRange().getOrThrow() == GetRangeResponseStatus.`4XX`(Filter(kind = "bad"), status = 400), "4XX")
        canned = Canned(404)
        check(items.getRange().getOrThrow() == GetRangeResponseStatus.`404`, "404")

        /* A string that holds a number reads as the string member, not the number member */
        canned = Canned(200, mapOf("Content-Type" to "application/json"), "\"5\"")
        check(memberValue((items.getRange().getOrThrow() as GetRangeResponseStatus.`200`).value) == "5", "string id")
        canned = Canned(200, mapOf("Content-Type" to "application/json"), "5")
        check(memberValue((items.getRange().getOrThrow() as GetRangeResponseStatus.`200`).value) == 5, "number id")

        /* A model that holds JSON values survives Java serialization */
        val holder = AnyHolder(extra = JsonPrimitive("e"), free = Free(mapOf("k" to JsonPrimitive(1))))
        val bytes = java.io.ByteArrayOutputStream().also { java.io.ObjectOutputStream(it).use { out -> out.writeObject(holder) } }.toByteArray()
        val restored = java.io.ObjectInputStream(java.io.ByteArrayInputStream(bytes)).use { it.readObject() }
        check(restored == holder, "java serialization: $restored")
        val nullableHolder = NullableHolder(n = com.example.kotlin.api.support.Nullable.Null, m = Mixed.KotlinxSerializationJsonJsonElement(JsonPrimitive("x")))
        val nullableBytes = java.io.ByteArrayOutputStream().also { java.io.ObjectOutputStream(it).use { out -> out.writeObject(nullableHolder) } }.toByteArray()
        val nullableRestored = java.io.ObjectInputStream(java.io.ByteArrayInputStream(nullableBytes)).use { it.readObject() }
        check(nullableRestored == nullableHolder, "java serialization of Nullable and a oneOf of JSON: $nullableRestored")

        /* A date member reads only a date, and an integer enum is a JSON number */
        val json = configuration.json
        check(json.decodeFromString(When.serializer(), "\"2024-05-01\"") is When.ComExampleKotlinApiSupportLocalDate, "date member")
        check(json.decodeFromString(When.serializer(), "\"2024-05-01T10:00:00Z\"") is When.ComExampleKotlinApiSupportInstant, "date-time member")
        check(memberValue(json.decodeFromString(When.serializer(), "\"hello\"")) == "hello", "string member")
        check(json.decodeFromString(LevelHolder.serializer(), """{"level":2}""") == LevelHolder(level = Level.valueOf("2")), "integer enum")
        check(json.encodeToString(LevelHolder.serializer(), LevelHolder(level = Level.valueOf("3"))) == """{"level":3}""", "integer enum encode")
        check(json.decodeFromString(LevelHolder.serializer(), """{"level":2.0}""") == LevelHolder(level = Level.valueOf("2")), "integer enum written as 2.0")
        check(runCatching { json.decodeFromString(LevelHolder.serializer(), """{"level":null}""") }.isFailure, "integer enum null")
        check(json.encodeToString(Gadget.serializer(), Gadget.Phone(Phone(kind = Level.valueOf("3")))) == """{"kind":1}""", "numeric enum discriminator")
        check(json.decodeFromString(Gadget.serializer(), """{"kind":1.0}""") is Gadget.Phone, "numeric discriminator written as 1.0")
        check(Level.valueOf("2.0") == Level.valueOf("2"), "numeric enum valueOf")
        check(Circle().sign.value == "1", "enum literal of a member whose name core made unique: ${Circle().sign}")
        check(Ratio().ratio == 1.0, "whole number default of a double")
        check(memberValue(json.decodeFromString(LevelOrCount.serializer(), "2")) == Level.valueOf("2"), "known enum member")
        check(memberValue(json.decodeFromString(LevelOrCount.serializer(), "42")) == 42, "unknown enum value goes to the next member")
        check(json.decodeFromString(LevelOrCount.serializer(), "\"2\"") == LevelOrCount.Unknown, "a numeric enum member reads only numbers")
        check(memberValue(json.decodeFromString(WeirdOrFilter.serializer(), "\"new\"")) == Weird.valueOf("new"), "unknown enum value kept by the enum member")
        check(memberValue(json.decodeFromString(WeirdOrTone.serializer(), "503")) == Tone.valueOf("503"), "unknown number kept by the numeric enum member")
        check(memberValue(json.decodeFromString(WeirdOrTone.serializer(), "\"pending\"")) == Weird.valueOf("pending"), "unknown text kept by the text enum member")
        check(Tone.valueOf("10.0") == firstTone && Tone.entries.first() == firstTone, "enum entries after an early case")
        check(json.decodeFromString(Vehicle.serializer(), """{"kind":1.0,"seats":2}""") == Vehicle.Car(Car(kind = 1, seats = 2)), "integer discriminator written as 1.0")

        /* A form property's encoding is found by its name in the specification */
        canned = Canned(204)
        items.postForm(PostFormRequest(tagIds = listOf("a", "b"))).getOrThrow()
        val formBody = URLDecoder.decode(recorded.last().body, "UTF-8")
        check(formBody == "tag_ids=a,b", "form body: $formBody")

        /* Header members that share a name with the body, or with each other, get names of their own */
        canned = Canned(200, mapOf("Content-Type" to "application/json", "Value" to "v", "Location" to "https://example.com/x"), """{"kind":"k"}""")
        val headers = items.getHeaders().getOrThrow() as GetHeadersResponseStatus.`200`
        check(headers.value == Filter(kind = "k"), "body: ${headers.value}")
        check(headers.valueHeader == "v" && headers.valueHeader2 == "v", "headers: $headers")
        check(headers.location?.toString() == "https://example.com/x", "location: ${headers.location}")

        /* A URL header that doesn't parse is an invalid response */
        canned = Canned(200, mapOf("Content-Type" to "application/json", "Location" to "not a url"), """{"kind":"k"}""")
        val badHeader = items.getHeaders().exceptionOrNull()
        check(badHeader is APIException.InvalidResponse && badHeader.cause is ResponseHeaderException.Unreadable, "bad header: $badHeader")

        /* Core gives a member that two values map to one of them, and the member writes that value with its own enum */
        canned = Canned(200, mapOf("Content-Type" to "application/json"), """{"petType":"kitty","name":"Tom"}""")
        val cat = pets.postPet(Pet.Cat(Cat(name = "Tom"))).getOrThrow() as PostPetResponseStatus.`200`
        check(Json.parseToJsonElement(recorded.last().body).jsonObject["petType"] == JsonPrimitive("kitty"), "cat body: ${recorded.last().body}")
        check(cat.value is Pet.Cat && (cat.value as Pet.Cat).value.name == "Tom", "cat: ${cat.value}")

        canned = Canned(200, mapOf("Content-Type" to "application/json"), """{"petType":"dog","bark":"woof"}""")
        val dog = pets.postPet(Pet.Dog(Dog(bark = "woof"))).getOrThrow() as PostPetResponseStatus.`200`
        check(Json.parseToJsonElement(recorded.last().body).jsonObject["petType"] == JsonPrimitive("dog"), "dog body: ${recorded.last().body}")
        check(dog.value == Pet.Dog(Dog(bark = "woof")), "dog: ${dog.value}")

        /* Names and values that need escaping in Kotlin keep their text */
        canned = Canned(204)
        pets.postTagged(Tagged(type = "t", weird = Weird.valueOf("a\$b"))).getOrThrow()
        val tagged = Json.parseToJsonElement(recorded.last().body).jsonObject
        check(tagged["\$type"] == JsonPrimitive("t") && tagged["weird"] == JsonPrimitive("a\$b"), "tagged: $tagged")
        check(Weird.valueOf("q\"x").value == "q\"x", "weird enum value")

        /* An integer discriminator that the oneOf writes is a number */
        pets.postVehicle(Vehicle.Car(Car(kind = 0, seats = 2))).getOrThrow()
        check(Json.parseToJsonElement(recorded.last().body).jsonObject["kind"] == JsonPrimitive(1L), "vehicle: ${recorded.last().body}")
        pets.postOtherVehicle(OtherVehicle.Car(Car(kind = 0))).getOrThrow()
        check(Json.parseToJsonElement(recorded.last().body).jsonObject["kind"] == JsonPrimitive(3L), "other vehicle: ${recorded.last().body}")
        pets.postVehicle(Vehicle.Bike(Bike())).getOrThrow()
        check(Json.parseToJsonElement(recorded.last().body).jsonObject["kind"] == JsonPrimitive(2L), "bike: ${recorded.last().body}")

        /* A oneOf without a discriminator prefers the member that declares every key */
        suspend fun shape(body: String): Shape {
            canned = Canned(200, mapOf("Content-Type" to "application/json"), body)
            return (pets.getShape().getOrThrow() as GetShapeResponseStatus.`200`).value
        }
        check(shape("""{"b":1}""") == Shape.Strict(Strict(b = 1)), "strict shape")
        check(shape("""{"a":"x"}""") == Shape.Loose(Loose(a = "x")), "loose shape")
        check(shape("""{"a":"x","c":1}""") == Shape.Loose(Loose(a = "x")), "loose shape with an unknown key")
        check(shape("""[]""") == Shape.Unknown, "unknown shape")

        /* Members named Unknown and Serializer don't collide with the oneOf's own declarations */
        canned = Canned(200, mapOf("Content-Type" to "application/json"), """{"u":"x"}""")
        val odd = (pets.getOdd().getOrThrow() as GetOddResponseStatus.`200`).value
        check(odd == Odd.AUnknown(com.example.kotlin.api.model.AUnknown(u = "x")), "odd: $odd")
        canned = Canned(200, mapOf("Content-Type" to "application/json"), """{"s":1}""")
        val oddSerializer = (pets.getOdd().getOrThrow() as GetOddResponseStatus.`200`).value
        check(oddSerializer == Odd.ASerializer(com.example.kotlin.api.model.ASerializer(s = 1)), "odd serializer: $oddSerializer")
    } finally {
        server.stop(0)
    }
}
