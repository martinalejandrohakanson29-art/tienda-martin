import { NextResponse } from "next/server"
import { validateN8nToken } from "@/lib/webhook-guard"
import { encolarRespuesta, enviarMensajeChatwoot, getEstadoBot } from "@/lib/chatwoot-bot"

// Único punto de salida de los mensajes que ve el cliente.
//
// El workflow de n8n ya no le pega directo a Chatwoot para responderle al
// cliente: le pega acá. Con el bot encendido esto es un pasamanos (mismo
// mensaje, misma cuenta, mismo token); con el bot apagado la respuesta —que ya
// está generada y con el turno guardado en el historial— queda en la cola y sale
// cuando abren el local.
//
// Los envíos internos del workflow (nota privada de escalado, etiquetas) siguen
// yendo directo a Chatwoot: el cliente no los ve y conviene tenerlos al abrir.

export async function POST(request: Request) {
    const noAutorizado = validateN8nToken(request)
    if (noAutorizado) return noAutorizado

    let body: any
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: "Body inválido" }, { status: 400 })
    }

    const conversationId = Number(body?.conversation_id)
    const accountId = Number(body?.account_id ?? 1)
    const contenido = typeof body?.content === "string" ? body.content.trim() : ""
    const origen = typeof body?.origen === "string" && body.origen ? body.origen : "respuesta"
    const contacto = typeof body?.contacto === "string" && body.contacto ? body.contacto.slice(0, 120) : null

    if (!Number.isFinite(conversationId) || conversationId <= 0) {
        return NextResponse.json({ error: "Falta conversation_id" }, { status: 400 })
    }
    if (!contenido) {
        return NextResponse.json({ error: "Falta content" }, { status: 400 })
    }

    try {
        const { encendido } = await getEstadoBot()

        if (!encendido) {
            const id = await encolarRespuesta({
                accountId,
                conversationId,
                contacto,
                contenido,
                origen,
            })
            return NextResponse.json({ enviado: false, encolado: true, id })
        }

        const chatwoot = await enviarMensajeChatwoot({ accountId, conversationId, content: contenido })
        return NextResponse.json({ enviado: true, encolado: false, chatwoot })
    } catch (error) {
        // Devolvemos 500 a propósito: el nodo de n8n tiene reintentos y el
        // workflow de errores avisa por push si igual no sale.
        const detalle = error instanceof Error ? error.message : String(error)
        console.error("Error en /api/chatwoot/enviar:", error)
        return NextResponse.json({ error: detalle }, { status: 500 })
    }
}
