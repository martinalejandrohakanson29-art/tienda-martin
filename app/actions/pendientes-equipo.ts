"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guard"
import {
    enviarNotaPrivadaChatwoot,
    tieneTokenEquipo,
    getMensajesConversacion,
    type AdjuntoConversacion,
    type MensajeConversacion,
} from "@/lib/chatwoot-bot"

export type { MensajeConversacion, AdjuntoConversacion }

// Bandeja unificada de las preguntas que el bot escaló al equipo (nota privada
// en Chatwoot) porque no tenía el dato a mano. Responder desde acá manda esa
// misma nota privada a la conversación real; el workflow de n8n la procesa
// igual que si alguien la hubiera escrito a mano en Chatwoot (extrae el dato,
// lo guarda, y le contesta al cliente solo). Ver preguntas_tecnicas_pendientes
// / preguntas_precio_pendientes / preguntas_negocio_pendientes y el nodo
// "¿Es respuesta de mi equipo?" del workflow.

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
 * No marca acá el "estado" de la pregunta: eso lo hace el workflow al
 * procesar la nota (puede tardar unos segundos), así que la fila sigue
 * apareciendo como pendiente hasta que se actualice sola.
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
 * de texto libre. Sigue mandando una nota privada como siempre — así el
 * workflow de n8n la procesa por el mismo camino de hoy (nada cambia en cómo
 * le llega la respuesta al cliente) — pero la nota lleva una marca fija al
 * principio ([[RM_TECNICA:id=...;compatible=...]]) que un paso nuevo, sin IA,
 * del workflow reconoce y usa para guardar EXACTAMENTE compatible/detalle acá
 * elegidos en `compatibilidades`, sin que un modelo redacte/repita cosas de más.
 * Notas escritas a mano en Chatwoot (sin esta marca) siguen yendo por el
 * camino viejo con IA, sin cambios.
 */
export async function responderPendienteTecnica(params: {
    id: number
    conversationId: number
    compatible: boolean
    detalle: string
}) {
    await requireAdmin()
    const detalle = params.detalle.trim()
    const marca = `[[RM_TECNICA:id=${params.id};compatible=${params.compatible}]]`
    const contenido = detalle ? `${marca}\n${detalle}` : marca

    await enviarNotaPrivadaChatwoot({
        accountId: ACCOUNT_ID,
        conversationId: params.conversationId,
        content: contenido,
    })

    revalidatePath("/admin/chatwoot/pendientes")
    return { success: true }
}
