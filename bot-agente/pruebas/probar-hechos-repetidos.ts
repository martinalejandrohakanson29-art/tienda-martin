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

interface Caso {
    titulo: string
    texto: string
    previos: string[]
    mensajeCliente?: string
    hechosFrescos?: string[]
    /** true = el guardrail TIENE que recortar; false = no debe tocar nada. */
    debeRecortar: boolean
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
            c.hechosFrescos ? new Set(c.hechosFrescos) : undefined
        )
        const recorto = salida !== c.texto
        const ok = recorto === c.debeRecortar
        if (ok) pasados++

        console.log(`${ok ? "OK  " : "FALLA"} ${c.titulo}`)
        if (!ok || recorto) console.log(`        -> ${JSON.stringify(salida)}`)
        if (!salida.trim()) console.log("        !! devolvio vacio (nunca deberia)")
    }

    console.log(`\n${pasados}/${CASOS.length} pasados`)
    process.exit(pasados === CASOS.length ? 0 : 1)
}

main()
