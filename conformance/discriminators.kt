/*
 * The discriminator conformance driver for the kotlin-client generator.
 *
 * The suite copies this file into the generated project, so the project's own
 * compiler checks it against the generated types. A base schema that lost its
 * discriminator property then fails the build here, because the driver sets it.
 *
 * A member fixes its own discriminator value, so the driver never sets it.
 *
 * Run it as: gradle conformance --args="<baseUrl> <resultsPath>"
 */

package conformance

import com.example.kotlin.api.DiscriminatorApi
import com.example.kotlin.api.model.BooleanUnion
import com.example.kotlin.api.model.Cat
import com.example.kotlin.api.model.Circle
import com.example.kotlin.api.model.Feline
import com.example.kotlin.api.model.IndependentObject
import com.example.kotlin.api.model.LegacyFeline
import com.example.kotlin.api.model.Lion
import com.example.kotlin.api.model.Pet
import com.example.kotlin.api.model.Shape
import com.example.kotlin.api.model.SubObject2
import com.example.kotlin.api.support.Configuration
import kotlinx.coroutines.runBlocking

fun main(arguments: Array<String>) = runBlocking {
    val harness = ConformanceHarness(arguments)
    val discriminator = DiscriminatorApi(Configuration(basePath = harness.baseUrl))

    /* SubObject2 takes thisProperty from IndependentObject, and narrows it to false */
    harness.startCase("discriminator-boolean-request")
    harness.call({ discriminator.discriminatorBooleanSend(BooleanUnion.SubObject2(SubObject2(otherProperty2 = "y"))) }) { result ->
        when (result) {
            is DiscriminatorApi.DiscriminatorBooleanSendResponseStatus.`200` -> json(result.value)
        }
    }

    harness.startCase("discriminator-boolean-response")
    harness.call({ discriminator.discriminatorBooleanReceive() }) { result ->
        when (result) {
            is DiscriminatorApi.DiscriminatorBooleanReceiveResponseStatus.`200` -> json(result.value)
        }
    }

    /* The base schema on its own. It declares thisProperty, so a caller can set it and read it. */
    harness.startCase("discriminator-base-standalone")
    harness.call({ discriminator.discriminatorBase(IndependentObject(thisProperty = true, otherProperty2 = "z")) }) { result ->
        when (result) {
            is DiscriminatorApi.DiscriminatorBaseResponseStatus.`200` -> json(result.value)
        }
    }

    harness.startCase("discriminator-string-request")
    harness.call({ discriminator.discriminatorPet(Pet.Cat(Cat(name = "mog"))) }) { result ->
        when (result) {
            is DiscriminatorApi.DiscriminatorPetResponseStatus.`200` -> json(result.value)
        }
    }

    harness.startCase("discriminator-enum-request")
    harness.call({ discriminator.discriminatorShape(Shape.Circle(Circle(label = "round", radius = 1.5))) }) { result ->
        when (result) {
            is DiscriminatorApi.DiscriminatorShapeResponseStatus.`200` -> json(result.value)
        }
    }

    /* A caller can't set petType at all, so the member must write it */
    harness.startCase("discriminator-default-value")
    harness.call({ discriminator.discriminatorPet(Pet.Cat(Cat(name = "mog"))) }) { result ->
        when (result) {
            is DiscriminatorApi.DiscriminatorPetResponseStatus.`200` -> json(result.value)
        }
    }

    /* Lion is a member of two discriminators that disagree on its value, so it keeps a property that the caller sets */
    harness.startCase("discriminator-conflicting-values")
    harness.call({ discriminator.discriminatorFeline(Feline.Lion(Lion(species = "lion", name = "leo"))) }) { result ->
        when (result) {
            is DiscriminatorApi.DiscriminatorFelineResponseStatus.`200` -> json(result.value)
        }
    }

    harness.startCase("discriminator-conflicting-values-other")
    harness.call({ discriminator.discriminatorLegacyFeline(LegacyFeline.Lion(Lion(species = "LION", name = "leo"))) }) { result ->
        when (result) {
            is DiscriminatorApi.DiscriminatorLegacyFelineResponseStatus.`200` -> json(result.value)
        }
    }

    harness.finish()
}
