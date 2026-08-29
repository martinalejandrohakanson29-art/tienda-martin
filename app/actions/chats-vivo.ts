"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import {
    actualizarBotPausadoEnEspejo,
    listarChatsVivo,
    marcarPendientesResueltasEnEspejo,
    registrarMensajeSalienteEnEspejo,
    resetearNoLeidosEnEspejo,
    sincronizarEspejoChatwoot,
    type PanelChatsVivo,
} from "@/lib/chatwoot-chats-vivo"
import {
    enviarImagenChatwoot,
    enviarMensajeChatwoot,
    enviarMensajeManualChatwoot,
    enviarNotaPrivadaChatwoot,
    getMensajesConversacion,
    marcarConversacionLeidaEnChatwoot,
    telefonoDeConversacion,
    type AdjuntoConversacion,
    type EstadoMensaje,
    type MensajeConversacion,
} from "@/lib/chatwoot-bot"
import { emitirEventoChatwoot } from "@/lib/chatwoot-events"
import { TEMAS_NEGOCIO } from "@/lib/temas-negocio"

// La app no puede hablarle directo al Redis del bot (firewall de IP), así que
// para "pinear" un kit se le pega a un workflow n8n aparte — mismo patrón que
// "Utilidad - Limpiar Pin de Prueba" (ver n8n-workflows/pinear-kit-manual.md).
const N8N_PINEAR_KIT_URL = "https://n8n.revolucionmotos.tech/webhook/pinear-kit-manual"

export type { PanelChatsVivo, MensajeConversacion, AdjuntoConversacion, EstadoMensaje }

const ACCOUNT_ID = 1

export async function obtenerChatsVivo(periodoDias: number): Promise<PanelChatsVivo> {
    await requireAdmin()
    return listarChatsVivo(periodoDias)
}

/** Sincronización ligera en segundo plano (página 1 de Chatwoot) que actualiza PostgreSQL y retorna el panel */
export async function sincronizarChatsVivoLigero(periodoDias: number): Promise<PanelChatsVivo> {
    await requireAdmin()
    await sincronizarEspejoChatwoot(1).catch(() => {})
    return listarChatsVivo(periodoDias)
}

/** Fuerza una sincronización rápida desde Chatwoot y retorna el listado actualizado. */
export async function forzarSincronizacionChatsVivo(periodoDias: number): Promise<PanelChatsVivo> {
    await requireAdmin()
    // Botón manual: barre varias páginas de Chatwoot para reconciliar no leídos /
    // últimos mensajes de conversaciones que quedaron fuera del sync ligero (pág. 1).
    await sincronizarEspejoChatwoot(5)
    return listarChatsVivo(periodoDias)
}

/** Hilo real de una conversación (de solo lectura), para el panel de detalle. */
export async function obtenerHiloChatVivo(conversationId: number): Promise<MensajeConversacion[]> {
    await requireAdmin()
    const mensajes = await getMensajesConversacion(ACCOUNT_ID, conversationId)

    // Sincronizar el estado del bot si existe algún comando /bot off o /bot on en el hilo
    let ultimoComandoBot: boolean | null = null
    for (let i = mensajes.length - 1; i >= 0; i--) {
        const txt = mensajes[i].contenido.trim().toLowerCase()
        if (txt === "/bot off") {
            ultimoComandoBot = true
            break
        }
        if (txt === "/bot on") {
            ultimoComandoBot = false
            break
        }
    }

    if (ultimoComandoBot !== null) {
        await actualizarBotPausadoEnEspejo(conversationId, ultimoComandoBot)
    }

    return mensajes
}

/** Prende o apaga el bot en una conversación específica enviando /bot on o /bot off como nota privada. */
export async function cambiarEstadoBotChatVivo(
    conversationId: number,
    encendido: boolean
): Promise<{ success: boolean; botPausado: boolean }> {
    await requireAdmin()

    const content = encendido ? "/bot on" : "/bot off"
    await enviarNotaPrivadaChatwoot({
        accountId: ACCOUNT_ID,
        conversationId,
        content,
    })

    const botPausado = !encendido
    await actualizarBotPausadoEnEspejo(conversationId, botPausado)

    revalidatePath("/admin/chatwoot/chats-vivo")
    return { success: true, botPausado }
}

