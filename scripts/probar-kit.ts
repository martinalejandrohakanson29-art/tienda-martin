/**
 * Corre la prueba de un kit contra el motor real desde la terminal.
 *
 *   npm run kit:probar -- --pack 11
 *
 * Es lo mismo que el botón "Probar con el bot" del diálogo de publicación:
 * cinco preguntas reales (precio, qué trae, una moto que sí, una que no, envío)
 * sobre una conversación de juguete que se borra al terminar. No manda nada a
 * WhatsApp. Gasta tokens del modelo de producción, como cualquier turno.
 */
import { probarKitConBot } from "../lib/prueba-kit"

function arg(nombre: string): string | undefined {
    const i = process.argv.indexOf(`--${nombre}`)
    return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
    const pack = arg("pack")
    if (!pack) {
        console.error("Falta --pack <id>. Ej: npm run kit:probar -- --pack 11")
        process.exit(2)
    }

    const r = await probarKitConBot(Number(pack))
    console.log(`\n\x1b[1mPrueba del kit: ${r.packNombre}\x1b[0m\n`)
    if (r.error) console.log(`\x1b[31m${r.error}\x1b[0m\n`)

    for (const t of r.turnos) {
        console.log(`\x1b[1m${t.titulo}\x1b[0m \x1b[90m— ${t.mide}\x1b[0m`)
        if (t.salteado) {
            console.log(`  \x1b[33m(salteado) ${t.salteado}\x1b[0m\n`)
            continue
        }
        console.log(`  \x1b[36mCliente:\x1b[0m ${t.pregunta}`)
        console.log(`  \x1b[32mBot:\x1b[0m ${t.respuesta.replace(/\n/g, "\n       ")}`)
        const marcas = [t.escalado ? "derivó al equipo" : null, ...t.herramientas].filter(Boolean)
        if (marcas.length > 0) console.log(`  \x1b[90m[${marcas.join(", ")}]\x1b[0m`)
        console.log()
    }

    process.exit(0)
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
