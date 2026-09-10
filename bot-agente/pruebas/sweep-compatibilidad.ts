/**
 * SWEEP DE COMPATIBILIDAD — red anti-regresión de la capa de datos+matching.
 *
 *   npx tsx bot-agente/pruebas/sweep-compatibilidad.ts
 *   npx tsx bot-agente/pruebas/sweep-compatibilidad.ts --actualizar
 *
 * Cruza TODAS las motos de `motos_modelos` (más un puñado de grafías sueltas que
 * en su momento rompieron algo) contra TODOS los grupos activos Y contra los
 * packs sueltos (los que no pertenecen a un grupo), y compara el veredicto con
 * el snapshot de `sweep-compatibilidad.esperado.txt`.
 *
 * POR QUÉ EXISTE
 * --------------
 * El banco de `casos-reales.ts` pega contra el LLM: es caro, lento y no se corre
 * en cada cambio. Pero los últimos fixes no vivieron en el LLM sino acá abajo —
 * en el matching de motos y en las filas de compatibilidad — y esa capa no tenía
 * red. Este sweep es determinista (cero llamadas al modelo, solo BD) y por eso
 * se puede correr después de tocar cualquier scorer o cualquier fila de datos.
 *
 * Ya pagó su costo: corriéndolo salió que una fila de "Bajaj Boxer 150" le
 * confirmaba el cilindro 120 a una Rouser NS 200, y que 12 motos de 125cc para
 * arriba recibían "le va bien" para el Kit 120 que se anuncia "para 110".
 *
 * POR QUÉ TAMBIÉN LOS PACKS SUELTOS
 * ---------------------------------
 * Hasta el 10/09 el sweep solo miraba grupos, y por eso NO vio el "le va bien
 * el Kit 170 a la Gilera 110" de la conv 3894: el Kit 170 es un pack sin grupo.
 * Las dos capas se recorren distinto a propósito, porque así las recorre el bot:
 *  - grupo  -> `resolverVariante`, que valida la moto antes de la variante.
 *  - pack suelto -> `consultarCompatibilidad`, porque un pack sin variantes NO
 *    pasa por la validación de moto: `resolverVariante` devuelve "resuelta" para
 *    cualquier cosa, incluso para una moto que no existe. El único chequeo real
 *    es que el modelo llame a la tool de compatibilidad.
 *
 * CÓMO LEER EL SNAPSHOT
 * ---------------------
 *   SI   confirmada compatible (hay fila positiva)
 *   NO   incompatible, el bot lo dice con su motivo
 *   esc  escala en silencio (no hay dato para responder)
 *   ?    ni confirma ni escala: el bot sigue la charla
 *
 * Un cambio en el snapshot NO es necesariamente un bug: si cargás filas nuevas
 * de compatibilidad, se espera que algún `esc` pase a `SI` o `NO`. Lo que este
 * chequeo garantiza es que ninguno cambie SIN QUE TE ENTERES. Mirá el diff,
 * confirmá que cada línea nueva es lo que querías, y corré `--actualizar`.
 */
import { readFileSync, writeFileSync, existsSync } from "fs"
import { join } from "path"
import { prisma } from "@/lib/prisma"
import { resolverVariante } from "../herramientas/resolver-variante"
import { consultarCompatibilidad } from "../herramientas/compatibilidad"

const SNAPSHOT = join(__dirname, "sweep-compatibilidad.esperado.txt")

/**
 * Grafías que no son modelos del catálogo pero que el cliente escribe igual, y
 * casos genéricos. Cada una está acá porque rompió algo alguna vez:
 *  - "biz" pelada: ambigua entre las tres Biz, tiene que contestar igual.
 *  - "criptón" / "viz 105" / "weve nf": tandas del aprendizaje que decían "no
 *    compatible" a todo contradiciendo la grafía canónica (borradas el 09/09).
 *  - "110" / "una 110" / "Okinoi 110": el "le va a cualquier 110" tiene que
 *    seguir saliendo de la fila genérica `110`, no de un flag.
 *  - "Gilera 110": conv 3894. El Kit 170 es para varilleras 150 y le contestó
 *    "le va directo" a una 110, por dos filas de artículo envenenadas. Tiene
 *    que dar `esc` en la columna del Kit 170, nunca `SI`.
 *  - "Ferrari 500" / "Weber 150": moto que no existe, nunca se confirma.
 *  - "rouser" / "rouser 125" / "rouser 200": la fila `rouser 125` no tiene que
 *    hablar por la NS 200 (otra cilindrada), pero sí por su propia moto.
 */
