"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import {
    actualizarBotPausadoEnEspejo,
    actualizarDestacadoEnEspejo,
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
import { guardarEstadoConversacion } from "@/bot-agente/nucleo/estado-persistente"
import { obtenerConfiguracionAgente } from "@/bot-agente/configuracion"
import { TEMAS_NEGOCIO } from "@/lib/temas-negocio"
import {
    aprenderCompatibilidad,
    listarDestinosCompat,
    resolverDestinoPorNombre,
    type DestinoCompat,
    type ResultadoAprendizaje,
} from "@/lib/aprendizaje-compatibilidad"

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
        actualizarBotPausadoEnEspejo(conversationId, ultimoComandoBot).catch((err) => {
            console.error("Error actualizando bot pausado en espejo:", err)
        })
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

/**
 * Piloto controlado del motor nuevo (bot-agente): activa/desactiva que ESA
 * conversación puntual la responda bot-agente en vez de n8n. Reusa el mismo
 * /bot off / /bot on de arriba para pausar a n8n en esa charla.
 */
export async function activarPilotoBotAgenteChatVivo(conversationId: number): Promise<{ success: boolean }> {
    const session = await requireAdmin()
    const quien = (session?.user as any)?.username || "admin"
    const { activarPilotoBotAgente } = await import("@/lib/bot-agente-tiempo-real")
    await activarPilotoBotAgente(conversationId, ACCOUNT_ID, quien)
    await actualizarBotPausadoEnEspejo(conversationId, true)
    revalidatePath("/admin/chatwoot/chats-vivo")
    return { success: true }
}

export async function desactivarPilotoBotAgenteChatVivo(conversationId: number): Promise<{ success: boolean }> {
    await requireAdmin()
    const { desactivarPilotoBotAgente } = await import("@/lib/bot-agente-tiempo-real")
    await desactivarPilotoBotAgente(conversationId, ACCOUNT_ID)
    await actualizarBotPausadoEnEspejo(conversationId, false)
    revalidatePath("/admin/chatwoot/chats-vivo")
    return { success: true }
}

export async function estaEnPilotoBotAgenteChatVivo(conversationId: number): Promise<boolean> {
    await requireAdmin()
    const { esConversacionPiloto } = await import("@/lib/bot-agente-tiempo-real")
    return esConversacionPiloto(conversationId)
}

