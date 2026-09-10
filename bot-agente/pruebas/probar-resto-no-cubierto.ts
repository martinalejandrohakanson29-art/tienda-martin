/**
 * Chequeo del detector de "resto no cubierto" contra el catálogo REAL.
 *
 *   npx tsx bot-agente/pruebas/probar-resto-no-cubierto.ts
 *
 * Los casos positivos son los que tienen que avisar (el "freno" de la conv
 * 3820). Los negativos son la parte cara: un aviso de más manda al equipo un
 * escalado que nadie pidió, así que acá entran los mensajes normales de
 * WhatsApp que NO pueden disparar nada.
 */
import { detectarRestoNoCubierto } from "../nucleo/resto-no-cubierto"

/** Lo que consume `resolver_variante` en el grupo "Kit 120 corto + Leva 6.40". */
const CONSUMIDO_GRUPO_4 = [
    "Kit 120 corto + Leva 6.40",
    "leva corta", "Kit 120 corto + leva 6.40 corta", "corta", "69", "69mm", "6.40 corta",
    "leva larga", "Kit 120 corto + leva 6.40 larga", "larga", "74", "74mm", "6.40 larga",
    "Guerrero Trip",
]

const casos: { mensaje: string; espera: string | null }[] = [
    // El caso que originó esto.
    { mensaje: "No leva larga con freno", espera: "freno" },
    { mensaje: "la larga, y viene con el embrague?", espera: "embrague" },
    { mensaje: "leva corta pero con pistón forjado", espera: "forjado" },

    // Nada raro: la variante y la moto, sola o con charla alrededor.
    { mensaje: "leva larga", espera: null },
    { mensaje: "Guerrero trip", espera: null },
    { mensaje: "dale, la corta entonces", espera: null },
    { mensaje: "tengo la guerrero trip 110, cual seria?", espera: null },
    { mensaje: "buenisimo, cuanto demora el envio a Corrientes?", espera: null },
    { mensaje: "perfecto, lo quiero. como puedo pagarlo?", espera: null },
    { mensaje: "la de 74mm", espera: null },
    { mensaje: "el cilindro solo cuanto sale?", espera: null },
    { mensaje: "gracias maestro, cualquier cosa te aviso", espera: null },

    // Frases con "con"/"sin" que NO adosan nada raro: el término que sigue es
    // del catálogo, una moto, o un tema con herramienta propia.
    { mensaje: "la larga, viene con el cilindro?", espera: null },
    { mensaje: "lo pago con transferencia", espera: null },
    { mensaje: "con la guerrero trip 110 anda?", espera: null },
    { mensaje: "sin la leva cuanto sale?", espera: null },
    { mensaje: "lo llevo con envio incluido a Cordoba", espera: null },
]

async function main() {
    let fallos = 0
    for (const caso of casos) {
        const r = await detectarRestoNoCubierto(caso.mensaje, CONSUMIDO_GRUPO_4)
        const detectado = r?.terminos ?? []
        const ok = caso.espera
            ? detectado.some((t) => t.toLowerCase().includes(caso.espera!.toLowerCase()))
            : detectado.length === 0
        if (!ok) fallos++
        console.log(
            `${ok ? "OK   " : "FALLA"} ${caso.mensaje.padEnd(46)} -> ${detectado.length ? detectado.join(", ") : "(nada)"}` +
                (ok ? "" : `  [esperado: ${caso.espera ?? "(nada)"}]`)
        )
    }
    console.log(fallos === 0 ? "\nTodos OK" : `\n${fallos} fallos`)
    process.exit(fallos === 0 ? 0 : 1)
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
