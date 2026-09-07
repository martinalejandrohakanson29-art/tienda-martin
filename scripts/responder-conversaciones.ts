/**
 * Responde en lote una lista de conversaciones de Chatwoot con el motor
 * bot-agente, como si fueran mensajes entrantes del piloto en vivo.
 *
 * Uso:
 *   npx tsx scripts/responder-conversaciones.ts 3506 3463 3504 ...
 *
 * Para cada conversación: reconstruye el historial real desde Chatwoot, saltea
 * si el último mensaje ya es saliente o si la ventana de 24hs de WhatsApp está
 * cerrada, genera la respuesta, respeta la demora de cadencia humana
 * (chat_config: respuesta_delay_*) y la envía (o escala en silencio). Cada turno
 * queda registrado en `bot_agente_turnos_reales`.
 *
 * Reemplaza al viejo scratch/catchup2.ts (que tenía la lista de ids hardcodeada).
 */
import "dotenv/config"
import { prisma } from "@/lib/prisma"
import { chatwootConfig, enviarImagenChatwoot, enviarMensajeChatwoot } from "@/lib/chatwoot-bot"
import { calcularEsperaCadenciaHumanaMs } from "@/lib/bot-agente-tiempo-real"
import { ejecutarTurnoAgente } from "@/bot-agente/motor"
import { escalarAHumano } from "@/bot-agente/herramientas/escalar-humano"
import { obtenerConfiguracionAgente } from "@/bot-agente/configuracion"
import { MensajeChat } from "@/bot-agente/tipos"

const ACCOUNT_ID = 1
const VENTANA_24HS_MARGEN_MS = 23 * 60 * 60 * 1000
const ESPERA_ENTRE_CONVERSACIONES_MS = 5000

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

type MensajeRaw = { contenido: string; privado: boolean; saliente: boolean; creadoEn: number }

async function traerTranscripcion(accountId: number, conversationId: number): Promise<MensajeRaw[]> {
    const { api, token } = chatwootConfig()
    const res = await fetch(`${api}/accounts/${accountId}/conversations/${conversationId}/messages`, {
        headers: { api_access_token: token },
        cache: "no-store",
    })
    if (!res.ok) throw new Error(`Chatwoot respondió ${res.status}`)
    const data = await res.json()
    const payload: any[] = Array.isArray(data?.payload) ? data.payload : []
    return payload
        .map((m) => {
            const saliente = m?.message_type === 1 || m?.message_type === "outgoing"
            const creado = typeof m?.created_at === "number" ? m.created_at * 1000 : Date.parse(m?.created_at ?? "")
            return {
                contenido: (m?.content || "").toString().trim(),
                privado: Boolean(m?.private),
                saliente,
                creadoEn: Number.isFinite(creado) ? creado : 0,
            }
        })
        .filter((m) => m.contenido.length > 0 && !m.privado)
        .sort((a, b) => a.creadoEn - b.creadoEn)
}

async function registrar(
    conversationId: number,
    mensajeCliente: string,
    respuesta: any,
    resultadoEnvio: string,
    detalle?: string
) {
    await prisma.$executeRaw`
        INSERT INTO bot_agente_turnos_reales
            (conversation_id, account_id, mensaje_cliente, respuesta_bot, foto_url, escalado_humano, motivo_escalado, herramientas, latencia_ms, resultado_envio, detalle_envio)
        VALUES (${conversationId}, ${ACCOUNT_ID}, ${mensajeCliente}, ${respuesta.mensajeFinal || null},
                ${respuesta.fotoUrl || null}, ${respuesta.escaladoHumano}, ${respuesta.motivoEscalado || null},
                ${JSON.stringify(respuesta.herramientasEjecutadas || [])}::jsonb, ${respuesta.latenciaMs || 0}, ${resultadoEnvio}, ${detalle || null})
    `.catch((e) => console.error("no se pudo registrar turno:", e.message))
}