/** Envía un mensaje de texto manual al cliente por WhatsApp a través de Chatwoot. */
export async function enviarMensajeChatVivo(
    conversationId: number,
    contenido: string
): Promise<{ success: boolean; mensaje: MensajeConversacion }> {
    await requireAdmin()
    const texto = contenido.trim()
    if (!texto) throw new Error("El mensaje no puede estar vacío")

    const res = await enviarMensajeManualChatwoot({
        accountId: ACCOUNT_ID,
        conversationId,
        content: texto,
    })

    // Lo manda un humano del equipo desde el panel -> pausa el bot en esta charla.
    await registrarMensajeSalienteEnEspejo(conversationId, texto, { pausarBot: true })

    const mensaje: MensajeConversacion = {
        id: Number(res?.id || Date.now()),
        contenido: texto,
        privado: false,
        saliente: true,
        remitente: "Nosotros",
        creadoEn: new Date().toISOString(),
    }

    revalidatePath("/admin/chatwoot/chats-vivo")
    return { success: true, mensaje }
}

/**
 * Manda una nota interna (privada) a la conversación real de Chatwoot. El cliente
 * NO la ve. La usa el equipo para pasarle al bot el dato técnico que falta: el
 * workflow "¿Es respuesta de mi equipo?" la levanta y redacta la respuesta al
 * cliente. A diferencia de un mensaje manual, NO pausa el bot ni cambia el
 * "último mensaje" de la lista.
 */
export async function enviarNotaInternaChatVivo(
    conversationId: number,
    contenido: string
): Promise<{ success: boolean; mensaje: MensajeConversacion }> {
    await requireAdmin()
    const texto = contenido.trim()
    if (!texto) throw new Error("La nota no puede estar vacía")

    await enviarNotaPrivadaChatwoot({
        accountId: ACCOUNT_ID,
        conversationId,
        content: texto,
    })

    const mensaje: MensajeConversacion = {
        id: Date.now(),
        contenido: texto,
        privado: true,
        saliente: true,
        remitente: "Nosotros",
        creadoEn: new Date().toISOString(),
    }

    revalidatePath("/admin/chatwoot/chats-vivo")
    return { success: true, mensaje }
}

export type KitEnvioRapido = {
    id: number
    nombre: string
    precio: string | null
    tieneFoto: boolean
    activo: boolean
    tieneMensaje: boolean
    /** Mensaje predefinido completo, para precargar en el cuadro de escritura. */
    mensaje: string | null
    /** URL de la foto del kit, para precargarla como adjunto pendiente. */
    fotoUrl: string | null
}

/**
 * Lista de kits para el selector "Enviar info de kit" del panel de chats en vivo.
 * Trae todos los kits cargados (activos y pausados), los activos primero, con el
 * mensaje y la foto completos para poder precargarlos en el cuadro de escritura.
 */
export async function listarKitsEnvioRapido(): Promise<KitEnvioRapido[]> {
    await requireAdmin()
    try {
        const rows = await prisma.$queryRaw<
            { id: number; nombre: string; precio: string | null; foto_url: string | null; mensaje_bienvenida: string | null; activo: boolean }[]
        >`
            SELECT id, nombre, precio, foto_url, mensaje_bienvenida, activo
            FROM kits_publicidad
            ORDER BY activo DESC, nombre ASC
        `
        return rows.map((r) => {
            const mensaje = r.mensaje_bienvenida && r.mensaje_bienvenida.trim() ? r.mensaje_bienvenida : null
            const fotoUrl = r.foto_url && r.foto_url.trim() ? r.foto_url.trim() : null
            return {
                id: Number(r.id),
                nombre: r.nombre,
                precio: r.precio,
                tieneFoto: Boolean(fotoUrl),
                activo: Boolean(r.activo),
                tieneMensaje: Boolean(mensaje),
                mensaje,
                fotoUrl,
            }
        })
    } catch (error) {
        console.error("Error leyendo kits_publicidad para envío rápido:", error)
        throw new Error("No se pudo leer la lista de kits (¿corriste el CREATE TABLE kits_publicidad?)")
    }
}

/**
 * Envía lo que el equipo escribió en el cuadro del panel de chats en vivo:
 * texto y/o una imagen (adjunto pendiente), como mensaje al cliente o nota
 * interna para el bot.
 *
 * - `esNota`: nota privada para el bot (no lleva imagen, no pausa el bot).
 * - `kit` presente: se manda como "saludo de kit" — identidad del Bot, prende el
 *   bot en la charla y lo "pinea" en Redis vía el workflow n8n (como si el
 *   cliente hubiera entrado por publicidad). El equipo pudo haber editado el
 *   texto/la foto antes de mandar.
 * - sin `kit`: mensaje manual del equipo (identidad de agente humano, pausa el bot).
 *
 * `fotoUrl` es una URL http(s) pública (foto del kit, o la que devuelve
 * /api/admin/kits/imagen al subir una imagen arrastrada). El fallo al mandar la
 * imagen o al pinear no tumban el envío del texto: se devuelven como avisos.
 */
