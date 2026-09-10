/**
 * Pruebas del guardrail `quitarHechosYaDichos` (sanitizador).
 *
 * No pega contra ninguna API: son puras. Corren en 1 segundo y cubren el
 * riesgo real de este guardrail, que NO es dejar pasar una repetición sino
 * recortar de más y comerse un dato que el cliente necesitaba.
 *
 *   npx tsx bot-agente/pruebas/probar-hechos-repetidos.ts
 *
 * Contexto: el guardrail nació el 09/09 porque deepseek-v4-flash repetía datos
 * ya dados parafraseándolos (caso-33 del banco), y `quitarOracionesYaDichas`
 * solo detecta la oración calcada. La primera versión se comió el precio final
 * al elegir variante (casos 24 y 29): de ahí sale la regla de los "hechos
 * frescos" — lo que salió de una herramienta en este turno es la respuesta, no
 * una repetición.
 */
import { quitarHechosYaDichos, extraerHechos } from "../guardrails/sanitizador"

const ENVIOS_YA_DICHO =
    "Lo despachamos por Andreani a domicilio y demora 4 a 6 días hábiles.\n\n" +
    "El envío es gratis y se despacha después del pago.\n\n" +
    "Le va bien bro, cualquier cosa avisanos y coordinamos."

/**
 * Ficha oficial del anuncio (conv 3859): sale por el match de plantilla, antes
 * del sub-turno que resuelve el resto de la ráfaga. Ya trae los dos precios y
 * el envío gratis.
 */
const FICHA_ANUNCIO_3859 =
    "Hola!" +
    "\n\nEl combo de TAPA CDI + CILINDRO 120 viene con la corona de distribucion de regalo." +
    "\n\nTenes 2 opciones:" +
    "\nRecorrido corto: $175.000" +
    "\nRecorrido largo: $189.000" +
    "\n\nEnvio gratis a todo el pais!" +
    "\n\nA que moto se lo queres poner?"

interface Caso {
    titulo: string
    texto: string
    previos: string[]
    mensajeCliente?: string
    hechosFrescos?: string[]
    /** Hechos que ya salieron en un globo de esta misma rafaga (ficha del anuncio). */
    hechosDeLaMismaRafaga?: string[]
    /** true = el guardrail TIENE que recortar; false = no debe tocar nada. */
    debeRecortar: boolean
    /** true = el globo tiene que quedar vacio (el motor lo descarta). */
    debeQuedarVacio?: boolean
}

