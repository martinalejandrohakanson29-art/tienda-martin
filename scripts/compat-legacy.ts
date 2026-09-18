/**
 * Qué hacer con las compatibilidades viejas de la Base de Conocimiento.
 *
 * El problema: `compatibilidades` es la tabla de la época de n8n, y el motor la
 * sigue leyendo — entra al MISMO pozo que `chat_combo_compatibilidad` y
 * `chat_articulo_compatibilidad` (ver `bot-agente/herramientas/compatibilidad.ts`).
 * Pero ahí el kit se identifica por TEXTO LIBRE: hay filas con kit "combo",
 * "aumento de cilindrada" o "Balancines a rodillo", y varias sin `kit_id`. Como
 * el filtro del pozo matchea por nombre, un kit nuevo que comparta palabras o
 * números con esos textos puede heredar veredictos que nadie revisó desde n8n.
 *
 * Este script no decide por su cuenta. Muestra fila por fila a qué pack o grupo
 * actual resolvería cada una, si ya existe el mismo veredicto en las tablas
 * nuevas, y si la moto resuelve contra `motos_modelos`.
 *
 *   npx tsx scripts/compat-legacy.ts                 solo mira (default)
 *   npx tsx scripts/compat-legacy.ts --migrar --si   copia las que resuelven a un kit actual
 *   npx tsx scripts/compat-legacy.ts --purgar  --si  borra las ya migradas o duplicadas
 *   npx tsx scripts/compat-legacy.ts --descartar-huerfanas --si
 *                                                    borra las que no corresponden
 *                                                    a ningun kit actual
 *
 * Una fila se migra SOLO si su nombre de kit resuelve a exactamente un pack o
 * grupo del catálogo actual. Las ambiguas y las que no resuelven se listan para
 * decidirlas a mano: copiarlas a ciegas sería repetir el problema que tienen.
 *
 * Después de migrar, `chat_config.compat_legacy_migrada = 'si'` hace que el
 * motor deje de leer la tabla vieja. Ese flag es la única forma de apagarla sin
 * perder lo que todavía no se revisó.
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const APLICAR = process.argv.includes("--si")
const MIGRAR = process.argv.includes("--migrar")
const PURGAR = process.argv.includes("--purgar")
const DESCARTAR = process.argv.includes("--descartar-huerfanas")

function normalizar(t: string): string {
    return (t || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

function palabrasClave(t: string): Set<string> {
    return new Set(normalizar(t).split(" ").filter((w) => w.length >= 3 || /^\d+$/.test(w)))
}

/** Cuánto se parecen dos nombres de kit: proporción de palabras del legacy presentes en el actual. */
function parecido(legacy: string, actual: string): number {
    const a = palabrasClave(legacy)
    const b = palabrasClave(actual)
    if (a.size === 0) return 0
    let comunes = 0
    for (const w of a) if (b.has(w)) comunes++
    return comunes / a.size
}

interface Destino {
    tipo: "pack" | "grupo"
    id: number
    nombre: string
}