export async function enviarMensajeComposerChatVivo(params: {
    conversationId: number
    contenido: string
    esNota: boolean
    fotoUrl?: string | null
    kit?: { id: number; nombre: string } | null
}): Promise<{
    success: boolean
    mensaje: MensajeConversacion
    avisoFoto: string | null
    avisoPin: string | null
}> {
    await requireAdmin()

    const { conversationId, esNota } = params
    const texto = params.contenido.trim()
    const fotoUrl = params.fotoUrl && params.fotoUrl.trim() ? params.fotoUrl.trim() : null
    const kit = !esNota ? params.kit ?? null : null

    // --- Nota interna ---
    if (esNota) {
        if (!texto) throw new Error("La nota no puede estar vacía")
        await enviarNotaPrivadaChatwoot({ accountId: ACCOUNT_ID, conversationId, content: texto })
        const mensaje: MensajeConversacion = {
            id: Date.now(),
            contenido: texto,
            privado: true,
            saliente: true,
            remitente: "Nosotros",
            creadoEn: new Date().toISOString(),
        }
        revalidatePath("/admin/chatwoot/chats-vivo")
        return { success: true, mensaje, avisoFoto: null, avisoPin: null }
    }

    // --- Mensaje al cliente ---
    if (!texto && !fotoUrl) throw new Error("Escribí un mensaje o adjuntá una imagen")

    let idTexto = Date.now()

    if (kit) {
        // Como saludo de kit: prende el bot, identidad del Bot, NO pausa.
        await enviarNotaPrivadaChatwoot({ accountId: ACCOUNT_ID, conversationId, content: "/bot on" })
        await actualizarBotPausadoEnEspejo(conversationId, false)
        if (texto) {
            const res = await enviarMensajeChatwoot({ accountId: ACCOUNT_ID, conversationId, content: texto })
            idTexto = Number(res?.id || idTexto)
        }
        await registrarMensajeSalienteEnEspejo(conversationId, texto || "📷 Foto")
    } else {
        // Mensaje manual del equipo: identidad de agente humano, pausa el bot.
        if (texto) {
            const res = await enviarMensajeManualChatwoot({ accountId: ACCOUNT_ID, conversationId, content: texto })
            idTexto = Number(res?.id || idTexto)
        }
        await registrarMensajeSalienteEnEspejo(conversationId, texto || "📷 Foto", { pausarBot: true })
    }

    let avisoFoto: string | null = null
    if (fotoUrl) {
        try {
            await enviarImagenChatwoot({ accountId: ACCOUNT_ID, conversationId, fotoUrl })
        } catch (error) {
            avisoFoto = error instanceof Error ? error.message : "No se pudo mandar la imagen"
            console.error("No se pudo mandar la imagen (composer chats-vivo):", error)
        }
    }

    let avisoPin: string | null = null
    if (kit) {
        try {
            const telefono = await telefonoDeConversacion(ACCOUNT_ID, conversationId)
            const claveTelefono = telefono || `conv-${conversationId}`
            const webhookToken = process.env.CHATWOOT_WEBHOOK_TOKEN
            const url = webhookToken
                ? `${N8N_PINEAR_KIT_URL}?token=${encodeURIComponent(webhookToken)}`
                : N8N_PINEAR_KIT_URL
            const resPin = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ telefono: claveTelefono, conversationId, kit_id: kit.id, kit_nombre: kit.nombre }),
            })
            const dataPin = await resPin.json().catch(() => ({}))
            if (!resPin.ok) throw new Error(dataPin?.error || `n8n respondió ${resPin.status}`)
        } catch (error) {
            avisoPin = error instanceof Error ? error.message : "No se pudo pinear el kit en Redis"
            console.error("No se pudo pinear el kit en Redis (composer chats-vivo):", error)
        }
    }

    const mensaje: MensajeConversacion = {
        id: idTexto,
        contenido: texto,
        privado: false,
        saliente: true,
        remitente: kit ? "Bot" : "Nosotros",
        creadoEn: new Date().toISOString(),
        status: "sent",
        adjuntos: fotoUrl ? [{ id: `adjunto-${idTexto}`, tipo: "image", url: fotoUrl }] : undefined,
    }
    emitirEventoChatwoot({ tipo: "message_created", conversationId, mensaje })

    revalidatePath("/admin/chatwoot/chats-vivo")
    return { success: true, mensaje, avisoFoto, avisoPin }
}

