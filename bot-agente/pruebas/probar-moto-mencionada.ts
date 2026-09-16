/**
 * Pruebas de la moto mencionada: la moto que el cliente nombró en un turno
 * anterior sigue pesando en los turnos siguientes, aunque nunca se haya
 * confirmado por compatibilidad.
 *
 * Pega contra la base (estado persistente y catálogo reales), no contra la API
 * del modelo:
 *
 *   npx tsx bot-agente/pruebas/probar-moto-mencionada.ts
 *
 * Contexto (conv 4206, 15/09): "Una 110 DLX" en un turno, otra pregunta en el
 * siguiente. El aviso del catálogo y el BACKSTOP DE LA MOTO del motor miraban
 * SOLO el mensaje del turno, así que ninguno vio moto y el bot contestó "Para
 * la 110 DLX tenemos estas opciones" — con el kit dakar 200 y el 220 adentro.
 *
 * Lo que cuidan además del caso: que la moto ya CONFIRMADA no vuelva a
 * disparar el aviso (sería mandar a consultar algo que ya se consultó).
 */
import {
    cargarEstadoConversacion,
    guardarEstadoConversacion,
    limpiarEstadoConversacion,
    fotoEntrega
} from "../nucleo/estado-persistente"
import { consultarCatalogoPrecios } from "../herramientas/catalogo-precios"
import { ofreceProductosParaLaMoto, afirmaTenerParaSuMoto } from "../guardrails/sanitizador"
import { cilindradaSinMarca } from "../nucleo/motos"

const CLAVE = "prueba-moto-mencionada"

interface Caso {
    titulo: string
    ok: boolean
}