async function main() {
    const legacy = await prisma.$queryRaw<
        { id: number; kit: string | null; kit_id: number | null; modelo_moto: string | null; compatible: boolean | null; detalle: string | null }[]
    >`SELECT id, kit, kit_id, modelo_moto, compatible, detalle FROM compatibilidades ORDER BY kit, modelo_moto`

    const packs = await prisma.$queryRaw<{ id: number; nombre: string; grupo_id: number | null }[]>`
        SELECT id, nombre, grupo_id FROM chat_packs
    `
    const grupos = await prisma.$queryRaw<{ id: number; nombre: string }[]>`SELECT id, nombre FROM chat_pack_grupos`
    const yaCargadas = await prisma.$queryRaw<
        { grupo_id: number | null; kit_id: number | null; modelo_moto: string; compatible: boolean }[]
    >`SELECT grupo_id, kit_id, modelo_moto, compatible FROM chat_combo_compatibilidad`

    const existe = (d: Destino, moto: string) =>
        yaCargadas.some(
            (y) =>
                normalizar(y.modelo_moto) === normalizar(moto) &&
                (d.tipo === "grupo" ? Number(y.grupo_id) === d.id : Number(y.kit_id) === d.id)
        )

    /**
     * A qué kit actual corresponde el texto libre de la fila vieja.
     *
     * Se prefiere el GRUPO cuando el nombre cae en uno: la compatibilidad de un
     * combo con variantes vive a nivel de grupo (es la misma para el recorrido
     * corto y el largo), que es como la carga el panel de hoy.
     */
    function resolverDestino(kitTexto: string): { destino: Destino | null; ambiguos: Destino[] } {
        const candidatos: { d: Destino; score: number }[] = []
        for (const g of grupos) {
            // Un grupo se reconoce por su nombre Y por el de sus variantes: los
            // packs suelen conservar el nombre viejo cuando se renombra el grupo
            // (el grupo 1 se llama "Combo 110 a 120 + Codo y carburador" y sus
            // packs siguen siendo "Kit 120 para 110 …", que es como lo nombran
            // las 28 filas viejas).
            const nombres = [g.nombre, ...packs.filter((p) => Number(p.grupo_id) === Number(g.id)).map((p) => p.nombre)]
            const score = Math.max(...nombres.map((n) => parecido(kitTexto, n)))
            candidatos.push({ d: { tipo: "grupo", id: Number(g.id), nombre: g.nombre }, score })
        }
        for (const p of packs) {
            // Un pack de grupo se representa por su grupo.
            if (p.grupo_id != null) continue
            candidatos.push({ d: { tipo: "pack", id: Number(p.id), nombre: p.nombre }, score: parecido(kitTexto, p.nombre) })
        }
        const buenos = candidatos.filter((c) => c.score >= 0.6).sort((a, b) => b.score - a.score)
        if (buenos.length === 0) return { destino: null, ambiguos: [] }
        // Empate técnico = ambiguo: no se migra nada.
        if (buenos.length > 1 && buenos[1].score >= buenos[0].score - 0.01) {
            return { destino: null, ambiguos: buenos.map((b) => b.d) }
        }
        return { destino: buenos[0].d, ambiguos: [] }
    }

    const aMigrar: { fila: (typeof legacy)[0]; destino: Destino }[] = []
    const duplicadas: { fila: (typeof legacy)[0]; destino: Destino }[] = []
    const sinDestino: (typeof legacy)[0][] = []
    const ambiguas: { fila: (typeof legacy)[0]; opciones: Destino[] }[] = []

    for (const f of legacy) {
        if (!f.kit || !f.modelo_moto) {
            sinDestino.push(f)
            continue
        }
        const { destino, ambiguos } = resolverDestino(f.kit)
        if (!destino) {
            if (ambiguos.length > 0) ambiguas.push({ fila: f, opciones: ambiguos })
            else sinDestino.push(f)
            continue
        }
        if (existe(destino, f.modelo_moto)) duplicadas.push({ fila: f, destino })
        else aMigrar.push({ fila: f, destino })
    }

    console.log(`\nFilas legacy en \`compatibilidades\`: ${legacy.length}\n`)
    console.log(`  migrables a un kit actual : ${aMigrar.length}`)
    console.log(`  ya cargadas en el catálogo: ${duplicadas.length}`)
    console.log(`  kit ambiguo               : ${ambiguas.length}`)
    console.log(`  sin kit reconocible       : ${sinDestino.length}\n`)

    const porDestino = new Map<string, number>()
    for (const m of aMigrar) {
        const k = `${m.destino.tipo} ${m.destino.id} — ${m.destino.nombre}`
        porDestino.set(k, (porDestino.get(k) || 0) + 1)
    }
    if (porDestino.size > 0) {
        console.log("A migrar, por destino:")
        for (const [k, n] of porDestino) console.log(`  ${n.toString().padStart(3)}  ${k}`)
        console.log()
    }

    if (ambiguas.length > 0) {
        console.log("Ambiguas (se quedan como están, hay que decidirlas a mano):")
        for (const a of ambiguas.slice(0, 20)) {
            console.log(`  "${a.fila.kit}" / ${a.fila.modelo_moto} → ${a.opciones.map((o) => o.nombre).join(" | ")}`)
        }
        if (ambiguas.length > 20) console.log(`  … y ${ambiguas.length - 20} más`)
        console.log()
    }

    if (sinDestino.length > 0) {
        console.log("Sin kit reconocible (candidatas a descartar):")
        const kits = new Map<string, number>()
        for (const f of sinDestino) kits.set(f.kit || "(sin kit)", (kits.get(f.kit || "(sin kit)") || 0) + 1)
        for (const [k, n] of kits) console.log(`  ${n.toString().padStart(3)}  ${k}`)
        console.log()
    }

    // Cualquier escritura vuelca antes la tabla entera a un archivo. Son
    // veredictos técnicos que costaron conversaciones reales: si mañana hace
    // falta uno que se descartó, tiene que poder recuperarse sin un restore.
    if (APLICAR && (MIGRAR || PURGAR || DESCARTAR)) {
        const fs = await import("fs")
        const path = await import("path")
        const dir = path.join(process.cwd(), "scratch")
        fs.mkdirSync(dir, { recursive: true })
        const archivo = path.join(dir, `compat-legacy-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`)
        fs.writeFileSync(archivo, JSON.stringify(legacy, null, 2), "utf-8")
        console.log(`Backup de las ${legacy.length} filas: ${archivo}\n`)
    }

    if (MIGRAR) {
        if (!APLICAR) {
            console.log("Simulacro. Agregá --si para escribir en la base.\n")
        } else {
            let n = 0
            for (const { fila, destino } of aMigrar) {
                const detalle = fila.detalle?.trim() || null
                if (destino.tipo === "grupo") {
                    await prisma.$executeRawUnsafe(
                        `INSERT INTO chat_combo_compatibilidad (grupo_id, modelo_moto, compatible, detalle) VALUES ($1,$2,$3,$4)`,
                        destino.id,
                        fila.modelo_moto,
                        Boolean(fila.compatible),
                        detalle
                    )
                } else {
                    await prisma.$executeRawUnsafe(
                        `INSERT INTO chat_combo_compatibilidad (kit_id, modelo_moto, compatible, detalle) VALUES ($1,$2,$3,$4)`,
                        destino.id,
                        fila.modelo_moto,
                        Boolean(fila.compatible),
                        detalle
                    )
                }
                n++
            }
            console.log(`Migradas ${n} filas a chat_combo_compatibilidad.`)

        }
    }

    if (PURGAR) {
        const ids = duplicadas.map((d) => d.fila.id)
        if (ids.length === 0) {
            console.log("No hay filas duplicadas para borrar.")
        } else if (!APLICAR) {
            console.log(`Simulacro: se borrarían ${ids.length} filas ya presentes en el catálogo nuevo. Agregá --si.`)
        } else {
            await prisma.$executeRawUnsafe(`DELETE FROM compatibilidades WHERE id = ANY($1::int[])`, ids)
            console.log(`Borradas ${ids.length} filas duplicadas de compatibilidades.`)
        }
    }

    if (DESCARTAR) {
        const ids = [...sinDestino.map((f) => f.id), ...ambiguas.map((a) => a.fila.id)]
        if (ids.length === 0) {
            console.log("No hay filas huérfanas.")
        } else if (!APLICAR) {
            console.log(`Simulacro: se borrarían ${ids.length} filas sin kit reconocible o ambiguas. Agregá --si.`)
        } else {
            await prisma.$executeRawUnsafe(`DELETE FROM compatibilidades WHERE id = ANY($1::int[])`, ids)
            console.log(`Borradas ${ids.length} filas huérfanas.`)
        }
    }

    // El apagado del pozo viejo se decide por lo que QUEDA en la tabla, no por
    // lo que hizo esta corrida: mientras haya una fila sin migrar, el motor la
    // tiene que seguir leyendo o se pierde un veredicto.
    if (APLICAR && (MIGRAR || PURGAR || DESCARTAR)) {
        const [{ n }] = await prisma.$queryRawUnsafe<{ n: number }[]>(
            `SELECT COUNT(*)::int AS n FROM compatibilidades`
        )
        if (n === 0) {
            await prisma.$executeRawUnsafe(
                `INSERT INTO chat_config (clave, valor, actualizado_en, actualizado_por)
                 VALUES ('compat_legacy_migrada', 'si', NOW(), 'compat-legacy.ts')
                 ON CONFLICT (clave) DO UPDATE SET valor = 'si', actualizado_en = NOW(), actualizado_por = 'compat-legacy.ts'`
            )
            console.log("\nTabla vieja vacía → chat_config.compat_legacy_migrada = si: el motor deja de leerla.")
        } else {
            console.log(`\nQuedan ${n} filas en la tabla vieja: el motor la sigue leyendo.`)
        }
    }

    if (!MIGRAR && !PURGAR && !DESCARTAR) {
        console.log("Solo lectura. Opciones: --migrar --si  |  --purgar --si\n")
    }

    await prisma.$disconnect()
}

main().catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
})
