/**
 * Duplicados exactos en las tablas de compatibilidad.
 *
 * No rompen un veredicto, pero pesan doble en el pozo y —lo peor— esconden
 * ediciones: se corrige una fila desde el panel y la copia vieja sigue ahí
 * diciendo lo contrario de lo que se acaba de cargar.
 *
 *   npx tsx scripts/compat-dedup.ts          solo mira (default)
 *   npx tsx scripts/compat-dedup.ts --si     borra las copias y deja una
 *   npx tsx scripts/compat-dedup.ts --si --indice   además crea el índice único
 *
 * Se conserva SIEMPRE la fila de id más bajo (la original) y, entre copias, la
 * que tenga aclaración cargada: el detalle es trabajo humano, el duplicado no.
 *
 * El índice único es opcional a propósito: lo deja imposible de repetir, pero
 * hace fallar cualquier carga futura que intente insertar la misma moto dos
 * veces para el mismo producto. Conviene crearlo DESPUÉS de haber limpiado.
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const APLICAR = process.argv.includes("--si")
const CON_INDICE = process.argv.includes("--indice")

function normalizar(t: string): string {
    return (t || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
}

interface Fila {
    id: number
    modelo_moto: string
    compatible: boolean
    detalle: string | null
    dueno: string
}

async function duplicadosDe(tabla: "chat_articulo_compatibilidad" | "chat_combo_compatibilidad"): Promise<number[]> {
    const filas =
        tabla === "chat_articulo_compatibilidad"
            ? await prisma.$queryRaw<Fila[]>`
                  SELECT id, modelo_moto, compatible, detalle, ('art:' || articulo_id) AS dueno
                  FROM chat_articulo_compatibilidad ORDER BY id
              `
            : await prisma.$queryRaw<Fila[]>`
                  SELECT id, modelo_moto, compatible, detalle,
                         ('combo:' || COALESCE(grupo_id::text, '') || ':' || COALESCE(kit_id::text, '')) AS dueno
                  FROM chat_combo_compatibilidad ORDER BY id
              `

    const grupos = new Map<string, Fila[]>()
    for (const f of filas) {
        const k = `${f.dueno}::${normalizar(f.modelo_moto)}::${f.compatible}`
        grupos.set(k, [...(grupos.get(k) || []), f])
    }

    const aBorrar: number[] = []
    for (const [, copias] of grupos) {
        if (copias.length < 2) continue
        // Se queda la que tiene aclaración; si empatan, la de id más bajo.
        const ordenadas = [...copias].sort((a, b) => {
            const pa = a.detalle && a.detalle.trim() ? 0 : 1
            const pb = b.detalle && b.detalle.trim() ? 0 : 1
            return pa - pb || a.id - b.id
        })
        const [, ...resto] = ordenadas
        console.log(`  ${copias[0].modelo_moto} (${copias[0].dueno}) — ${copias.length} copias, se borran ${resto.length}`)
        aBorrar.push(...resto.map((r) => r.id))
    }
    return aBorrar
}

async function main() {
    console.log("\nDuplicados exactos de compatibilidad\n")

    console.log("chat_articulo_compatibilidad:")
    const art = await duplicadosDe("chat_articulo_compatibilidad")
    if (art.length === 0) console.log("  (ninguno)")

    console.log("\nchat_combo_compatibilidad:")
    const combo = await duplicadosDe("chat_combo_compatibilidad")
    if (combo.length === 0) console.log("  (ninguno)")

    console.log(`\nTotal a borrar: ${art.length + combo.length}`)

    if (!APLICAR) {
        console.log("Simulacro. Agregá --si para borrarlas.\n")
        await prisma.$disconnect()
        return
    }

    if (art.length > 0) {
        await prisma.$executeRawUnsafe(`DELETE FROM chat_articulo_compatibilidad WHERE id = ANY($1::int[])`, art)
    }
    if (combo.length > 0) {
        await prisma.$executeRawUnsafe(`DELETE FROM chat_combo_compatibilidad WHERE id = ANY($1::int[])`, combo)
    }
    console.log("Borradas.")

    if (CON_INDICE) {
        await prisma.$executeRawUnsafe(`
            CREATE UNIQUE INDEX IF NOT EXISTS ux_chat_articulo_compat
            ON chat_articulo_compatibilidad (articulo_id, lower(modelo_moto), compatible)
        `)
        await prisma.$executeRawUnsafe(`
            CREATE UNIQUE INDEX IF NOT EXISTS ux_chat_combo_compat
            ON chat_combo_compatibilidad (COALESCE(grupo_id, 0), COALESCE(kit_id, 0), lower(modelo_moto), compatible)
        `)
        console.log("Índices únicos creados: la misma moto no se puede repetir para el mismo producto.")
    }

    await prisma.$disconnect()
}

main().catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
})
