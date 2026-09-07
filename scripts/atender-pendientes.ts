/**
 * Dispara a mano el BARRIDO de entrantes pendientes del bot-agente: responde
 * UNA sola vez cada conversación de `bot_agente_entrantes_pendientes` cuyo
 * mensaje del cliente quedó sin responder (local cerrado, o turno que murió en
 * un deploy/crash), reconstruyendo el hilo completo desde Chatwoot.
 *
 * Normalmente se dispara solo (webhook, apertura del local, setInterval cada
 * 3 min). Este script es la válvula de seguridad manual.
 *
 * Uso:
 *   npx tsx scripts/atender-pendientes.ts            # solo si el local está abierto
 *   npx tsx scripts/atender-pendientes.ts --forzar   # saltea el gate de horario y el grace de 4 min
 *   npx tsx scripts/atender-pendientes.ts --estado   # lista la cola sin responder
 */
import "dotenv/config"
import { prisma } from "@/lib/prisma"
import { atenderEntrantesPendientes } from "@/lib/bot-agente-tiempo-real"

async function main() {
    const args = process.argv.slice(2)
    const forzar = args.includes("--forzar")
    const soloEstado = args.includes("--estado")

    const filas = await prisma.$queryRaw<
        { conversation_id: bigint; account_id: bigint; primer_mensaje_en: Date; ultimo_mensaje_en: Date; intentos: number }[]
    >`
        SELECT conversation_id, account_id, primer_mensaje_en, ultimo_mensaje_en, intentos
        FROM bot_agente_entrantes_pendientes
        ORDER BY primer_mensaje_en ASC
    `

    console.log(`Entrantes pendientes: ${filas.length} conversación(es)`)
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

    console.log(`\nAtendiendo${forzar ? " (--forzar: sin gate de horario ni grace)" : ""}...`)
    await atenderEntrantesPendientes({ forzar })
    console.log("Listo.")
    await prisma.$disconnect()
}

main().catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
})
