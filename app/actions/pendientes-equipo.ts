"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guard"
import {
    enviarMensajeManualChatwoot,
    enviarNotaPrivadaChatwoot,
    tieneTokenEquipo,
    getMensajesConversacion,
    type AdjuntoConversacion,
    type MensajeConversacion,
} from "@/lib/chatwoot-bot"

import { registrarMensajeSalienteEnEspejo } from "@/lib/chatwoot-chats-vivo"
import {
    aprenderCompatibilidad,
    armarMensajeCompatibilidad,
    listarDestinosCompat,
    resolverDestinoPorNombre,
    type DestinoCompat,
} from "@/lib/aprendizaje-compatibilidad"

export type { MensajeConversacion, AdjuntoConversacion }

// Bandeja unificada de las preguntas que el bot escaló al equipo porque no
// tenía el dato a mano (tablas preguntas_tecnicas / precio / negocio /
// sin_match _pendientes).
//
// Las técnicas se responden acá mismo: se guarda la compatibilidad y se le
// contesta al cliente (ver `responderPendienteTecnica`). Las otras tres
// bandejas siguen saliendo como nota privada, que era la entrada del workflow
// de n8n — con n8n apagado esa nota hoy no la procesa nadie, así que sirve
// como apunte interno, no como respuesta automática al cliente.

export type TipoPendiente = "tecnica" | "precio" | "negocio" | "sin_match"

export type PendienteEquipo = {
    id: number
    tipo: TipoPendiente
    conversationId: number
    resumen: string
    preguntaOriginal: string
    modeloMoto?: string
    kit?: string
    creadoEn: string
}

const ACCOUNT_ID = 1

export type PanelPendientes = {
    tokenEquipo: boolean
    pendientes: PendienteEquipo[]
}

export async function listarPendientesEquipo(): Promise<PanelPendientes> {
    await requireAdmin()

    const [tecnicas, precios, negocio, sinMatch] = await Promise.all([
        prisma.$queryRaw<{ id: number; conversation_id: number; modelo_moto: string; kit: string; pregunta_original: string; creado_en: Date }[]>`
            SELECT id, conversation_id, modelo_moto, kit, pregunta_original, creado_en
            FROM preguntas_tecnicas_pendientes WHERE estado = 'pendiente' ORDER BY creado_en ASC
        `,
        prisma.$queryRaw<{ id: number; conversation_id: number; producto: string; pregunta_original: string; creado_en: Date }[]>`
            SELECT id, conversation_id, producto, pregunta_original, creado_en
            FROM preguntas_precio_pendientes WHERE estado = 'pendiente' ORDER BY creado_en ASC
        `,
        prisma.$queryRaw<{ id: number; conversation_id: number; tema: string; pregunta_original: string; creado_en: Date }[]>`
            SELECT id, conversation_id, tema, pregunta_original, creado_en
            FROM preguntas_negocio_pendientes WHERE estado = 'pendiente' ORDER BY creado_en ASC
        `,
        prisma.$queryRaw<{ id: number; conversation_id: number; pregunta_original: string; creado_en: Date }[]>`
            SELECT id, conversation_id, pregunta_original, creado_en
            FROM preguntas_sin_match_pendientes WHERE estado = 'pendiente' ORDER BY creado_en ASC
        `,
    ])

    const pendientes: PendienteEquipo[] = [
        ...tecnicas.map((f) => ({
            id: f.id,
            tipo: "tecnica" as const,
            conversationId: Number(f.conversation_id),
            resumen: [f.modelo_moto, f.kit].filter(Boolean).join(" — ") || "(sin modelo/kit identificado)",
            preguntaOriginal: f.pregunta_original,
            modeloMoto: f.modelo_moto || undefined,
            kit: f.kit || undefined,
            creadoEn: f.creado_en.toISOString(),
        })),
        ...precios.map((f) => ({
            id: f.id,
            tipo: "precio" as const,
            conversationId: Number(f.conversation_id),
            resumen: f.producto || "(sin producto identificado)",
            preguntaOriginal: f.pregunta_original,
            creadoEn: f.creado_en.toISOString(),
        })),
        ...negocio.map((f) => ({
            id: f.id,
            tipo: "negocio" as const,
            conversationId: Number(f.conversation_id),
            resumen: f.tema || "(sin tema identificado)",
            preguntaOriginal: f.pregunta_original,
            creadoEn: f.creado_en.toISOString(),
        })),
        ...sinMatch.map((f) => ({
            id: f.id,
            tipo: "sin_match" as const,
            conversationId: Number(f.conversation_id),
            // No hay tema/producto identificado -- es justo lo que significa
            // "sin_match" -- así que el resumen es un recorte de la pregunta.
            resumen: f.pregunta_original.length > 60 ? f.pregunta_original.slice(0, 60) + "…" : f.pregunta_original,
            preguntaOriginal: f.pregunta_original,
            creadoEn: f.creado_en.toISOString(),
        })),
    ].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))

    return { tokenEquipo: tieneTokenEquipo(), pendientes }
}

