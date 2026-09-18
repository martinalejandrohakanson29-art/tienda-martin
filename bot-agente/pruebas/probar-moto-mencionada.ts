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
import { ofreceProductosParaLaMoto, afirmaTenerParaSuMoto, oracionQuePreguntaLaMoto, cuentaProductosNombrados, afirmaCompatibilidad } from "../guardrails/sanitizador"
import { cilindradaSinMarca, marcaConCilindradaSinModelo } from "../nucleo/motos"

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

    // Ya confirmada: el aviso SIGUE saliendo. Esa confirmación es de OTRO
    // producto (el que se consultó antes), así que para el kit que se está
    // buscando ahora la compatibilidad está sin verificar.
    const confirmada = await consultarCatalogoPrecios({
        termino_busqueda: "kit 120",
        __embudo: { motoDelMensaje: null, motoMencionada: null, motoConfirmada: "110 DLX" }
    })
    agregar(
        "la moto confirmada de otro producto igual dispara el aviso",
        /EL CLIENTE YA DIJO SU MOTO EN ESTA CHARLA: 110 DLX/.test(confirmada.mensaje_para_agente)
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

    // MARCA + CILINDRADA SIN MODELO (conv 4525): "Zanella 150" no es ninguna de
    // las de arriba y quedaba en tierra de nadie. Falta UN dato —cual de esa
    // marca y cilindrada— y preguntarlo lo consigue.
    agregar(
        "'Tengo una Zanella 150' es marca + cilindrada sin modelo",
        marcaConCilindradaSinModelo("Tengo una Zanella 150", { exigirMarcador: true }) === "zanella 150"
    )
    agregar(
        "en la ráfaga, el renglón de la moto se lee igual",
        marcaConCilindradaSinModelo(
            "¡Hola! Quiero más información SOBRE EL KIT 170?\nTengo una Zanella 150\nSe puede poner un cilindro de 200",
            { exigirMarcador: true }
        ) === "zanella 150"
    )
    agregar(
        "'zanella rx 150' NO: ya dijo el modelo",
        marcaConCilindradaSinModelo("zanella rx 150") === null
    )
    agregar(
        "'Para una Gilera' NO: es marca sola, tiene su propio camino",
        marcaConCilindradaSinModelo("Para una Gilera") === null
    )
    agregar(
        "'para una honda, el kit 120?' NO: el número es del kit",
        marcaConCilindradaSinModelo("para una honda, el kit 120?", { exigirMarcador: true }) === null
    )
    agregar(
        "sin marcador explícito, sobre el mensaje crudo no dispara",
        marcaConCilindradaSinModelo("para una zanella 150", { exigirMarcador: true }) === null
    )
    agregar(
        "sobre `modelo_moto` (el dato ya decidido) no hace falta marcador",
        marcaConCilindradaSinModelo("Zanella 150") === "zanella 150"
    )

    // LA PREGUNTA QUE SE RESCATA cuando el turno se recorta (backstop de la
    // repregunta en el motor): tiene que salir la que pide el modelo de la moto
    // y NINGUNA otra, o volveriamos a ofrecerle algo sin saber que moto tiene.
    agregar(
        "rescata la pregunta pegada a la ficha",
        oracionQuePreguntaLaMoto("Te la paso: $167.000. Cual Zanella 150 tenes?", "zanella 150") ===
            "Cual Zanella 150 tenes?"
    )
    agregar(
        "la reconoce tambien sin el nombre de la moto",
        oracionQuePreguntaLaMoto("Dale! Decime que modelo tenes?", "zanella 150") === "Decime que modelo tenes?"
    )
    agregar(
        "'cual es?' tambien pide el dato",
        oracionQuePreguntaLaMoto("Cual es? Asi te confirmo", "zanella 150") === "Cual es?"
    )
    agregar(
        "una pregunta que OFRECE no es la repregunta",
        oracionQuePreguntaLaMoto("Querés que te pase el precio?", "zanella 150") === null
    )
    agregar(
        "una pregunta con precio adentro tampoco",
        oracionQuePreguntaLaMoto("Te paso la data del 200, sale $167.000. Lo querés?", "zanella 150") === null
    )

    // El MENÚ del Paso 1 (conv del caso 96): lo que `ofreceProductosParaLaMoto`
    // no ve porque su regex no cruza el salto de línea. Se cuenta por nombre de
    // producto, que es el hecho, no por la frase que los envuelve.
    const COMBOS_120 = [
        "Combo 110 a 120 + Codo y carburador",
        "Combo Tapa CDI + Cilindro 120",
        "Kit 120 corto + Leva 6.40"
    ]
    agregar(
        "el menu de los tres combos se cuenta entero, con los nombres en otro renglon",
        cuentaProductosNombrados(
            "El kit 120 para Wave lo tenemos en tres versiones, decime cual buscas:\n👉🏼 Combo 110 a 120 + Codo y carburador\n👉🏼 Combo Tapa CDI + Cilindro 120\n👉🏼 Kit 120 corto + Leva 6.40",
            COMBOS_120
        ) === 3
    )
    agregar(
        "ese mismo menu es el que la regex anclada al nombre de la moto NO ve",
        ofreceProductosParaLaMoto(
            "El kit 120 para Wave lo tenemos en tres versiones, decime cual buscas:\n👉🏼 Combo 110 a 120 + Codo y carburador\n👉🏼 Combo Tapa CDI + Cilindro 120\n👉🏼 Kit 120 corto + Leva 6.40",
            "Honda Wave 110"
        ) === false
    )
    agregar(
        "hablar de UN combo no es un menu",
        cuentaProductosNombrados("El Combo Tapa CDI + Cilindro 120 lo tenemos en corto y largo.", COMBOS_120) === 1
    )
    agregar(
        "un combo nombrado al pasar no cuenta: faltan sus palabras distintivas",
        cuentaProductosNombrados("El combo de 120 sale $175.000 con envio gratis.", COMBOS_120) === 0
    )
    agregar(
        "la negativa redactada no nombra ningun producto del menu",
        cuentaProductosNombrados("Ese kit no le va a la Wave. Para que entre hay que alesar los carteres.", COMBOS_120) === 0
    )
    // "te queda cómodo" es la dirección del local, no la moto (conv 4538).
    agregar(
        "'si te queda comodo pasas por el local' NO afirma compatibilidad",
        afirmaCompatibilidad("Sisi, de Córdoba capital. Así que si te queda cómodo pasas por el local, y si no te lo mandamos.") === false
    )
    agregar(
        "'le queda perfecto' si la afirma",
        afirmaCompatibilidad("Ese kit le queda perfecto a tu moto.") === true
    )

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
