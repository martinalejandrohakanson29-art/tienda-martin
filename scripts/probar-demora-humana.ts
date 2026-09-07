/**
 * Chequeo de la demora de cadencia humana del piloto en vivo.
 *
 *   npx tsx scripts/probar-demora-humana.ts
 *
 * 1. Verifica el cálculo puro `calcularEsperaCadenciaHumanaMs` (determinista).
 * 2. Muestra la config efectiva de `chat_config` (respuesta_delay_*).
 * 3. Opcional DRY-RUN de punta a punta: con `--conv <id>` reconstruye el
 *    historial real de esa conversación, corre el motor y aplica la demora
 *    real, midiendo el wall-clock total. NO envía nada a Chatwoot (read-only):
 *    sirve para confirmar que la demora envuelve bien la latencia del turno.
 */
import "dotenv/config"
import { calcularEsperaCadenciaHumanaMs } from "@/lib/bot-agente-tiempo-real"
import { obtenerConfiguracionAgente } from "@/bot-agente/configuracion"
import { chatwootConfig } from "@/lib/chatwoot-bot"
import { ejecutarTurnoAgente } from "@/bot-agente/motor"
import { MensajeChat } from "@/bot-agente/tipos"
import { prisma } from "@/lib/prisma"

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Caso = { min: number; max: number; transcurrido: number; rnd: number; esperado: number }

const CASOS: Caso[] = [
    // objetivo = min + rnd*(max-min); restante = clamp(objetivo - transcurrido, 0, max)
    { min: 45, max: 75, transcurrido: 0, rnd: 0, esperado: 45_000 },
    { min: 45, max: 75, transcurrido: 0, rnd: 1, esperado: 75_000 },
    { min: 45, max: 75, transcurrido: 0, rnd: 0.5, esperado: 60_000 },
    { min: 45, max: 75, transcurrido: 30_000, rnd: 0.5, esperado: 30_000 }, // 60s objetivo - 30s ya gastados
    { min: 45, max: 75, transcurrido: 80_000, rnd: 0.5, esperado: 0 }, // tardó más que el objetivo -> no espera
    { min: 45, max: 75, transcurrido: -5_000, rnd: 0, esperado: 45_000 }, // transcurrido negativo se trata como 0
    { min: 45, max: 75, transcurrido: 200_000, rnd: 1, esperado: 0 }, // nunca negativo
    { min: 60, max: 40, transcurrido: 0, rnd: 0.5, esperado: 60_000 }, // max<min -> se corrige a min
    { min: 0, max: 0, transcurrido: 0, rnd: 0.5, esperado: 0 }, // sin ventana -> sin espera
    { min: 45, max: 75, transcurrido: 10_000, rnd: 0.25, esperado: 42_500 }, // objetivo 52.5s - 10s
]

