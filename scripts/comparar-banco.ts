/**
 * Compara dos reportes de `correr-banco-modelo.ts` caso por caso.
 *
 *   npx tsx scripts/correr-banco.ts --modelo deepseek-flash --salida scratch/a.json
 *   npx tsx scripts/correr-banco.ts --modelo gpt-5         --salida scratch/b.json
 *   npx tsx scripts/comparar-banco.ts scratch/a.json scratch/b.json
 *
 * Separa a propósito dos cosas que el puntaje suelto mezcla:
 *   - las DIFERENCIAS entre los dos modelos (lo que se está evaluando), y
 *   - las fallas COMUNES, que son agujeros nuestros de prompt o de datos y no
 *     tienen nada que ver con el modelo que se elija.
 *
 * Una diferencia sola no prueba nada: repetila con `repetir-casos.ts` antes de
 * darla por buena. El 10/09, la única diferencia entre V4 y V4.1 Flash resultó
 * ser un caso flaky, no una mejora.
 */
import fs from "fs"
import type { ReporteBanco, ResultadoCaso } from "../bot-agente/pruebas/correr-banco"

const [rutaA, rutaB] = process.argv.slice(2)
if (!rutaA || !rutaB) {
    console.error("Uso: npx tsx scripts/comparar-banco.ts <a.json> <b.json>   (los json los deja correr-banco.ts --salida)")
    process.exit(1)
}

const leer = (ruta: string) => JSON.parse(fs.readFileSync(ruta, "utf8")) as ReporteBanco & { prom?: number; p50?: number; segundos?: number; modelo?: string; thinking?: string }
const A = leer(rutaA)
const B = leer(rutaB)
const porId = (r: ReporteBanco) => new Map<string, ResultadoCaso>(r.resultados.map((c) => [c.id, c]))
const ma = porId(A)
const mb = porId(B)

const linea = (r: typeof A) =>
    `${r.modelo}${r.thinking ? ` thinking=${r.thinking}` : ""}: ${r.pasados}/${r.total} OK | ${r.segundos}s | prom ${r.prom}ms | p50 ${r.p50}ms`
console.log(`A = ${linea(A)}`)
console.log(`B = ${linea(B)}`)

console.log("\n--- diferencias entre los dos ---")
let dif = 0
for (const [id, ca] of ma) {
    const cb = mb.get(id)
    if (!cb || ca.ok === cb.ok) continue
    dif++
    console.log(`${id}: A=${ca.ok ? "OK" : "FALLA"} B=${cb.ok ? "OK" : "FALLA"}`)
    console.log(`   ${((ca.ok ? cb : ca).fallos || []).join(" | ")}`)
}
if (!dif) console.log("(ninguna: los dos pasan y fallan los mismos casos)")

console.log("\n--- fallas comunes (agujeros nuestros, no del modelo) ---")
let comunes = 0
for (const [id, ca] of ma) {
    const cb = mb.get(id)
    if (ca.ok || !cb || cb.ok) continue
    comunes++
    console.log(`${id}: ${(ca.fallos || []).join(" | ")}`)
}
if (!comunes) console.log("(ninguna)")
