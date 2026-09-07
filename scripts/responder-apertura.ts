/**
 * Dispara a mano la pasada de APERTURA del bot-agente: responde UNA sola vez
 * cada conversación de `bot_agente_pendiente_apertura` (las que escribieron con
 * el local cerrado), reconstruyendo el hilo completo desde Chatwoot.
 *
 * Normalmente se dispara solo (webhook con cada mensaje entrante, y al abrir el
 * local vía `sincronizarEstadoBot`). Este script es la válvula de seguridad
 * para correrla manualmente.
 *
 * Uso:
 *   npx tsx scripts/responder-apertura.ts            # solo si el local está abierto
 *   npx tsx scripts/responder-apertura.ts --forzar   # saltea el gate de horario
 *   npx tsx scripts/responder-apertura.ts --estado   # lista la cola sin responder
 */
import "dotenv/config"
import { prisma } from "@/lib/prisma"
import { responderPendientesDeAperturaBotAgente } from "@/lib/bot-agente-tiempo-real"

async function main() {
    const args = process.argv.slice(2)
    const forzar = args.includes("--forzar")
    const soloEstado = args.includes("--estado")

    const filas = await prisma.$queryRaw<
        { conversation_id: bigint; account_id: bigint; primer_mensaje_en: Date; ultimo_mensaje_en: Date; intentos: number }[]
    >`
        SELECT conversation_id, account_id, primer_mensaje_en, ultimo_mensaje_en, intentos
        FROM bot_agente_pendiente_apertura
        ORDER BY primer_mensaje_en ASC
    `

    console.log(`Cola de apertura: ${filas.length} conversación(es)`)
    for (const f of filas) {
        console.log(
            `  conv ${f.conversation_id}  desde ${f.primer_mensaje_en.toISOString()}  ` +
                `último ${f.ultimo_mensaje_en.toISOString()}  intentos ${f.intentos}`
        )
    }

    if (soloEstado || filas.length === 0) {
        await prisma.$disconnect()
        return
    }

    console.log(`\nRespondiendo${forzar ? " (--forzar: sin gate de horario)" : ""}...`)
    await responderPendientesDeAperturaBotAgente({ forzar })
    console.log("Listo.")
    await prisma.$disconnect()
}

main().catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
})