async function main() {
    let fallos = 0
    for (const c of CASOS) {
        const got = calcularEsperaCadenciaHumanaMs(c.min, c.max, c.transcurrido, c.rnd)
        const ok = got === c.esperado
        if (!ok) fallos++
        console.log(
            `${ok ? "ok  " : "FALLO"} min=${c.min} max=${c.max} transc=${c.transcurrido} rnd=${c.rnd}  -> ${got}ms (esperado ${c.esperado}ms)`
        )
    }

    // invariante: nunca fuera de [0, max*1000] para 500 combinaciones aleatorias
    for (let i = 0; i < 500; i++) {
        const min = Math.random() * 120
        const max = min + Math.random() * 120
        const transc = Math.random() * 200_000 - 20_000
        const got = calcularEsperaCadenciaHumanaMs(min, max, transc)
        if (got < 0 || got > Math.max(min, max) * 1000 + 1) {
            console.log(`FALLO invariante: min=${min} max=${max} transc=${transc} -> ${got}`)
            fallos++
        }
    }
    console.log(fallos === 0 ? "\n✅ cálculo puro OK (10 casos + 500 invariantes)" : `\n❌ ${fallos} fallos`)

    const config = await obtenerConfiguracionAgente().catch(() => null)
    console.log(
        `\nConfig efectiva: activo=${config?.respuestaDelayActivo} ventana=${config?.respuestaDelayMinSeg}-${config?.respuestaDelayMaxSeg}s`
    )

    const convFlag = process.argv.indexOf("--conv")
    if (convFlag >= 0) {
        const convId = Number(process.argv[convFlag + 1])
        if (!Number.isInteger(convId) || convId <= 0) {
            console.error("--conv necesita un conversationId válido")
            process.exit(1)
        }

        // Read-only: traer transcripción real, NO enviar nada.
        const { api, token } = chatwootConfig()
        const res = await fetch(`${api}/accounts/1/conversations/${convId}/messages`, {
            headers: { api_access_token: token },
            cache: "no-store",
        })
        const data = await res.json()
        const msgs = (Array.isArray(data?.payload) ? data.payload : [])
            .map((m: any) => ({
                contenido: (m?.content || "").toString().trim(),
                privado: Boolean(m?.private),
                saliente: m?.message_type === 1 || m?.message_type === "outgoing",
                creadoEn: typeof m?.created_at === "number" ? m.created_at * 1000 : Date.parse(m?.created_at ?? ""),
            }))
            .filter((m: any) => m.contenido && !m.privado)
            .sort((a: any, b: any) => a.creadoEn - b.creadoEn)

        let cortIdx = msgs.length - 1
        while (cortIdx >= 0 && !msgs[cortIdx].saliente) cortIdx--
        const historialPrevio: MensajeChat[] = msgs.slice(0, cortIdx + 1).map((m: any) => ({
            rol: m.saliente ? "assistant" : "user",
            contenido: m.contenido,
        }))
        const probeFlag = process.argv.indexOf("--probe")
        const probe = probeFlag >= 0 ? process.argv[probeFlag + 1] : ""
        let mensajeUsuario = msgs.slice(cortIdx + 1).map((m: any) => m.contenido).join("\n")
        let historial = historialPrevio
        if (!mensajeUsuario) {
            // No hay mensaje pendiente: simulamos uno para ejercitar motor + demora.
            mensajeUsuario = probe || "me confirmás el precio?"
            historial = msgs.map((m: any) => ({ rol: m.saliente ? "assistant" : "user", contenido: m.contenido }))
            console.log(`\n[dry-run] conv ${convId}: sin mensaje pendiente, uso probe sintético ${JSON.stringify(mensajeUsuario)}`)
        }
        {
            console.log(`[dry-run] conv ${convId} — mensaje del cliente: ${JSON.stringify(mensajeUsuario.slice(0, 120))}`)
            const t0 = Date.now()
            const respuesta = await ejecutarTurnoAgente(mensajeUsuario, historial, {
                conversationId: convId,
                estadoKey: `dryrun:${convId}`,
            })
            const latenciaTurno = Date.now() - t0
            let esperaMs = 0
            if (config?.respuestaDelayActivo) {
                esperaMs = calcularEsperaCadenciaHumanaMs(config.respuestaDelayMinSeg, config.respuestaDelayMaxSeg, latenciaTurno)
                await dormir(esperaMs)
            }
            const total = (Date.now() - t0) / 1000
            const dentro = total >= (config?.respuestaDelayMinSeg || 0) - 1 && total <= (config?.respuestaDelayMaxSeg || 1e9) + 2
            console.log(`[dry-run] turno ${latenciaTurno / 1000}s + demora ${esperaMs / 1000}s = ${total}s total  ${dentro ? "✅ dentro de la ventana" : "❌ FUERA de la ventana"}`)
            console.log(`[dry-run] respuesta (NO enviada): ${JSON.stringify(respuesta.mensajeFinal)}`)
        }
    }

    await prisma.$disconnect()
}

main().catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
})
