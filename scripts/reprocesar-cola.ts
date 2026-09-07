/**
 * Reprocesa TODA la cola `respuestas_pendientes` (lo que quedó encolado, sea de
 * n8n o del bot-agente fuera de horario) con el motor nuevo: reconstruye cada
 * conversación desde Chatwoot, genera la respuesta fresca con el contexto
 * completo, la manda (o escala en silencio), descarta las filas viejas y deja la
 * conversación en piloto.
 *
 *   npx tsx scripts/reprocesar-cola.ts            # solo si el local está abierto
 *   npx tsx scripts/reprocesar-cola.ts --forzar   # aunque esté cerrado
 *   npx tsx scripts/reprocesar-cola.ts --estado   # solo mostrar qué hay en cola
 *
 * Pensado para correr a la mañana cuando abre: las respuestas de la noche
 * (n8n) se reemplazan por las del sistema nuevo y salen escalonadas.
 */
import "dotenv/config"
import { reprocesarColaPendienteConBotAgente } from "@/lib/bot-agente-tiempo-real"
import { botDentroDeHorario } from "@/lib/chatwoot-bot"
import { prisma } from "@/lib/prisma"

async function main() {
    const args = process.argv.slice(2)

    const enCola = await prisma.$queryRaw<any[]>`
        SELECT conversation_id, left(contenido, 70) AS preview, origen, creado_en
        FROM respuestas_pendientes WHERE estado = 'pendiente' ORDER BY id`
    console.log(`\ncola pendiente: ${enCola.length}`)
    for (const f of enCola) console.log(`  conv ${f.conversation_id}  [${f.origen}]  ${JSON.stringify(f.preview)}`)

    if (args.includes("--estado")) {
        await prisma.$disconnect()
        return
    }

    if (enCola.length === 0) {
        console.log("nada que reprocesar.")
        await prisma.$disconnect()
        return
    }

    const abierto = await botDentroDeHorario().catch(() => false)
    if (!abierto && !args.includes("--forzar")) {
        console.log("\nEl local está CERRADO. Corré con --forzar si igual querés mandar ahora.")
        await prisma.$disconnect()
        return
    }

    console.log(`\nreprocesando ${enCola.length} conversaciones con el motor nuevo...\n`)
    const res = await reprocesarColaPendienteConBotAgente("script")
    for (const r of res) console.log(`  conv ${r.conversationId}  ${r.resultado.toUpperCase()}  ${r.detalle.slice(0, 100)}`)
    const enviados = res.filter((r) => r.resultado === "enviado").length
    console.log(`\n${enviados}/${res.length} enviados`)
    await prisma.$disconnect()
}

main().catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
})
