/**
 * Limpieza de datos: filas de compatibilidad donde la aclaración quedó pegada
 * dentro de `modelo_moto` en vez de ir a `detalle`.
 *
 * Causa: `parsearListaCompat` (lib/compatibilidad-texto.ts) no toleraba una
 * aclaración con paréntesis anidados ("(alesar los cárteres)") ni saltos de
 * línea como separador -> guardaba todo el pegote como nombre de modelo, y
 * `rm_modelo_ok` nunca lo matcheaba. Efecto real (2026-08-28, conv 2882): el
 * bot confirmó una Honda Wave como compatible con el Kit 120 porque la regla
 * "wave = NO compatible" era inalcanzable.
 *
 * Este script re-parsea esas filas (misma lógica que el parser ya arreglado) y
 * las reescribe: modelo limpio + detalle. Filas con 2 modelos pegados por
 * salto de línea se abren en 2 filas.
 *
 *   node fix-compatibilidad-modelo-detalle-pegado_2026-08-28.mjs          (dry-run)
 *   node fix-compatibilidad-modelo-detalle-pegado_2026-08-28.mjs --apply  (ejecuta)
 */
import "dotenv/config"
import pg from "pg"

const APPLY = process.argv.includes("--apply")

function separarModeloDetalle(item) {
    if (!item.endsWith(")")) return { modelo: item, detalle: "" }
    let prof = 0
    for (let i = item.length - 1; i >= 0; i--) {
        const ch = item[i]
        if (ch === ")") prof++
        else if (ch === "(") {
            prof--
            if (prof === 0) {
                const modelo = item.slice(0, i).trim()
                const detalle = item.slice(i + 1, item.length - 1).trim()
                if (!modelo) return { modelo: item, detalle: "" }
                return { modelo, detalle }
            }
        }
    }
    return { modelo: item, detalle: "" }
}

function parsear(texto) {
    const items = []
    let prof = 0
    let actual = ""
    for (const ch of texto) {
        if (ch === "(") prof++
        else if (ch === ")") prof = Math.max(0, prof - 1)
        if ((ch === "," || ch === "\n" || ch === "\r") && prof === 0) {
            items.push(actual)
            actual = ""
        } else {
            actual += ch
        }
    }
    if (actual.trim()) items.push(actual)
    return items.map((r) => separarModeloDetalle(r.trim())).filter((x) => x.modelo.length > 0)
}

const TABLAS = [
    { tabla: "chat_combo_compatibilidad", fkCols: ["grupo_id", "kit_id"] },
    { tabla: "chat_articulo_compatibilidad", fkCols: ["articulo_id"] },
]

const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()

for (const { tabla, fkCols } of TABLAS) {
    const { rows } = await c.query(
        `SELECT * FROM ${tabla}
         WHERE modelo_moto LIKE '%(%' OR modelo_moto LIKE E'%\\n%' OR modelo_moto LIKE E'%\\r%'
         ORDER BY id`
    )
    console.log(`\n=== ${tabla}: ${rows.length} fila(s) a revisar ===`)

    for (const row of rows) {
        const parsed = parsear(row.modelo_moto)
        // Si el parser no cambia nada útil, no tocar.
        const sinCambio =
            parsed.length === 1 && parsed[0].modelo === row.modelo_moto && parsed[0].detalle === ""
        if (sinCambio) {
            console.log(`  id ${row.id}: sin cambios`)
            continue
        }

        console.log(`  id ${row.id} (compatible=${row.compatible})`)
        console.log(`    ANTES  modelo_moto=${JSON.stringify(row.modelo_moto)} detalle=${JSON.stringify(row.detalle)}`)
        for (const p of parsed) console.log(`    NUEVA  modelo=${JSON.stringify(p.modelo)} detalle=${JSON.stringify(p.detalle)}`)

        if (!APPLY) continue

        await c.query("BEGIN")
        try {
            await c.query(`DELETE FROM ${tabla} WHERE id = $1`, [row.id])
            for (const p of parsed) {
                const cols = [...fkCols, "modelo_moto", "compatible", "detalle"]
                const vals = [...fkCols.map((k) => row[k]), p.modelo, row.compatible, p.detalle || null]
                // Evitar duplicar una fila idéntica ya existente.
                const dupCond = fkCols
                    .map((k, i) => `${k} IS NOT DISTINCT FROM $${i + 1}`)
                    .join(" AND ")
                const { rows: dup } = await c.query(
                    `SELECT 1 FROM ${tabla}
                     WHERE ${dupCond}
                       AND lower(modelo_moto) = lower($${fkCols.length + 1})
                       AND compatible = $${fkCols.length + 2}`,
                    [...fkCols.map((k) => row[k]), p.modelo, row.compatible]
                )
                if (dup.length) {
                    console.log(`      (ya existía ${JSON.stringify(p.modelo)}, se omite)`)
                    continue
                }
                const ph = cols.map((_, i) => `$${i + 1}`).join(", ")
                await c.query(`INSERT INTO ${tabla} (${cols.join(", ")}) VALUES (${ph})`, vals)
            }
            await c.query("COMMIT")
            console.log(`    -> OK`)
        } catch (e) {
            await c.query("ROLLBACK")
            console.error(`    -> ERROR, rollback:`, e.message)
        }
    }
}

await c.end()
console.log(APPLY ? "\nListo (aplicado)." : "\nDry-run. Correr con --apply para ejecutar.")
