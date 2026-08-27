import { NextResponse } from "next/server"
import { validateN8nToken } from "@/lib/webhook-guard"
import {
    encolarRespuesta,
    enviarImagenChatwoot,
    enviarMensajeChatwoot,
    numeroExceptuado,
    telefonoDeConversacion,
} from "@/lib/chatwoot-bot"
import { sincronizarEstadoBot } from "@/lib/chatwoot-cola"

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
    const fotoUrl = typeof body?.foto_url === "string" && body.foto_url.trim() ? body.foto_url.trim() : null

    if (!Number.isFinite(conversationId) || conversationId <= 0) {
        return NextResponse.json({ error: "Falta conversation_id" }, { status: 400 })
    }
    if (!contenido) {
        return NextResponse.json({ error: "Falta content" }, { status: 400 })
    }

    try {
        const { encendido } = await sincronizarEstadoBot()

        if (!encendido) {
            // Excepción para números de prueba: aunque el bot esté apagado
            // (manual u horario), estos siguen recibiendo la respuesta en
            // vivo en vez de quedar en la cola. Ver bot-numeros-exceptuados.sql.
            const telefono = await telefonoDeConversacion(accountId, conversationId)
            const exceptuado = await numeroExceptuado(telefono)

            if (!exceptuado) {
                const id = await encolarRespuesta({
                    accountId,
                    conversationId,
                    contacto,
                    contenido,
                    origen,
                    fotoUrl,
                })
                return NextResponse.json({ enviado: false, encolado: true, id })
            }
        }

        const chatwoot = await enviarMensajeChatwoot({ accountId, conversationId, content: contenido })

        // Actualizar espejo en PostgreSQL y emitir evento SSE para actualización instantánea
        try {
            const { registrarMensajeSalienteEnEspejo } = await import("@/lib/chatwoot-chats-vivo")
            await registrarMensajeSalienteEnEspejo(conversationId, contenido).catch(() => {})

            const { emitirEventoChatwoot } = await import("@/lib/chatwoot-events")
            emitirEventoChatwoot({
                tipo: "message_created",
                conversationId,
                mensaje: {
                    id: Number(chatwoot?.id || Date.now()),
                    contenido,
                    privado: false,
                    saliente: true,
                    remitente: "Bot",
                    creadoEn: new Date().toISOString(),
                    status: "sent",
                    adjuntos: fotoUrl
                        ? [
                              {
                                  id: "foto-kit",
                                  tipo: "image",
                                  url: fotoUrl,
                              },
                          ]
                        : undefined,
                },
            })
        } catch (err) {
            console.error("Error emitiendo evento de mensaje saliente en /api/chatwoot/enviar:", err)
        }

        let fotoError: string | null = null
        if (fotoUrl) {
            try {
                await enviarImagenChatwoot({ accountId, conversationId, fotoUrl })
            } catch (error) {
                // El texto ya salió: un fallo mandando la foto no debe reportarse
                // como que la respuesta entera falló (n8n reintentaría todo el nodo).
                fotoError = error instanceof Error ? error.message : String(error)
                console.error("No se pudo mandar la foto del kit:", error)
            }
        }

        return NextResponse.json({ enviado: true, encolado: false, chatwoot, fotoError })
    } catch (error) {
        // Devolvemos 500 a propósito: el nodo de n8n tiene reintentos y el
        // workflow de errores avisa por push si igual no sale.
        const detalle = error instanceof Error ? error.message : String(error)
        console.error("Error en /api/chatwoot/enviar:", error)
        return NextResponse.json({ error: detalle }, { status: 500 })
    }
}
