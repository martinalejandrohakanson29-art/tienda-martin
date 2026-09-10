/**
 * Pruebas de la negativa de compatibilidad: la letra de la casa
 * (`textoIncompatibleSugerido`) y el recorte de preámbulos de sinceridad del
 * sanitizador.
 *
 * No pega contra ninguna API: son puras.
 *
 *   npx tsx bot-agente/pruebas/probar-negativa-compat.ts
 *
 * Contexto: conv 3874 (10/09, Wave NF). La negativa la redactaba el modelo y
 * salió "te soy sincero: ese combo no le entra directo a la Wave NF...". El dato
 * estaba cargado (fila + motivo): lo que faltaba era que la mandáramos con
 * nuestra letra, como el precio y el envío. Ver `nucleo/compat-negativa.ts`.
 */
import { textoIncompatibleSugerido, nombreMotoParaCliente } from "@/lib/compat-mensaje"
import { sanitizarMensajeSalida } from "../guardrails/sanitizador"

const MOTIVO_WAVE =
    "Para que entre hay que hacerle modificaciones al motor (alesar los cárteres) — no es un cambio directo de fábrica."

interface Caso {
    titulo: string
    obtenido: string
    esperado: string
}

const CASOS: Caso[] = [
    {
        titulo: "letra de la casa: negativa + motivo, con la moto en su grafía",
        obtenido: textoIncompatibleSugerido("Ese kit no le va a la {moto}.", "wave nf", MOTIVO_WAVE),
        esperado: `Ese kit no le va a la Wave NF. ${MOTIVO_WAVE}`,
    },
    {
        titulo: "sin motivo cargado: sale la negativa sola, sin puntuación colgada",
        obtenido: textoIncompatibleSugerido("Ese kit no le va a la {moto}.", "honda biz 105", ""),
        esperado: "Ese kit no le va a la Honda Biz 105.",
    },
    {
        titulo: "texto viejo del equipo (sin {moto}): se respeta tal cual",
        obtenido: textoIncompatibleSugerido("Lamentablemente este kit no es compatible.", "wave nf", ""),
        esperado: "Lamentablemente este kit no es compatible.",
    },
    {
        titulo: "equipo dejó el texto vacío: fallback, nunca un mensaje en blanco",
        obtenido: textoIncompatibleSugerido("", "wave nf", ""),
        esperado: "Ese kit no le va a esa moto.",
    },
    {
        titulo: "siglas y cilindradas: NF va en mayúscula, Blitz no",
        obtenido: nombreMotoParaCliente("motomel blitz 110"),
        esperado: "Motomel Blitz 110",
    },
    // ── El backstop: si el modelo igual mete el preámbulo, se recorta ──────────
    {
        titulo: "conv 3874: 'te soy sincero:' se recorta y la oración queda entera",
        obtenido: sanitizarMensajeSalida("te soy sincero: ese combo no le entra directo a la Wave NF.", {
            esConversacionEnCurso: true,
        }).textoLimpio,
        esperado: "Ese combo no le entra directo a la Wave NF.",
    },
    {
        titulo: "'la verdad es que' / 'lamento decirte que' también salen",
        obtenido: sanitizarMensajeSalida("Lamento decirte que no le entra. La verdad es que hay que alesar.", {
            esConversacionEnCurso: true,
        }).textoLimpio,
        esperado: "No le entra. Hay que alesar.",
    },
    {
        titulo: "una lista de precios no se recapitaliza (el recorte es por oración)",
        obtenido: sanitizarMensajeSalida("Te soy sincero, no hay stock.\n👉🏼 corto: $175.000\n👉🏼 largo: $189.000", {
            esConversacionEnCurso: true,
        }).textoLimpio,
        esperado: "No hay stock.\n👉🏼 corto: $175.000\n👉🏼 largo: $189.000",
    },
    {
        titulo: "'avisame vos cuando estés listo' no es muletilla: no se toca",
        obtenido: sanitizarMensajeSalida("Dale! Cuando estés listo nos escribís.", {
            esConversacionEnCurso: true,
        }).textoLimpio,
        esperado: "Dale! Cuando estés listo nos escribís.",
    },
]

function main() {
    let pasados = 0
    for (const c of CASOS) {
        const ok = c.obtenido === c.esperado
        if (ok) pasados++
        console.log(`${ok ? "OK  " : "FALLA"} ${c.titulo}`)
        if (!ok) {
            console.log(`        esperado: ${JSON.stringify(c.esperado)}`)
            console.log(`        obtenido: ${JSON.stringify(c.obtenido)}`)
        }
    }

    console.log(`\n${pasados}/${CASOS.length} pasados`)
    process.exit(pasados === CASOS.length ? 0 : 1)
}

main()
