"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guard"
import { enviarNotaPrivadaChatwoot, tieneTokenEquipo } from "@/lib/chatwoot-bot"

// Bandeja unificada de las preguntas que el bot escaló al equipo (nota privada
// en Chatwoot) porque no tenía el dato a mano. Responder desde acá manda esa
// misma nota privada a la conversación real; el workflow de n8n la procesa
// igual que si alguien la hubiera escrito a mano en Chatwoot (extrae el dato,
// lo guarda, y le contesta al cliente solo). Ver preguntas_tecnicas_pendientes
// / preguntas_precio_pendientes / preguntas_negocio_pendientes y el nodo
// "¿Es respuesta de mi equipo?" del workflow.

export type TipoPendiente = "tecnica" | "precio" | "negocio"

export type PendienteEquipo = {
    id: number
    tipo: TipoPendiente
    conversationId: number
    resumen: string
    preguntaOriginal: string
    creadoEn: string
}

const ACCOUNT_ID = 1

export type PanelPendientes = {
    tokenEquipo: boolean
    pendientes: PendienteEquipo[]
}

export async function listarPendientesEquipo(): Promise<PanelPendientes> {
    await requireAdmin()

    const [tecnicas, precios, negocio] = await Promise.all([
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
    ])

    const pendientes: PendienteEquipo[] = [
        ...tecnicas.map((f) => ({
            id: f.id,
            tipo: "tecnica" as const,
            conversationId: Number(f.conversation_id),
            resumen: [f.modelo_moto, f.kit].filter(Boolean).join(" — ") || "(sin modelo/kit identificado)",
            preguntaOriginal: f.pregunta_original,
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
    ].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn))

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