/**
 * Manda la respuesta como nota privada a la conversación real de Chatwoot.
 *
 * OJO: la nota queda como apunte interno. Cuando n8n estaba prendido, él la
 * leía, aprendía y le contestaba al cliente; hoy no la procesa nadie, así que
 * al cliente hay que contestarle desde el chat en vivo. Por eso tampoco se
 * cierra la pendiente acá: sigue abierta hasta que alguien la resuelva.
 */
export async function responderPendienteEquipo(params: {
    tipo: TipoPendiente
    conversationId: number
    respuesta: string
}) {
    await requireAdmin()
    const respuesta = params.respuesta.trim()
    if (!respuesta) throw new Error("La respuesta no puede quedar vacía")

    await enviarNotaPrivadaChatwoot({
        accountId: ACCOUNT_ID,
        conversationId: params.conversationId,
        content: respuesta,
    })

    revalidatePath("/admin/chatwoot/pendientes")
    return { success: true }
}

/** Hilo real de la conversación (de solo lectura), para dar contexto sin salir de la app. */
export async function getMensajesPendiente(conversationId: number): Promise<MensajeConversacion[]> {
    await requireAdmin()
    return getMensajesConversacion(ACCOUNT_ID, conversationId)
}

/**
 * Responde una pendiente TÉCNICA (compatibilidad) con datos estructurados en vez
 * de texto libre: el Sí/No y la aclaración se guardan tal cual en las tablas de
 * compatibilidad que lee el bot, y se le manda la respuesta al cliente.
 *
 * Antes esto mandaba una nota privada con la marca [[RM_TECNICA:id=...]] y el
 * que aprendía era el workflow de n8n. Con n8n apagado (07/09) esa nota no la
 * leía nadie: el equipo cargaba la respuesta, la pendiente quedaba abierta y el
 * dato se perdía. Ahora el aprendizaje corre acá mismo — el mismo camino que
 * usa el panel de chats en vivo (lib/aprendizaje-compatibilidad.ts).
 */
export async function responderPendienteTecnica(params: {
    id: number
    conversationId: number
    compatible: boolean
    detalle: string
    /** Kit al que corresponde la regla. Si no viene, se deduce de la pendiente. */
    destino?: DestinoCompat
    /** Texto para el cliente. Si no viene, se arma con el veredicto y el detalle. */
    mensajeCliente?: string
}) {
    await requireAdmin()
    const detalle = params.detalle.trim()

    const filas = await prisma.$queryRaw<
        { modelo_moto: string | null; kit: string | null; kit_id: number | null; es_grupo: boolean | null }[]
    >`
        SELECT modelo_moto, kit, kit_id, es_grupo
        FROM preguntas_tecnicas_pendientes WHERE id = ${params.id} LIMIT 1
    `
    const fila = filas[0]
    if (!fila) throw new Error("La pregunta pendiente ya no existe")
    const modeloMoto = (fila.modelo_moto || "").trim()
    if (!modeloMoto) throw new Error("La pendiente no tiene modelo de moto: cargala desde el chat en vivo")

    // El kit puede venir elegido a mano o salir de la pendiente. Las filas viejas
    // de n8n guardaban `kit_id` sin distinguir grupo de pack, así que el nombre
    // manda cuando el id no resuelve.
    let destino = params.destino ?? null
    if (!destino && fila.kit_id != null) {
        const destinos = await listarDestinosCompat()
        const tipo = fila.es_grupo ? "grupo" : "pack"
        destino = destinos.find((d) => d.tipo === tipo && d.id === Number(fila.kit_id)) ?? null
        if (!destino) destino = await resolverDestinoPorNombre(fila.kit, destinos)
    } else if (!destino) {
        destino = await resolverDestinoPorNombre(fila.kit)
    }
    if (!destino) {
        throw new Error(
            `No se pudo identificar a qué kit corresponde "${fila.kit || "(sin kit)"}": respondela desde el chat en vivo, donde se elige a mano.`
        )
    }

    await aprenderCompatibilidad({ destino, modeloMoto, compatible: params.compatible, detalle })

    await prisma.$executeRaw`
        UPDATE preguntas_tecnicas_pendientes SET estado = 'respondida' WHERE id = ${params.id}
    `

    const texto =
        params.mensajeCliente?.trim() ||
        (await armarMensajeCompatibilidad({
            compatible: params.compatible,
            modeloMoto,
            kitNombre: destino.nombre,
            detalle,
        }))

    await enviarMensajeManualChatwoot({
        accountId: ACCOUNT_ID,
        conversationId: params.conversationId,
        content: texto,
    })
    // Contesta un humano: el bot queda pausado en esa charla, igual que cuando se
    // responde desde el chat en vivo.
    await registrarMensajeSalienteEnEspejo(params.conversationId, texto, { pausarBot: true })

    revalidatePath("/admin/chatwoot/pendientes")
    revalidatePath("/admin/chatwoot/chats-vivo")
    return { success: true, mensajeEnviado: texto, kit: destino.nombre }
}
