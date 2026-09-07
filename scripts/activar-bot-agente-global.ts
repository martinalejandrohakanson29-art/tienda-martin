/**
 * Pasa el bot de WhatsApp del sistema viejo (n8n) al nuevo (bot-agente) para
 * TODAS las conversaciones.
 *
 *   npx tsx scripts/activar-bot-agente-global.ts          # activar
 *   npx tsx scripts/activar-bot-agente-global.ts --off     # volver atrás (n8n)
 *   npx tsx scripts/activar-bot-agente-global.ts --estado  # solo mostrar estado
 *
 * Qué hace al activar:
 *  - chat_config.bot_agente_global = true  -> el webhook manda TODAS las
 *    conversaciones al motor nuevo (no solo las de bot_agente_piloto).
 *  - demora humana 50-70s (config respuesta_delay_*).
 *  - deja el horario automático PRENDIDO y reconcilia bot_estado: el bot-agente
 *    usa bot_horario para responder en vivo o diferir a la cola.
 *
 * OJO: hay que apagar el workflow de n8n ("Respuestas chatwoot 2.0") aparte,
 * si no responden los dos. Este script no toca n8n.
 */
import "dotenv/config"
import { guardarAjusteConfig, obtenerConfiguracionAgente } from "@/bot-agente/configuracion"
import { getEstadoBot, setHorarioAutomatico, botDentroDeHorario } from "@/lib/chatwoot-bot"
import { sincronizarEstadoBot } from "@/lib/chatwoot-cola"
import { prisma } from "@/lib/prisma"

async function mostrarEstado() {
    const [cfg, estado, abierto, pend] = await Promise.all([
        obtenerConfiguracionAgente(),
        getEstadoBot(),
        botDentroDeHorario(),
        prisma.$queryRaw<any[]>`SELECT count(*)::int n FROM respuestas_pendientes WHERE estado = 'pendiente'`,
    ])
    console.log("\n--- estado ---")
    console.log(`bot_agente_global : ${cfg.botAgenteGlobal}`)
    console.log(`demora            : ${cfg.respuestaDelayActivo ? `${cfg.respuestaDelayMinSeg}-${cfg.respuestaDelayMaxSeg}s` : "OFF"}`)
    console.log(`horario_automatico: ${estado.horarioAutomatico}   bot_estado.encendido: ${estado.encendido}`)
    console.log(`ahora el local    : ${abierto ? "ABIERTO (responde en vivo)" : "CERRADO (difiere a la cola)"}`)
    console.log(`cola pendiente    : ${pend[0].n}`)
}

async function main() {
    const args = process.argv.slice(2)

    if (args.includes("--estado")) {
        await mostrarEstado()
        await prisma.$disconnect()
        return
    }

    if (args.includes("--off")) {
        await guardarAjusteConfig("bot_agente_global", "false", "script")
        console.log("bot_agente_global = false — el bot-agente vuelve a responder solo las conversaciones de bot_agente_piloto.")
        console.log("Acordate de REACTIVAR el workflow de n8n si querés que vuelva a atender.")
        await mostrarEstado()
        await prisma.$disconnect()
        return
    }

    await guardarAjusteConfig("bot_agente_global", "true", "script")
    await guardarAjusteConfig("respuesta_delay_activo", "true", "script")
    await guardarAjusteConfig("respuesta_delay_min_seg", "50", "script")
    await guardarAjusteConfig("respuesta_delay_max_seg", "70", "script")
    await setHorarioAutomatico(true, "script")
    await sincronizarEstadoBot()

    console.log("bot_agente_global = true. El motor nuevo responde TODAS las conversaciones.")
    console.log("FALTA: apagar el workflow de n8n 'Respuestas chatwoot 2.0' para que no respondan los dos.")
    await mostrarEstado()
    await prisma.$disconnect()
}

main().catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
})