async function main() {
    const casos: Caso[] = []
    const agregar = (titulo: string, ok: boolean) => casos.push({ titulo, ok })

    // ── El estado persistente ────────────────────────────────────────────────
    await limpiarEstadoConversacion(CLAVE)
    await guardarEstadoConversacion(CLAVE, { motoMencionada: "110 DLX" })
    const guardado = await cargarEstadoConversacion(CLAVE)
    agregar("la moto mencionada se guarda y se relee", guardado.motoMencionada === "110 DLX")
    agregar("y no se confunde con la confirmada", !guardado.motoConfirmada)

    // Sobrevive a un patch de otro campo (el merge no la pisa).
    await guardarEstadoConversacion(CLAVE, { repreguntasMoto: 1 })
    const trasOtroPatch = await cargarEstadoConversacion(CLAVE)
    agregar("sobrevive a un patch de otro campo", trasOtroPatch.motoMencionada === "110 DLX")

    // NO entra en la memoria de entrega: el dato lo puso el cliente, así que un
    // turno descartado no puede borrarlo.
    const foto = fotoEntrega(trasOtroPatch) as unknown as Record<string, unknown>
    agregar("no entra en la foto de entrega revertible", !("motoMencionada" in foto))

    await limpiarEstadoConversacion(CLAVE)

    // ── El aviso del catálogo ────────────────────────────────────────────────
    // Sin moto en el mensaje pero con moto en la charla: tiene que avisar.
    const conMotoVieja = await consultarCatalogoPrecios({
        termino_busqueda: "kit 120",
        __embudo: { motoDelMensaje: null, motoMencionada: "110 DLX", motoConfirmada: null }
    })
    agregar(
        "la moto de un turno anterior dispara el aviso",
        /EL CLIENTE YA DIJO SU MOTO EN ESTA CHARLA: 110 DLX/.test(conMotoVieja.mensaje_para_agente)
    )
    agregar(
        "el aviso manda a consultar compatibilidad",
        /consultar_compatibilidad/.test(conMotoVieja.mensaje_para_agente)
    )

    // La misma moto dicha recién mantiene el texto de siempre.
    const conMotoDelMensaje = await consultarCatalogoPrecios({
        termino_busqueda: "kit 120",
        __embudo: { motoDelMensaje: "110 DLX", motoMencionada: "110 DLX", motoConfirmada: null }
    })
    agregar(
        "la moto de este mensaje conserva su aviso",
        /NOMBRÓ SU MOTO EN ESTE MENSAJE: 110 DLX/.test(conMotoDelMensaje.mensaje_para_agente)
    )

    // Ya confirmada: no se avisa nada (ya se consultó, repetirlo es ruido).
    const confirmada = await consultarCatalogoPrecios({
        termino_busqueda: "kit 120",
        __embudo: { motoDelMensaje: null, motoMencionada: "110 DLX", motoConfirmada: "110 DLX" }
    })
    agregar(
        "la moto ya confirmada no dispara el aviso",
        !/EL CLIENTE YA DIJO SU MOTO/.test(confirmada.mensaje_para_agente)
    )

    // Sin ninguna moto en juego, nada cambia.
    const sinMoto = await consultarCatalogoPrecios({ termino_busqueda: "kit 120" })
    agregar("sin moto no hay aviso", !/SU MOTO/.test(sinMoto.mensaje_para_agente))

    // ── El detector anclado al nombre de la moto ─────────────────────────────
    // La forma invertida que los detectores de siempre no ven (conv 4206).
    const OFERTA_4206 = [
        "Para la Wave 110 tenemos estas opciones de potenciación:",
        "",
        "👉🏼 Combo 110 a 120 + Codo y carburador",
        "👉🏼 kit dakar 220",
        "",
        "Cuál de estas estás buscando?"
    ].join("\n")
    agregar(
        "'Para la Wave 110 tenemos estas opciones' se detecta",
        ofreceProductosParaLaMoto(OFERTA_4206, "Honda Wave 110") === true
    )
    agregar(
        "y los detectores viejos seguían sin verlo",
        afirmaTenerParaSuMoto(OFERTA_4206) === false
    )
    // El ancla es lo que evita el falso positivo: misma forma, sujeto distinto.
    agregar(
        "'Para el kit 120 tenemos dos opciones' NO dispara",
        ofreceProductosParaLaMoto("Para el kit 120 tenemos dos opciones: corto y largo.", "Honda Wave 110") === false
    )
    agregar(
        "hablar de otra moto NO dispara",
        ofreceProductosParaLaMoto("Para la Rouser 200 tenemos varios kits.", "Honda Wave 110") === false
    )
    agregar(
        "sin moto en juego nunca dispara",
        ofreceProductosParaLaMoto(OFERTA_4206, null) === false
    )
    agregar(
        "nombrar la moto sin ofrecer nada NO dispara",
        ofreceProductosParaLaMoto("Dale, anotado que es una Wave 110.", "Honda Wave 110") === false
    )
    // La cilindrada sola no alcanza: "110" está en los nombres de los kits.
    agregar(
        "el número de la moto solo no la identifica",
        ofreceProductosParaLaMoto("Tenemos estas opciones: Combo 110 a 120 + Codo y carburador.", "110") === false
    )

    // ── Cilindrada sin marca ("Una 110 DLX") ─────────────────────────────────
    // Es una moto en juego aunque no resuelva a ningún modelo cargado.
    agregar("'Una 110 DLX' se reconoce como moto", cilindradaSinMarca("Una 110 DLX") === "110 DLX")
    agregar("'110 dlx' sin artículo también", cilindradaSinMarca("110 dlx") === "110 DLX")
    agregar("'tengo una 110' (dice que es suya)", cilindradaSinMarca("tengo una 110") === "110")
    agregar("'mi moto es una 125 full'", cilindradaSinMarca("mi moto es una 125 full") === "125 FULL")

    // Los falsos positivos que importan: el cliente hablando del KIT, no de su
    // moto. Si estos disparan, el guardrail de la moto se aplica a la moto
    // equivocada y el bot deja de contestar.
    agregar("'el kit 120' NO es una moto", cilindradaSinMarca("el kit 120") === null)
    agregar("'el 120' pelado NO es una moto", cilindradaSinMarca("el 120") === null)
    agregar("'120' solo NO es una moto", cilindradaSinMarca("120") === null)
    agregar("'cuanto sale el 200?' NO es una moto", cilindradaSinMarca("cuanto sale el 200?") === null)
    agregar("'120 recorrido corto' NO es una moto", cilindradaSinMarca("120 recorrido corto") === null)
    agregar("'el combo 110' NO es una moto", cilindradaSinMarca("el combo 110") === null)
    // Con marca, resuelve el resolvedor de siempre: esto no se mete.
    agregar("'zanella 110 dlx' lo resuelve el otro camino", cilindradaSinMarca("zanella 110 dlx") === null)
    // Dos cilindradas no son una moto ("el 120 o el 170?").
    agregar("dos cilindradas NO es una moto", cilindradaSinMarca("tengo una 110 o 125") === null)
    agregar("texto vacío", cilindradaSinMarca("") === null)

    let fallaron = 0
    for (const c of casos) {
        console.log(`${c.ok ? "OK  " : "FALLA"}  ${c.titulo}`)
        if (!c.ok) fallaron++
    }
    console.log(`\n${casos.length - fallaron}/${casos.length} OK`)
    process.exit(fallaron === 0 ? 0 : 1)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
