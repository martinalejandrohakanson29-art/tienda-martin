import { chatwootEventBus, type EventoChatwootEnVivo } from "@/lib/chatwoot-events"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Endpoint de Server-Sent Events (SSE) para empujar eventos de Chatwoot
 * a la interfaz de administración en tiempo real.
 */
export async function GET(req: Request) {
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
        start(controller) {
            // Enviar saludo de conexión
            controller.enqueue(encoder.encode(": connected\n\n"))

            const onEvent = (evento: EventoChatwootEnVivo) => {
                try {
                    const data = `data: ${JSON.stringify(evento)}\n\n`
                    controller.enqueue(encoder.encode(data))
                } catch (e) {
                    console.error("Error transmitiendo evento SSE:", e)
                }
            }

            chatwootEventBus.on("chatwoot_event", onEvent)

            // Heartbeat cada 20 segundos para evitar que proxies/nginx cierren la conexión
            const keepAliveId = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(": keepalive\n\n"))
                } catch {
                    clearInterval(keepAliveId)
                }
            }, 20_000)

            const cleanup = () => {
                clearInterval(keepAliveId)
                chatwootEventBus.off("chatwoot_event", onEvent)
                try {
                    controller.close()
                } catch {
                    // Ignorar si ya estaba cerrado
                }
            }

            req.signal.addEventListener("abort", cleanup)
        },
    })

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        },
    })
}
