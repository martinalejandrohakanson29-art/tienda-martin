/**
 * Chequeo del catálogo del bot desde la línea de comandos.
 *
 *   npm run catalogo:validar            todo el catálogo activo
 *   npm run catalogo:validar -- --pack 14   solo ese pack y lo que lo rodea
 *   npm run catalogo:validar -- --json      para pegarlo en un check automático
 *
 * Sale con código 1 si hay bloqueantes, así sirve como puerta antes de un
 * deploy o después de restaurar un backup (el incidente del 15/09 se habría
 * visto acá: el typo de categoría del Kit 170 deja el kit fuera del rubro).
 */
import { validarCatalogo, validarPack, type Hallazgo, type Severidad } from "../lib/validacion-catalogo"

const COLOR: Record<Severidad, string> = {
    bloqueante: "\x1b[41m\x1b[37m",
    riesgo: "\x1b[33m",
    aviso: "\x1b[90m",
}
const RESET = "\x1b[0m"
const ETIQUETA: Record<Severidad, string> = {
    bloqueante: " BLOQUEA ",
    riesgo: " RIESGO  ",
    aviso: " aviso   ",
}

function arg(nombre: string): string | undefined {
    const i = process.argv.indexOf(`--${nombre}`)
    return i >= 0 ? process.argv[i + 1] : undefined
}

function imprimir(hallazgos: Hallazgo[]) {
    let entidadActual = ""
    for (const h of hallazgos) {
        const cabecera = `${h.entidad}: ${h.entidadNombre}`
        if (cabecera !== entidadActual) {
            entidadActual = cabecera
            console.log(`\n\x1b[1m${cabecera}${RESET}`)
        }
        console.log(`  ${COLOR[h.severidad]}${ETIQUETA[h.severidad]}${RESET} ${h.titulo}  \x1b[90m(${h.campo})${RESET}`)
        console.log(`             ${h.consecuencia}`)
        console.log(`             \x1b[36m→ ${h.comoSeArregla}${RESET}`)
    }
}

async function main() {
    const packId = arg("pack")
    const reporte = packId ? await validarPack(Number(packId)) : await validarCatalogo()

    if (process.argv.includes("--json")) {
        console.log(JSON.stringify(reporte, null, 2))
    } else {
        const { packs, grupos, articulos, filasCompat } = reporte.alcance
        console.log(
            `\nCatálogo del bot — ${packs} packs, ${grupos} grupos, ${articulos} artículos, ${filasCompat} filas de compatibilidad`
        )
        if (packId) console.log(`(revisión acotada al pack ${packId})`)

        if (reporte.hallazgos.length === 0) {
            console.log("\n\x1b[32mSin observaciones.\x1b[0m\n")
        } else {
            imprimir(reporte.hallazgos)
            const { bloqueantes, riesgos, avisos } = reporte.resumen
            console.log(
                `\n\x1b[1mResumen:\x1b[0m ${bloqueantes} bloqueante(s), ${riesgos} riesgo(s), ${avisos} aviso(s)\n`
            )
        }
    }

    process.exit(reporte.resumen.bloqueantes > 0 ? 1 : 0)
}

main().catch((e) => {
    console.error(e)
    process.exit(2)
})