async function main() {
    const ids = process.argv
        .slice(2)
        .map((a) => Number(a))
        .filter((n) => Number.isInteger(n) && n > 0)

    if (ids.length === 0) {
        console.error("Uso: npx tsx scripts/responder-conversaciones.ts <conversationId> [<conversationId> ...]")
        process.exit(1)
    }

    const config = await obtenerConfiguracionAgente().catch(() => null)
    let primera = true

    for (const conversationId of ids) {
        try {
            const transcripcion = await traerTranscripcion(ACCOUNT_ID, conversationId)
            if (transcripcion.length === 0) {
                console.log(`conv ${conversationId}: sin mensajes visibles, salteo`)
                continue
            }
            const ultimo = transcripcion[transcripcion.length - 1]
            if (ultimo.saliente) {
                console.log(`conv ${conversationId}: ya respondido, salteo`)
                continue
            }
            if (Date.now() - ultimo.creadoEn > VENTANA_24HS_MARGEN_MS) {
                console.log(`conv ${conversationId}: ventana 24hs cerrada, salteo`)
                continue
            }

            if (!primera) await dormir(ESPERA_ENTRE_CONVERSACIONES_MS)
            primera = false

            let cortIdx = transcripcion.length - 1
            while (cortIdx >= 0 && !transcripcion[cortIdx].saliente) cortIdx--
            const historialPrevio: MensajeChat[] = transcripcion.slice(0, cortIdx + 1).map((m) => ({
                rol: m.saliente ? "assistant" : "user",
                contenido: m.contenido,
            }))
            const mensajeUsuario = transcripcion
                .slice(cortIdx + 1)
                .map((m) => m.contenido)
                .join("\n")

            const inicio = Date.now()
            const respuesta = await ejecutarTurnoAgente(mensajeUsuario, historialPrevio, {
                conversationId,
                estadoKey: String(conversationId),
            })

            if (respuesta.escaladoHumano) {
                await escalarAHumano({
                    motivo: respuesta.motivoEscalado || "escalado_responder_lote",
                    resumen_consulta: `[responder-conversaciones] ${mensajeUsuario.slice(0, 300)}`,
                    conversation_id: conversationId,
                }).catch(() => {})
                await registrar(conversationId, mensajeUsuario, respuesta, "encolado", "Escalado a humano en silencio")
                console.log(`conv ${conversationId}: ESCALADO (${respuesta.motivoEscalado})`)
                continue
            }

            if (!respuesta.mensajeFinal) {
                console.log(`conv ${conversationId}: sin mensaje final ni escalado, salteo`)
                continue
            }

            // Misma demora deliberada que el piloto en vivo.
            if (config?.respuestaDelayActivo) {
                const esperaMs = calcularEsperaCadenciaHumanaMs(
                    config.respuestaDelayMinSeg,
                    config.respuestaDelayMaxSeg,
                    Date.now() - inicio
                )
                if (esperaMs > 0) await dormir(esperaMs)
            }

            // Re-chequeo: si contestó alguien durante la demora, no pisar.
            const post = await traerTranscripcion(ACCOUNT_ID, conversationId).catch(() => transcripcion)
            if (post.length > 0 && post[post.length - 1].saliente) {
                await registrar(conversationId, mensajeUsuario, respuesta, "salteado", "Respuesta más nueva en Chatwoot durante la demora")
                console.log(`conv ${conversationId}: SALTEADO (alguien contestó durante la demora)`)
                continue
            }

            await enviarMensajeChatwoot({ accountId: ACCOUNT_ID, conversationId, content: respuesta.mensajeFinal })
            if (respuesta.fotoUrl) {
                await enviarImagenChatwoot({ accountId: ACCOUNT_ID, conversationId, fotoUrl: respuesta.fotoUrl }).catch(() => {})
            }
            await registrar(conversationId, mensajeUsuario, respuesta, "enviado")
            console.log(`conv ${conversationId}: ENVIADO -> ${respuesta.mensajeFinal.slice(0, 100)}`)
        } catch (err: any) {
            console.error(`conv ${conversationId}: ERROR ${err.message}`)
        }
    }

    await prisma.$disconnect()
}

main().catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
})
