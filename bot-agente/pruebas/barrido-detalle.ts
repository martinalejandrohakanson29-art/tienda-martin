/**
 * BARRIDO DEL MOTIVO (el `detalle` que el bot le repite al cliente).
 *
 *   npx tsx bot-agente/pruebas/barrido-detalle.ts
 *
 * El hermano de `sweep-compatibilidad.ts`, mirando la otra mitad de la respuesta.
 * El sweep compara VEREDICTOS (SI / NO / esc) y por eso no ve una clase entera de
 * error: el veredicto correcto acompañado del motivo de otro producto. Así se
 * escapó el del 10/09 — a una Gilera Smash le salía "CONFIRMADO el Kit 120 para
 * 110. Es la tapa completa, lista para instalar. Cuesta $129.999": el precio de
 * otro combo, prestado por `respaldoDetalle` desde una fila que no era del kit
 * preguntado.
 *
 * No tiene snapshot a propósito: los motivos son texto libre que el equipo edita
 * seguido, y un snapshot así daría falsos positivos todo el tiempo. Se usa de a
 * mano, para leer: corrés, guardás la salida, tocás el matching o las filas, y
 * comparás con `diff`. Lo que hay que buscar en el diff son motivos que nombren
 * una pieza, un precio o una moto que no son los de la fila.
 */
import { prisma } from "@/lib/prisma"
import { consultarCompatibilidad } from "../herramientas/compatibilidad"

/** Grafías que en su momento trajeron un motivo ajeno, además del catálogo. */
const GRAFIAS_EXTRA = ["Gilera Smash 110", "smash tuning", "blitz", "guerrero gp2"]

async function main() {
    const grupos = await prisma.$queryRaw<{ nombre: string }[]>`
        SELECT nombre FROM chat_pack_grupos WHERE activo = true ORDER BY id
    `
    const packsSueltos = await prisma.$queryRaw<{ nombre: string }[]>`
        SELECT nombre FROM chat_packs WHERE activo = true AND grupo_id IS NULL ORDER BY id
    `
    const motos = await prisma.$queryRaw<{ nombre_completo: string }[]>`
        SELECT nombre_completo FROM motos_modelos ORDER BY marca, modelo
    `
    const kits = [...grupos.map((g) => g.nombre), ...packsSueltos.map((p) => p.nombre)]

    for (const moto of [...motos.map((m) => m.nombre_completo), ...GRAFIAS_EXTRA]) {
        for (const kit of kits) {
            const r = await consultarCompatibilidad({ modelo_moto: moto, kit_nombre_o_id: kit })
            if (!r.encontrado) continue
            const veredicto = r.compatible === true ? "SI" : r.compatible === false ? "NO" : "?"
            const motivo = (r.detalle || "").trim().replace(/\s+/g, " ")
            console.log(`${moto} | ${kit} | ${veredicto} | ${motivo || "(sin motivo)"}`)
        }
    }
}

main()
    .catch((e) => {
        console.error(e)
        process.exitCode = 1
    })
    .finally(() => process.exit())