export type NotaRapida = {
    id: number
    tema: string
    etiqueta: string
    respuesta: string
}

/**
 * Notas rápidas para el panel de chats en vivo: las respuestas de "Info del
 * negocio" (medios de pago, envíos, horarios, ubicación, garantía, etc.) que ya
 * carga el equipo en /admin/chatwoot/conocimiento. Se mandan tal cual al cliente.
 */
export async function listarNotasRapidas(): Promise<NotaRapida[]> {
    await requireAdmin()
    try {
        const rows = await prisma.$queryRaw<{ id: number; tema: string; respuesta: string }[]>`
            SELECT id, tema, respuesta
            FROM info_negocio
            WHERE respuesta IS NOT NULL AND btrim(respuesta) <> ''
            ORDER BY creado_en DESC
        `
        const etiquetaDe = (tema: string) =>
            TEMAS_NEGOCIO.find((t) => t.value === tema.toLowerCase())?.label ?? tema
        // Una sola nota por tema (la más reciente, igual criterio que el workflow).
        const vistos = new Set<string>()
        const notas: NotaRapida[] = []
        for (const r of rows) {
            const clave = r.tema.toLowerCase()
            if (vistos.has(clave)) continue
            vistos.add(clave)
            notas.push({ id: Number(r.id), tema: r.tema, etiqueta: etiquetaDe(r.tema), respuesta: r.respuesta })
        }
        return notas
    } catch (error) {
        console.error("Error leyendo info_negocio para notas rápidas:", error)
        throw new Error("No se pudo leer la info del negocio")
    }
}

/**
 * Crea (o reemplaza, si ya existe una con el mismo título) una nota rápida
 * directo en la tabla `info_negocio`, desde el selector del panel de chats en
 * vivo. Mismo criterio "una por tema" que /admin/chatwoot/conocimiento y que el
 * workflow del bot.
 */
export async function crearNotaRapida(titulo: string, respuesta: string): Promise<NotaRapida> {
    await requireAdmin()
    const temaOriginal = titulo.trim().replace(/\s+/g, " ")
    const temaKey = temaOriginal.toLowerCase()
    const texto = respuesta.trim()
    if (!temaOriginal || !texto) throw new Error("El título y el texto son obligatorios")

    const existente = await prisma.$queryRaw<{ id: number }[]>`
        SELECT id FROM info_negocio WHERE LOWER(tema) = ${temaKey} LIMIT 1
    `
    let id: number
    if (existente.length > 0) {
        id = Number(existente[0].id)
        await prisma.$executeRaw`
            UPDATE info_negocio
            SET tema = ${temaOriginal}, respuesta = ${texto}, fuente = 'chats-vivo', creado_en = now()
            WHERE id = ${id}
        `
    } else {
        const insertado = await prisma.$queryRaw<{ id: number }[]>`
            INSERT INTO info_negocio (tema, respuesta, fuente)
            VALUES (${temaOriginal}, ${texto}, 'chats-vivo')
            RETURNING id
        `
        id = Number(insertado[0].id)
    }

    revalidatePath("/admin/chatwoot/conocimiento")
    const etiqueta = TEMAS_NEGOCIO.find((t) => t.value === temaKey)?.label ?? temaOriginal
    return { id, tema: temaOriginal, etiqueta, respuesta: texto }
}

/**
 * Marca a mano como resueltas todas las preguntas pendientes de una
 * conversación (las 4 tablas), sin mandar nada a Chatwoot. Lo usa el check
 * "Marcar como resuelto" del panel de chats en vivo, para conversaciones que
 * ya se atendieron directo con el cliente (y por eso el workflow de n8n nunca
 * las cerró solo).
 */
export async function marcarConversacionResueltaChatVivo(conversationId: number): Promise<{ success: boolean }> {
    await requireAdmin()
    await marcarPendientesResueltasEnEspejo(conversationId)
    revalidatePath("/admin/chatwoot/chats-vivo")
    return { success: true }
}

/** Marca una conversación como leída en Chatwoot y en la base local (espejo). */
export async function marcarConversacionComoLeida(conversationId: number): Promise<{ success: boolean }> {
    await requireAdmin()
    await marcarConversacionLeidaEnChatwoot(ACCOUNT_ID, conversationId)
    await resetearNoLeidosEnEspejo(conversationId)
    emitirEventoChatwoot({
        tipo: "conversation_read",
        conversationId,
    })
    return { success: true }
}

