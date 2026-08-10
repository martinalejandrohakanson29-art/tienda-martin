"use server"

import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth-guard"

// Carga de kits asistida por chat: workflow n8n aparte ("carga_kit_chat", ver
// n8n-workflows/carga-kit-chat.sql y n8n-workflows/carga_kit_chat.json), no
// toca workflow_mateo. La IA arma un borrador; recién se publica como kit real
// cuando el dueño confirma en la UI (ver guardarKit en kits-publicidad.ts).

const N8N_WEBHOOK_URL = "https://n8n.revolucionmotos.tech/webhook/carga-kit-chat"

export type EstadoBorrador = "en_progreso" | "listo" | "publicado" | "descartado"

export type Borrador = {
    id: number
    estado: EstadoBorrador
    nombre: string | null
    keywords: string | null
    detalle: string | null
    precio: string | null
    envio: string | null
    mensajeBienvenida: string | null
    creadoEn: string
    actualizadoEn: string
}

export type KitBorrador = {
    nombre: string
    keywords: string
    detalle: string
    precio: string
    envio: string
    mensajeBienvenida: string
}

export type RespuestaChat = {
    borradorId: number
    listo: boolean
    mensaje: string
    kit?: KitBorrador
}

async function llamarWebhook(body: Record<string, unknown>): Promise<RespuestaChat> {
    const token = process.env.CARGA_KIT_WEBHOOK_TOKEN
    if (!token) {
        throw new Error(
            "Falta CARGA_KIT_WEBHOOK_TOKEN en el entorno de la app (tiene que ser el mismo valor que en n8n)."
        )
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 35000)

    let response: Response
    try {
        response = await fetch(N8N_WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        })
    } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
            throw new Error("El asistente tardó demasiado en responder. Probá de nuevo.")
        }
        throw new Error("No se pudo conectar con el asistente de carga.")
    } finally {
        clearTimeout(timeoutId)
    }

    if (!response.ok) {
        const detalle = await response.text().catch(() => "")
        throw new Error(`El asistente respondió ${response.status}: ${detalle.slice(0, 300)}`)
    }

    return response.json()
}

export async function iniciarBorrador(): Promise<RespuestaChat> {
    await requireAdmin()
    return llamarWebhook({})
}

export async function enviarMensajeBorrador(borradorId: number, mensaje: string): Promise<RespuestaChat> {
    await requireAdmin()
    const texto = mensaje.trim()
    if (!texto) throw new Error("El mensaje no puede quedar vacío")
    return llamarWebhook({ borradorId, mensaje: texto })
}

export async function listarBorradores(): Promise<Borrador[]> {
    await requireAdmin()
    const filas = await prisma.$queryRaw<
        {
            id: number
            estado: string
            nombre: string | null
            keywords: string | null
            detalle: string | null
            precio: string | null
            envio: string | null
            mensaje_bienvenida: string | null
            creado_en: Date
            actualizado_en: Date
        }[]
    >`
        SELECT id, estado, nombre, keywords, detalle, precio, envio, mensaje_bienvenida, creado_en, actualizado_en
        FROM borradores_kits
        WHERE estado != 'descartado'
        ORDER BY actualizado_en DESC
    `
    return filas.map((f) => ({
        id: f.id,
        estado: f.estado as EstadoBorrador,
        nombre: f.nombre,
        keywords: f.keywords,
        detalle: f.detalle,
        precio: f.precio,
        envio: f.envio,
        mensajeBienvenida: f.mensaje_bienvenida,
        creadoEn: f.creado_en.toISOString(),
        actualizadoEn: f.actualizado_en.toISOString(),
    }))
}

export async function obtenerTurnosBorrador(borradorId: number): Promise<{ role: "human" | "ai"; content: string }[]> {
    await requireAdmin()
    const filas = await prisma.$queryRaw<{ role: string; content: string }[]>`
        SELECT role, content FROM borradores_kits_turnos
        WHERE borrador_id = ${borradorId}
        ORDER BY creado_en ASC
    `
    return filas.map((f) => ({ role: f.role as "human" | "ai", content: f.content }))
}

export async function descartarBorrador(id: number) {
    await requireAdmin()
    await prisma.$executeRaw`UPDATE borradores_kits SET estado = 'descartado', actualizado_en = now() WHERE id = ${id}`
}

export async function marcarBorradorPublicado(id: number) {
    await requireAdmin()
    await prisma.$executeRaw`UPDATE borradores_kits SET estado = 'publicado', actualizado_en = now() WHERE id = ${id}`
}
