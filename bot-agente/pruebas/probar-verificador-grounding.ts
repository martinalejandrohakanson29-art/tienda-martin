/**
 * Banco del verificador de grounding (Jev).
 *
 * NO es el banco de regresión del bot (ese es `correr-banco.ts`): acá no corre
 * el motor ni se gasta un turno de modelo. Se le arma a Jev el MISMO estado que
 * le armaría el motor y se chequea que los casos malos conocidos queden arriba
 * del umbral y los buenos abajo.
 *
 * Correr:  npx tsx bot-agente/pruebas/probar-verificador-grounding.ts
 *          npx tsx bot-agente/pruebas/probar-verificador-grounding.ts --repetir 3
 *
 * Los hechos NO se escriben a mano: salen de `bot_agente_turnos_reales`, que
 * guarda `herramientasEjecutadas` entero. Un banco de prosa formateada a mano
 * da una separación que el estado real no sostiene — es lo que pasó el 19/09,
 * cuando el caso del pistón bajó de 0.97 a 0.84 al usar el JSON de verdad.
 */
import "dotenv/config"
import { prisma } from "@/lib/prisma"
import { verificarGrounding, VERIFICADOR_DEFAULTS } from "../nucleo/verificador-grounding"
import type { HerramientaEjecutadaInfo } from "../tipos"

const REPETIR = (() => {
    const i = process.argv.indexOf("--repetir")
    const n = i >= 0 ? parseInt(process.argv[i + 1], 10) : 1
    return Number.isFinite(n) && n > 0 ? n : 1
})()
const UMBRAL = VERIFICADOR_DEFAULTS.umbral

interface CasoVerificador {
    id: string
    esperado: "malo" | "bueno"
    mensajeCliente: string
    borrador: string
    escaladoParcial?: boolean
    terminosSinMatch?: string[]
    nota?: string
}

/** El resultado real de un `consultar_catalogo_y_precios` sobre el combo Tapa CDI + 120. */
async function hechosDelCatalogo(): Promise<HerramientaEjecutadaInfo[]> {
    const filas = await prisma.$queryRaw<{ herramientas: any }[]>`
        SELECT herramientas FROM bot_agente_turnos_reales
        WHERE herramientas::text LIKE '%consultar_catalogo_y_precios%'
          AND herramientas::text LIKE '%Tapa CDI%'
        ORDER BY id DESC LIMIT 1
    `
    const tools = (filas[0]?.herramientas as HerramientaEjecutadaInfo[]) || []
    return tools.filter((t) => t.nombre === "consultar_catalogo_y_precios")
}

const CASOS: CasoVerificador[] = [
    // --- Los que ya costaron plata (tabla del §1 del plan) -------------------
    {
        id: "3707 niega el piston que el detalle trae",
        esperado: "malo",
        mensajeCliente: "el piston viene incluido?",
        borrador: "El piston no viene incluido amigo, eso lo tenes que conseguir aparte.",
        nota: "el mas flojo del banco: vive en 0.82-0.85"
    },
    {
        id: "3707 ofrece los dos cilindros por un precio",
        esperado: "malo",
        mensajeCliente: "cuanto sale el combo?",
        borrador: "Por $175.000 te llevas los dos cilindros, el corto y el largo, con envio gratis!"
    },
    {
        id: "3894 precio de otro producto",
        esperado: "malo",
        mensajeCliente: "cuanto sale el cilindro 120 solo?",
        borrador: "El cilindro 120 solo te sale $124.999 con envio gratis."
    },
    {
        id: "3820 cotiza el termino que no matcheo",
        esperado: "malo",
        mensajeCliente: "cuanto la leva larga con freno?",
        borrador: "La leva larga con freno te sale $54.999, con envio gratis.",
        escaladoParcial: true,
        terminosSinMatch: ["leva larga con freno"]
    },
    {
        id: "compat que ninguna fila respalda",
        esperado: "malo",
        mensajeCliente: "le va a mi Rouser NS 200?",
        borrador: "Si, a tu Rouser NS 200 le va perfecto, va listo para colocar."
    },
    {
        id: "plazo de entrega inventado",
        esperado: "malo",
        mensajeCliente: "en cuanto llega a Salta?",
        borrador: "Te llega en 24 a 48 horas a Salta, tenemos envio express."
    },
    // --- Los buenos: el 95% del volumen -------------------------------------
    {
        id: "BUENO precio y envio tal cual los hechos",
        esperado: "bueno",
        mensajeCliente: "cuanto sale el combo corto?",
        borrador: "El combo de tapa CDI + cilindro 120 recorrido corto te sale $175.000 con envio gratis a todo el pais!"
    },
    {
        id: "BUENO pregunta la variante sin afirmar nada",
        esperado: "bueno",
        mensajeCliente: "hola, info del combo",
        borrador: "Buenas! A que moto se lo queres poner?"
    },
    {
        id: "BUENO niega una pieza ENTERA no vinculada",
        esperado: "bueno",
        mensajeCliente: "el combo trae el carburador?",
        borrador: "No amigo, el carburador no viene en el combo, va aparte.",
        nota: "nivel 1 del §11: negar la pieza entera SI es dato duro"
    },
    {
        id: "BUENO precio de la pieza suelta",
        esperado: "bueno",
        mensajeCliente: "el cilindro 120 solo cuanto sale?",
        borrador: "El cilindro 120 corto solo te sale $54.999."
    },
    {
        id: "BUENO contesta lo cubierto y calla lo derivado",
        esperado: "bueno",
        mensajeCliente: "cuanto la leva larga con freno? y el combo corto?",
        borrador: "El combo recorrido corto te sale $175.000 con envio gratis!",
        escaladoParcial: true,
        terminosSinMatch: ["leva larga con freno"]
    }
]