const CASOS: Caso[] = [
    {
        titulo: "repite el plazo ya dado, parafraseado (caso-33 real de deepseek)",
        texto:
            "Ah perfecto, Villa Dolores nos queda en la provincia y también llega bien por Andreani a domicilio, sin problema.\n\n" +
            "El envío es gratis y son esos 4 a 6 días hábiles hasta allá.",
        previos: [ENVIOS_YA_DICHO],
        mensajeCliente: "Nono yo soy de villa dolores Córdoba",
        debeRecortar: true
    },
    {
        titulo: "el cliente REpregunta el plazo: contestarlo no es repetirse",
        texto: "Son 4 a 6 días hábiles hasta allá.",
        previos: [ENVIOS_YA_DICHO],
        mensajeCliente: "cuanto tarda?",
        debeRecortar: false
    },
    {
        titulo: "precio que sale de una herramienta de ESTE turno (cierre de variante, casos 24 y 29)",
        texto: "Listo, la corta te queda en $175.000. Te lo mandamos sin cargo.",
        previos: ["El combo viene en corto a $175.000 y en largo a $189.000."],
        mensajeCliente: "el corto",
        hechosFrescos: ["175000"],
        debeRecortar: false
    },
    {
        titulo: "el mismo precio SIN herramienta que lo respalde: es recitado del historial",
        texto: "Perfecto, entonces son $99.990 y coordinamos.",
        previos: ["El Kit 170 varillero sale $99.990 con la leva incluida."],
        mensajeCliente: "listo lo quiero",
        debeRecortar: true
    },
    {
        titulo: "dato nuevo que nunca se dijo",
        texto: "El kit sale $99.990 y te lo mandamos sin cargo.",
        previos: [ENVIOS_YA_DICHO],
        mensajeCliente: "y el kit cuanto era",
        debeRecortar: false
    },
    {
        titulo: "charla sin hechos: no se toca",
        texto: "Ah dale, perfecto. Te queda anotado entonces.",
        previos: [ENVIOS_YA_DICHO],
        mensajeCliente: "soy de villa dolores",
        debeRecortar: false
    },
    {
        titulo: "primera vez que se habla del tema (sin mensajes previos)",
        texto: "Demora 4 a 6 días hábiles y el envío es gratis.",
        previos: [],
        mensajeCliente: "hacen envios",
        debeRecortar: false
    },
    {
        titulo: "nunca deja el mensaje vacío",
        texto: "Son 4 a 6 días hábiles.",
        previos: [ENVIOS_YA_DICHO],
        mensajeCliente: "dale",
        debeRecortar: false // todo era repetido -> devuelve el original, no vacío
    },

    // --- Conv 3859 (10/09): la ficha de la plantilla del anuncio sale primero
    // y el sub-turno que resuelve el resto de la ráfaga repetía los precios
    // tres segundos después. Los hechos de la ficha le ganan a "es fresco" y
    // al atajo de "el cliente preguntó".
    {
        titulo: "conv 3859: el sub-turno repite los precios de la ficha recién enviada",
        texto: "Te paso: recorrido corto $175.000 y recorrido largo $189.000. Las dos con envío gratis.",
        previos: [FICHA_ANUNCIO_3859],
        mensajeCliente: "Cuánto sale",
        hechosFrescos: ["175000", "189000", "gratis"],
        hechosDeLaMismaRafaga: [...extraerHechos(FICHA_ANUNCIO_3859)],
        debeRecortar: true,
        debeQuedarVacio: true
    },
    {
        titulo: "conv 3859 con signo de pregunta: el atajo de \"el cliente preguntó\" no lo salva",
        texto: "Te paso: recorrido corto $175.000 y recorrido largo $189.000. Las dos con envío gratis.",
        previos: [FICHA_ANUNCIO_3859],
        mensajeCliente: "Cuánto sale?",
        hechosFrescos: ["175000", "189000", "gratis"],
        hechosDeLaMismaRafaga: [...extraerHechos(FICHA_ANUNCIO_3859)],
        debeRecortar: true,
        debeQuedarVacio: true
    },
    {
        titulo: "misma ráfaga pero el globo trae un dato nuevo: se recorta, no se descarta",
        texto: "Los precios son $175.000 y $189.000. La demora es de 4 a 6 días hábiles.",
        previos: [FICHA_ANUNCIO_3859],
        mensajeCliente: "cuanto sale y cuanto demora?",
        hechosFrescos: ["175000", "189000"],
        hechosDeLaMismaRafaga: [...extraerHechos(FICHA_ANUNCIO_3859)],
        debeRecortar: true,
        debeQuedarVacio: false
    },
    {
        titulo: "misma ráfaga: la pregunta del bot nunca se descarta",
        texto: "Cuál de las dos te sirve?",
        previos: [FICHA_ANUNCIO_3859],
        mensajeCliente: "cuanto sale",
        hechosDeLaMismaRafaga: [...extraerHechos(FICHA_ANUNCIO_3859)],
        debeRecortar: false
    }
]

function main() {
    console.log("hechos detectados en el bloque de envios:", [...extraerHechos(ENVIOS_YA_DICHO)].join(" | "), "\n")

    let pasados = 0
    for (const c of CASOS) {
        const salida = quitarHechosYaDichos(
            c.texto,
            c.previos,
            c.mensajeCliente,
            c.hechosFrescos ? new Set(c.hechosFrescos) : undefined,
            c.hechosDeLaMismaRafaga ? new Set(c.hechosDeLaMismaRafaga) : undefined
        )
        const recorto = salida !== c.texto
        const quedoVacio = salida.trim().length === 0
        const ok = recorto === c.debeRecortar && quedoVacio === !!c.debeQuedarVacio
        if (ok) pasados++

        console.log(`${ok ? "OK  " : "FALLA"} ${c.titulo}`)
        if (!ok || recorto) console.log(`        -> ${JSON.stringify(salida)}`)
        if (quedoVacio && !c.debeQuedarVacio) console.log("        !! devolvio vacio (nunca deberia)")
    }

    console.log(`\n${pasados}/${CASOS.length} pasados`)
    process.exit(pasados === CASOS.length ? 0 : 1)
}

main()