/** Marca o desmarca una conversación como destacada (estrella/favorito). */
export async function toggleDestacadoChatVivo(
    conversationId: number,
    destacado: boolean
): Promise<{ success: boolean; destacado: boolean }> {
    await requireAdmin()
    await actualizarDestacadoEnEspejo(conversationId, destacado)
    return { success: true, destacado }
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

/**
 * Marca en `chat_conversacion_estado` que este kit ya se le presentó al cliente,
 * usando la misma clave que el motor (`String(conversationId)`). Si el pack
 * pertenece a un grupo de variantes se pinea el GRUPO (es lo que el cliente vio
 * como combo); si es un kit suelto se marca como pack presentado.
 *
 * Best-effort: si falla, el envío del mensaje no se cae por esto.
 */
async function sembrarKitPresentadoEnMemoria(conversationId: number, packId: number): Promise<void> {
    try {
        const filas = await prisma.$queryRaw<
            { id: number; nombre: string; precio: number | string | null; grupo_id: number | null; grupo_nombre: string | null }[]
        >`
            SELECT cp.id, cp.nombre, cp.precio, cp.grupo_id, g.nombre AS grupo_nombre
            FROM chat_packs cp
            LEFT JOIN chat_pack_grupos g ON g.id = cp.grupo_id
            WHERE cp.id = ${packId}
            LIMIT 1
        `
        const pack = filas?.[0]
        if (!pack) return

        if (pack.grupo_id) {
            await guardarEstadoConversacion(String(conversationId), {
                grupoPineado: { id: Number(pack.grupo_id), nombre: pack.grupo_nombre || pack.nombre },
            })
        } else {
            await guardarEstadoConversacion(String(conversationId), {
                packPresentado: {
                    id: Number(pack.id),
                    nombre: pack.nombre,
                    precio: pack.precio != null ? Number(pack.precio) : 0,
                },
            })
        }
    } catch (error) {
        console.error("No se pudo sembrar el kit presentado en la memoria del bot-agente:", error)
    }
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
    subtitulo?: string | null
}

/**
 * Lista de kits para el selector "Enviar info de kit" del panel de chats en vivo.
 * Trae todos los packs y kits cargados en el catálogo (/admin/chatwoot/catalogo,
 * tabla chat_packs), activos y pausados, los activos primero, con el mensaje
 * y la foto completos para poder precargarlos en el cuadro de escritura.
 */
export async function listarKitsEnvioRapido(): Promise<KitEnvioRapido[]> {
    await requireAdmin()
    try {
        const rows = await prisma.$queryRaw<
            {
                id: number
                nombre: string
                precio: number | string | null
                foto_url: string | null
                mensaje_bienvenida: string | null
                activo: boolean
                grupo_nombre: string | null
                criterio_variante: string | null
            }[]
        >`
            SELECT cp.id, cp.nombre, cp.precio, cp.foto_url, cp.mensaje_bienvenida, cp.activo,
                   cp.criterio_variante, g.nombre AS grupo_nombre
            FROM chat_packs cp
            LEFT JOIN chat_pack_grupos g ON g.id = cp.grupo_id
            ORDER BY cp.activo DESC, cp.nombre ASC
        `
        const formatoPrecio = new Intl.NumberFormat("es-AR", {
            style: "currency",
            currency: "ARS",
            maximumFractionDigits: 0,
        })

        return rows.map((r) => {
            const mensaje = r.mensaje_bienvenida && r.mensaje_bienvenida.trim() ? r.mensaje_bienvenida : null
            const fotoUrl = r.foto_url && r.foto_url.trim() ? r.foto_url.trim() : null
            const numPrecio = r.precio != null ? Number(r.precio) : null
            const precioTexto = numPrecio && !isNaN(numPrecio) && numPrecio > 0 ? formatoPrecio.format(numPrecio) : null

            let subtitulo: string | null = null
            if (r.grupo_nombre && r.criterio_variante) {
                subtitulo = `${r.grupo_nombre} (${r.criterio_variante})`
            } else if (r.grupo_nombre) {
                subtitulo = r.grupo_nombre
            }

            return {
                id: Number(r.id),
                nombre: r.nombre,
                precio: precioTexto,
                tieneFoto: Boolean(fotoUrl),
                activo: Boolean(r.activo),
                tieneMensaje: Boolean(mensaje),
                mensaje,
                fotoUrl,
                subtitulo,
            }
        })
    } catch (error) {
        console.error("Error leyendo chat_packs para envío rápido:", error)
        throw new Error("No se pudo leer la lista de kits del catálogo")
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

    if (kit) {
        // Sembrar la memoria del bot-agente: para el motor, un kit que mandó el
        // equipo a mano es un kit YA PRESENTADO. Sin esto la conversación le
        // llega con la memoria en blanco y, ante la primera pregunta puntual,
        // vuelve a mandar la ficha entera con precio y foto (conv 2763, 08/09).
        // NO se marca la variante como resuelta: que el equipo mande la info de
        // una variante no significa que el cliente la haya elegido, y dar por
        // definida la variante equivocada vende el producto equivocado.
        await sembrarKitPresentadoEnMemoria(conversationId, kit.id)
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


// ─────────────────────────────────────────────────────────────────────────────
// Escalados del bot dentro del chat
//
// El bot deriva al equipo insertando una fila en una de las 4 tablas de
// pendientes, y nada más: no deja nota en Chatwoot ni marca el hilo. Hasta acá
// el único rastro visible era el badge de categoría en la lista, así que el
// equipo veía "Técnica" sin saber qué se había derivado, y lo cerraba con el
// check "Marcar como resuelto" — que borra el pendiente sin aprender nada.
//
// Estas acciones traen el escalado al chat: se ve qué se derivó y se responde
// desde ahí. Para la bandeja técnica, responder ADEMÁS carga la compatibilidad
// en las tablas que lee el bot (lib/aprendizaje-compatibilidad.ts), que es lo
// que hacía el workflow de n8n antes de apagarse.
// ─────────────────────────────────────────────────────────────────────────────

export type TipoEscalado = "tecnica" | "precio" | "negocio" | "sin_match"

export type EscaladoChatVivo = {
    tipo: TipoEscalado
    id: number
    conversationId: number
    /** Resumen que escribió el bot al derivar. */
    resumen: string
    /** Motivo canónico del turno que escaló (de bot_agente_turnos_reales), si se pudo cruzar. */
    motivo?: string
    modeloMoto?: string
    kit?: string
    /** Kit del catálogo al que apunta la pendiente, ya resuelto (solo bandeja técnica). */
    destinoSugerido?: DestinoCompat
    creadoEn: string
}

export type OpcionesAprendizaje = {
    destinos: DestinoCompat[]
    mensajeIncompatibilidad: string
}

/** Escalados abiertos de una conversación, los 4 tipos, más nuevo primero. */
export async function listarEscaladosChatVivo(conversationId: number): Promise<EscaladoChatVivo[]> {
    await requireAdmin()
    const id = BigInt(conversationId)

    const [tecnicas, precios, negocio, sinMatch, turnos] = await Promise.all([
        prisma.$queryRaw<
            {
                id: number
                modelo_moto: string | null
                kit: string | null
                kit_id: number | null
                es_grupo: boolean | null
                pregunta_original: string
                creado_en: Date
            }[]
        >`
            SELECT id, modelo_moto, kit, kit_id, es_grupo, pregunta_original, creado_en
            FROM preguntas_tecnicas_pendientes
            WHERE estado = 'pendiente' AND conversation_id = ${id}
            ORDER BY creado_en DESC
        `,
        prisma.$queryRaw<{ id: number; producto: string | null; pregunta_original: string; creado_en: Date }[]>`
            SELECT id, producto, pregunta_original, creado_en
            FROM preguntas_precio_pendientes
            WHERE estado = 'pendiente' AND conversation_id = ${id}
            ORDER BY creado_en DESC
        `,
        prisma.$queryRaw<{ id: number; tema: string | null; pregunta_original: string; creado_en: Date }[]>`
            SELECT id, tema, pregunta_original, creado_en
            FROM preguntas_negocio_pendientes
            WHERE estado = 'pendiente' AND conversation_id = ${id}
            ORDER BY creado_en DESC
        `,
        prisma.$queryRaw<{ id: number; pregunta_original: string; creado_en: Date }[]>`
            SELECT id, pregunta_original, creado_en
            FROM preguntas_sin_match_pendientes
            WHERE estado = 'pendiente' AND conversation_id = ${id}
            ORDER BY creado_en DESC
        `,
        // El motivo canónico no se guarda en la tabla de pendientes, pero sí en el
        // registro del turno: se cruza por cercanía temporal (el escalado se
        // persiste dentro del mismo turno, con segundos de diferencia).
        prisma.$queryRaw<{ motivo_escalado: string | null; creado_en: Date }[]>`
            SELECT motivo_escalado, creado_en
            FROM bot_agente_turnos_reales
            WHERE conversation_id = ${id} AND escalado_humano = true
            ORDER BY creado_en DESC
            LIMIT 20
        `,
    ])

    const motivoCercano = (fecha: Date): string | undefined => {
        let mejor: { motivo: string; delta: number } | undefined
        for (const t of turnos) {
            if (!t.motivo_escalado) continue
            const delta = Math.abs(t.creado_en.getTime() - fecha.getTime())
            if (delta > 60_000) continue // más de un minuto no es el mismo turno
            if (!mejor || delta < mejor.delta) mejor = { motivo: t.motivo_escalado, delta }
        }
        return mejor?.motivo
    }

    const destinos = tecnicas.length > 0 ? await listarDestinosCompat() : []
    const escalados: EscaladoChatVivo[] = []

    for (const f of tecnicas) {
        // El kit puede venir ya resuelto (escalados nuevos) o solo como texto
        // libre (los de antes de que el escalado guardara kit_id).
        let destinoSugerido: DestinoCompat | undefined
        if (f.kit_id != null) {
            const tipo = f.es_grupo ? "grupo" : "pack"
            destinoSugerido = destinos.find((d) => d.tipo === tipo && d.id === Number(f.kit_id))
        }
        if (!destinoSugerido) {
            destinoSugerido = (await resolverDestinoPorNombre(f.kit, destinos)) ?? undefined
        }

        escalados.push({
            tipo: "tecnica",
            id: f.id,
            conversationId,
            resumen: f.pregunta_original,
            motivo: motivoCercano(f.creado_en),
            modeloMoto: f.modelo_moto || undefined,
            kit: f.kit || undefined,
            destinoSugerido,
            creadoEn: f.creado_en.toISOString(),
        })
    }

    for (const f of precios) {
        escalados.push({
            tipo: "precio",
            id: f.id,
            conversationId,
            resumen: f.pregunta_original,
            motivo: motivoCercano(f.creado_en),
            kit: f.producto || undefined,
            creadoEn: f.creado_en.toISOString(),
        })
    }

    for (const f of negocio) {
        escalados.push({
            tipo: "negocio",
            id: f.id,
            conversationId,
            resumen: f.pregunta_original,
            motivo: motivoCercano(f.creado_en) || f.tema || undefined,
            creadoEn: f.creado_en.toISOString(),
        })
    }

    for (const f of sinMatch) {
        escalados.push({
            tipo: "sin_match",
            id: f.id,
            conversationId,
            resumen: f.pregunta_original,
            motivo: motivoCercano(f.creado_en),
            creadoEn: f.creado_en.toISOString(),
        })
    }

    return escalados.sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
}

/** Kits del catálogo y texto de incompatibilidad, para el formulario de aprendizaje. */
export async function opcionesAprendizajeChatVivo(): Promise<OpcionesAprendizaje> {
    await requireAdmin()
    const [destinos, config] = await Promise.all([
        listarDestinosCompat(),
        obtenerConfiguracionAgente().catch(() => null),
    ])
    return {
        destinos,
        mensajeIncompatibilidad:
            config?.mensajeIncompatibilidad?.trim() || "Lamentablemente este kit no es compatible.",
    }
}

const TABLA_POR_TIPO: Record<TipoEscalado, string> = {
    tecnica: "preguntas_tecnicas_pendientes",
    precio: "preguntas_precio_pendientes",
    negocio: "preguntas_negocio_pendientes",
    sin_match: "preguntas_sin_match_pendientes",
}

/**
 * Cierra UN escalado sin aprender nada. Es el equivalente por fila del check
 * "Marcar como resuelto" (que cierra los 4 tipos de toda la conversación de una)
 * y existe para que descartar un escalado sea una decisión explícita y no el
 * camino por defecto: se marca `descartada`, no `respondida`, así se distingue
 * de lo que sí se contestó.
 */
export async function descartarEscaladoChatVivo(tipo: TipoEscalado, id: number): Promise<{ success: boolean }> {
    await requireAdmin()
    await prisma.$executeRawUnsafe(
        `UPDATE ${TABLA_POR_TIPO[tipo]} SET estado = 'descartada' WHERE id = $1::int`,
        id
    )
    revalidatePath("/admin/chatwoot/chats-vivo")
    return { success: true }
}

/**
 * Responde un escalado TÉCNICO: carga la compatibilidad en las tablas del bot y
 * (si se pide) le manda la respuesta al cliente por WhatsApp.
 *
 * Lo que hacía n8n al procesar la nota privada con la marca [[RM_TECNICA:...]],
 * ahora sin IA de por medio ni nota intermedia: el Sí/No y el detalle que cargó
 * el equipo se guardan tal cual, y el texto que sale al cliente es el que el
 * equipo vio y pudo editar antes de enviarlo.
 */
export async function responderEscaladoTecnicoChatVivo(params: {
    pendienteId: number
    conversationId: number
    destino: DestinoCompat
    modeloMoto: string
    compatible: boolean
    detalle?: string
    aplicarAPiezas?: boolean
    /** Texto a enviarle al cliente. Vacío o ausente = solo aprender, sin escribirle. */
    mensajeCliente?: string
    /** Dejar que el bot siga a cargo de la conversación en vez de pausarlo. */
    reanudarBot?: boolean
}): Promise<{ success: boolean; aprendido: ResultadoAprendizaje; mensajeEnviado: boolean }> {
    await requireAdmin()

    const aprendido = await aprenderCompatibilidad({
        destino: params.destino,
        modeloMoto: params.modeloMoto,
        compatible: params.compatible,
        detalle: params.detalle,
        aplicarAPiezas: params.aplicarAPiezas,
    })

    // La pendiente se cierra recién con el dato ya guardado: si el aprendizaje
    // falla, el escalado sigue abierto y el equipo lo vuelve a ver.
    await prisma.$executeRaw`
        UPDATE preguntas_tecnicas_pendientes SET estado = 'respondida' WHERE id = ${params.pendienteId}
    `

    const texto = (params.mensajeCliente || "").trim()
    let mensajeEnviado = false

    if (texto) {
        await enviarMensajeManualChatwoot({
            accountId: ACCOUNT_ID,
            conversationId: params.conversationId,
            content: texto,
        })
        // Lo manda el equipo: pausa el bot como cualquier respuesta manual, salvo
        // que se pida explícitamente que el bot siga a cargo.
        await registrarMensajeSalienteEnEspejo(params.conversationId, texto, {
            pausarBot: !params.reanudarBot,
        })
        mensajeEnviado = true

        emitirEventoChatwoot({
            tipo: "message_created",
            conversationId: params.conversationId,
            botPausado: params.reanudarBot ? undefined : true,
            mensaje: {
                id: Date.now(),
                contenido: texto,
                privado: false,
                saliente: true,
                remitente: "Nosotros",
                creadoEn: new Date().toISOString(),
            },
        })
    }

    if (params.reanudarBot) {
        // El motor guarda "hay una consulta derivada" en su memoria y calla hasta
        // que un humano conteste. Ya se contestó: se limpia para que el bot pueda
        // seguir la charla en vez de quedarse mudo.
        await guardarEstadoConversacion(String(params.conversationId), { escaladoPendiente: null }).catch(() => {})
    }

    revalidatePath("/admin/chatwoot/chats-vivo")
    return { success: true, aprendido, mensajeEnviado }
}