const GRAFIAS_EXTRA = [
    "biz", "wave", "wave nf", "NF 100", "wawe nf", "criptón", "viz 105",
    "weve nf", "wuave", "wave s", "wave s 2022", "110 wave",
    "110", "una 110", "tengo un 110", "Okinoi 110", "Gilera 110",
    "rouser", "rouser 125", "rouser 200",
    "Ferrari 500", "Weber 150", "mi moto",
]

async function construirSweep(): Promise<string> {
    const grupos = await prisma.$queryRaw<{ nombre: string }[]>`
        SELECT nombre FROM chat_pack_grupos WHERE activo = true ORDER BY id
    `
    // Packs que no cuelgan de un grupo: su compatibilidad no la mira nadie más.
    const packsSueltos = await prisma.$queryRaw<{ nombre: string }[]>`
        SELECT nombre FROM chat_packs WHERE activo = true AND grupo_id IS NULL ORDER BY id
    `
    const motos = await prisma.$queryRaw<{ nombre_completo: string }[]>`
        SELECT nombre_completo FROM motos_modelos ORDER BY marca, modelo
    `

    const lineas: string[] = [
        `# grupos: ${grupos.map((g) => g.nombre).join(" | ")}`,
        `# packs sueltos: ${packsSueltos.map((p) => p.nombre).join(" | ")}`,
        `# SI=confirma  NO=incompatible  esc=escala en silencio  ?=sigue la charla`,
        "",
    ]

    for (const moto of [...motos.map((m) => m.nombre_completo), ...GRAFIAS_EXTRA]) {
        const veredictos: string[] = []
        for (const g of grupos) {
            const r = await resolverVariante({
                combo: g.nombre,
                modelo_moto: moto,
                mensaje_cliente: `para mi ${moto}`,
            })
            veredictos.push(
                r.incompatible ? "NO" : r.escalar ? "esc" : r.moto_confirmada ? "SI" : "?"
            )
        }
        for (const p of packsSueltos) {
            const r = await consultarCompatibilidad({
                modelo_moto: moto,
                kit_nombre_o_id: p.nombre,
            })
            veredictos.push(
                // "parcial" = la moto no resuelve firme y el bot repregunta con
                // candidatos: no confirma ni escala, sigue la charla.
                r.confianza === "parcial" ? "?" :
                !r.encontrado ? "esc" :
                r.compatible === true ? "SI" :
                r.compatible === false ? "NO" : "?"
            )
        }
        lineas.push(`${moto.padEnd(24)} ${veredictos.map((v) => v.padEnd(3)).join(" ")}`)
    }

    return lineas.join("\n") + "\n"
}

async function main() {
    const actual = await construirSweep()
    const actualizar = process.argv.includes("--actualizar")

    if (actualizar || !existsSync(SNAPSHOT)) {
        writeFileSync(SNAPSHOT, actual, "utf8")
        console.log(`Snapshot escrito en ${SNAPSHOT}`)
        return
    }

    const esperado = readFileSync(SNAPSHOT, "utf8")
    if (actual === esperado) {
        const filas = actual.split("\n").filter((l) => l && !l.startsWith("#")).length
        console.log(`Sweep OK: ${filas} motos sin cambios de veredicto.`)
        return
    }

    // Diff línea a línea: interesa QUÉ moto cambió y a qué, no el texto entero.
    const lineasEsperadas = new Map(
        esperado.split("\n").filter((l) => l && !l.startsWith("#")).map((l) => [l.slice(0, 24).trim(), l])
    )
    const lineasActuales = new Map(
        actual.split("\n").filter((l) => l && !l.startsWith("#")).map((l) => [l.slice(0, 24).trim(), l])
    )

    let cambios = 0
    for (const [moto, linea] of lineasActuales) {
        const previa = lineasEsperadas.get(moto)
        if (previa === undefined) {
            console.log(`NUEVA   ${linea}`)
            cambios++
        } else if (previa !== linea) {
            console.log(`CAMBIO  ${moto.padEnd(24)} ${previa.slice(24).trim()}  ->  ${linea.slice(24).trim()}`)
            cambios++
        }
    }
    for (const moto of lineasEsperadas.keys()) {
        if (!lineasActuales.has(moto)) {
            console.log(`FALTA   ${moto} (estaba en el snapshot y ya no sale)`)
            cambios++
        }
    }

    console.log(
        `\n${cambios} cambios respecto del snapshot. Si son los que buscabas:\n` +
        `  npx tsx bot-agente/pruebas/sweep-compatibilidad.ts --actualizar`
    )
    process.exitCode = 1
}

main()
    .catch((e) => {
        console.error(e)
        process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
