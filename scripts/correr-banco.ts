/**
 * Corre el banco de regresión del bot-agente desde la línea de comandos.
 *
 * Antes solo se podía correr desde `/admin/chatwoot/simulador` (pestaña "Banco
 * de pruebas"), así que cada evaluación de un modelo nuevo terminaba en un
 * script descartable escrito a mano. Esto lo hace repetible.
 *
 *   npx tsx scripts/correr-banco.ts
 *   npx tsx scripts/correr-banco.ts --modelo deepseek-v4-flash
 *   npx tsx scripts/correr-banco.ts --modelo gpt-5 --effort minimal
 *   npx tsx scripts/correr-banco.ts --caso caso-33-envio-ya-contestado-no-se-repite --repetir 4
 *
 * Sin `--modelo` usa el camino EXACTO de producción (proveedor de `chat_config`
 * + suplente). Con `--modelo` fuerza uno solo y SIN suplente, que es lo que hay
 * que usar para medir: si se cae y contesta el otro, la medición miente.
 *
 * `--repetir` existe porque el banco tiene varianza propia: hay casos que
 * fallan 1 de cada 3 corridas con CUALQUIER modelo. Antes de atribuirle una
 * falla a un modelo, repetir ese caso — es la diferencia entre una regresión
 * real y un flake. Ver `bot-agente/FILOSOFIA-Y-ROADMAP.md`.
 */
import { correrBancoPruebas } from "../bot-agente/pruebas/correr-banco"
import { OpcionesEjecucion } from "../bot-agente/motor"
import { obtenerConfiguracionAgente } from "../bot-agente/configuracion"

function arg(nombre: string): string | undefined {
    const i = process.argv.indexOf(`--${nombre}`)
    return i >= 0 ? process.argv[i + 1] : undefined
}

/** Base URL del proveedor dueño de ese modelo (los nombres son inconfundibles). */
function baseUrlDe(modelo: string): string {
    if (modelo.toLowerCase().includes("deepseek")) return "https://api.deepseek.com"
    return "https://api.openai.com/v1"
}

async function main() {
    const modelo = arg("modelo")
    const effort = arg("effort")
    const caso = arg("caso")
    const repetir = parseInt(arg("repetir") || "1", 10) || 1

    const opciones: OpcionesEjecucion = {}
    if (modelo) {
        opciones.modelo = modelo
        opciones.baseUrl = baseUrlDe(modelo)
    }
    if (effort) opciones.reasoningEffort = effort

    const cfg = await obtenerConfiguracionAgente()
    console.log(
        modelo
            ? `modelo forzado: ${modelo} (sin suplente) | effort: ${effort ?? (cfg.reasoningEffort || "(default del proveedor)")}`
            : `camino de produccion: ${cfg.proveedorActivo} | suplente: ${cfg.proveedorFallback || "(ninguno)"} | effort: ${effort ?? (cfg.reasoningEffort || "(default)")}`
    )

    const soloIds = caso ? [caso] : undefined
    const conteo = new Map<string, { ok: number; total: number }>()

    for (let vuelta = 1; vuelta <= repetir; vuelta++) {
        const t0 = Date.now()
        const rep = await correrBancoPruebas(opciones, soloIds)
        const seg = Math.round((Date.now() - t0) / 1000)

        console.log(`\n--- vuelta ${vuelta}/${repetir}: ${rep.pasados}/${rep.total} pasados (${seg}s) ---`)
        for (const r of rep.resultados) {
            const acc = conteo.get(r.id) || { ok: 0, total: 0 }
            acc.ok += r.ok ? 1 : 0
            acc.total += 1
            conteo.set(r.id, acc)

            if (!r.ok) {
                console.log(` FALLA ${r.id} — ${r.titulo}`)
                for (const f of r.fallos) console.log(`    · ${f}`)
                if (r.error) console.log(`    · ERROR DE API: ${r.error}`)
            }
        }
    }

    if (repetir > 1) {
        // Un caso que pasa a veces es un flake del banco, no una regresión del
        // modelo. Distinguirlos es lo que evita "arreglar" algo que no está roto.
        const inestables = [...conteo.entries()].filter(([, a]) => a.ok > 0 && a.ok < a.total)
        const siempreMal = [...conteo.entries()].filter(([, a]) => a.ok === 0)

        console.log(`\n=== ${repetir} vueltas ===`)
        if (siempreMal.length > 0) {
            console.log("FALLA SIEMPRE (regresion real, mirar):")
            for (const [id] of siempreMal) console.log(`  · ${id}`)
        }
        if (inestables.length > 0) {
            console.log("INESTABLE (flake del banco, no atribuir al modelo sin comparar contra otro):")
            for (const [id, a] of inestables) console.log(`  · ${id} — paso ${a.ok}/${a.total}`)
        }
        if (siempreMal.length === 0 && inestables.length === 0) console.log("Todo verde en todas las vueltas.")
    }
}

main().catch((e) => {
    console.error("FALLO:", e.message)
    process.exit(1)
})
