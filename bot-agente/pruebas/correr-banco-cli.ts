/**
 * Runner de consola del banco de pruebas.
 *
 * El banco ya se corría desde /admin/chatwoot/simulador ("Banco de pruebas"),
 * pero para verificar un fix desde la terminal no había con qué. Esto es eso:
 *
 *   # el banco entero (pega contra el modelo real, tarda)
 *   npx tsx bot-agente/pruebas/correr-banco-cli.ts
 *
 *   # solo los casos que te interesan (uno o varios ids)
 *   npx tsx bot-agente/pruebas/correr-banco-cli.ts caso-77-ficha-antes-de-derivar-la-tapa
 *
 * OJO: cada caso es una llamada real a la API del modelo y el modelo NO es
 * determinístico. Un caso que falla una vez no es necesariamente una
 * regresión: correlo 3 veces antes de sacar conclusiones.
 */
import { correrBancoPruebas } from "./correr-banco"

async function main() {
    const ids = process.argv.slice(2)
    const reporte = await correrBancoPruebas({}, ids.length > 0 ? ids : undefined)

    for (const r of reporte.resultados) {
        console.log("=".repeat(72))
        console.log(`${r.ok ? "OK   " : "FALLA"}  ${r.id} — ${r.titulo}`)
        if (r.error) console.log("  ERROR:", r.error)
        for (const f of r.fallos) console.log("  ✗", f)
        console.log("  tools:", r.observado.herramientas.join(", ") || "ninguna")
        console.log(`  escalado: ${r.observado.escaladoHumano}${r.observado.motivoEscalado ? ` (${r.observado.motivoEscalado})` : ""}`)
        console.log("  respuesta:")
        console.log(
            String(r.observado.mensajeFinal ?? "(silencio)")
                .split("\n")
                .map((l) => "    | " + l)
                .join("\n")
        )
    }

    console.log("=".repeat(72))
    console.log(`${reporte.pasados}/${reporte.total} OK`)
    process.exit(reporte.fallados === 0 ? 0 : 1)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