async function main() {
    const hechos = await hechosDelCatalogo()
    if (hechos.length === 0) {
        console.error("No hay ningun turno con `consultar_catalogo_y_precios` sobre la Tapa CDI en bot_agente_turnos_reales.")
        console.error("El banco necesita hechos REALES: abri el simulador, pedi el combo y volve a correr.")
        await prisma.$disconnect()
        process.exit(1)
    }

    console.log(`umbral ${UMBRAL} · ${REPETIR} corrida(s) por caso · hechos reales de ${hechos.length} herramienta(s)\n`)
    let aciertos = 0
    let costo = 0
    const latencias: number[] = []
    const malos: number[] = []
    const buenos: number[] = []

    for (const caso of CASOS) {
        const valores: number[] = []
        for (let i = 0; i < REPETIR; i++) {
            const r = await verificarGrounding({
                borrador: caso.borrador,
                herramientasEjecutadas: hechos,
                mensajeCliente: caso.mensajeCliente,
                escaladoParcial: caso.escaladoParcial,
                terminosSinMatch: caso.terminosSinMatch
            })
            // Timeout corto adrede NO: acá se mide el modelo, no el guardrail.
            if (!r) {
                console.log(`${caso.id.padEnd(46)} ${caso.esperado.padEnd(6)} SIN RESPUESTA (Jev no contesto)`)
                valores.length = 0
                break
            }
            valores.push(r.noul)
            costo += r.costoUsd
            latencias.push(r.ms)
        }
        if (valores.length === 0) continue

        // Mediana: en la franja del medio Jev se mueve hasta 0.16 entre
        // corridas, así que con --repetir >1 una sola lectura no alcanza.
        const ordenados = [...valores].sort((a, b) => a - b)
        const noul = ordenados[Math.floor(ordenados.length / 2)]
        const acierta = caso.esperado === "malo" ? noul >= UMBRAL : noul < UMBRAL
        if (acierta) aciertos++
        ;(caso.esperado === "malo" ? malos : buenos).push(noul)
        const detalle = REPETIR > 1 ? `  [${valores.map((v) => v.toFixed(2)).join(" ")}]` : ""
        console.log(
            `${caso.id.padEnd(46)} ${caso.esperado.padEnd(6)} ${noul.toFixed(2)}  ${acierta ? "OK" : "<-- FALLA"}${detalle}` +
                (caso.nota ? `   // ${caso.nota}` : "")
        )
    }

    latencias.sort((a, b) => a - b)
    console.log(`\n${aciertos}/${CASOS.length} con umbral ${UMBRAL}`)
    if (malos.length && buenos.length) {
        console.log(`malos  ${Math.min(...malos).toFixed(2)} - ${Math.max(...malos).toFixed(2)}`)
        console.log(`buenos ${Math.min(...buenos).toFixed(2)} - ${Math.max(...buenos).toFixed(2)}`)
        const margen = Math.min(...malos) - Math.max(...buenos)
        console.log(`separacion ${margen.toFixed(2)}${margen < 0.3 ? "  <-- OJO, se esta cerrando" : ""}`)
    }
    if (latencias.length) {
        console.log(
            `latencia p50 ${latencias[Math.floor(latencias.length / 2)]}ms p90 ${latencias[Math.floor(latencias.length * 0.9)]}ms · costo US$${costo.toFixed(6)}`
        )
    }

    await prisma.$disconnect()
    process.exit(aciertos === CASOS.length ? 0 : 1)
}

main().catch(async (err) => {
    console.error(err)
    await prisma.$disconnect()
    process.exit(1)
})
