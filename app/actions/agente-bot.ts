"use server"

import { requireAdmin } from "@/lib/auth-guard"
import { ejecutarTurnoAgente } from "@/bot-agente/motor"
import { MensajeChat, RespuestaAgente } from "@/bot-agente/tipos"
import {
    obtenerConfiguracionAgente,
    guardarAjusteConfig,
    ConfiguracionAgente
} from "@/bot-agente/configuracion"

import { prisma } from "@/lib/prisma"

export async function enviarMensajeSimulador(
    mensaje: string,
    historial: MensajeChat[] = [],
    opciones: { apiKey?: string; modelo?: string; baseUrl?: string; sessionId?: string } = {}
): Promise<RespuestaAgente> {
    const session = await requireAdmin()
    const username = (session?.user as any)?.username || "admin"

    if (!mensaje || !mensaje.trim()) {
        throw new Error("El mensaje no puede estar vacío.")
    }

    const sessionId = opciones.sessionId || "sesion-activa"
    const fs = await import("fs")
    const path = await import("path")
    const logPath = path.join(process.cwd(), "bot-agente", "ultimo-chat.json")

    try {
        const respuesta = await ejecutarTurnoAgente(mensaje, historial, opciones)

        const nuevoHistorial = [
            ...historial,
            { rol: "user", contenido: mensaje },
            { rol: "assistant", contenido: respuesta.mensajeFinal }
        ]

        // 1. Guardar en Postgres (para monitoreo y soporte en tiempo real)
        try {
            await prisma.$executeRawUnsafe(
                `INSERT INTO bot_simulador_conversaciones 
                 (session_id, usuario, mensaje_usuario, respuesta_bot, herramientas, escalado_humano, latencia_ms, tokens, historial_completo, created_at)
                 VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9::jsonb, NOW())`,
                sessionId,
                username,
                mensaje,
                respuesta.mensajeFinal,
                JSON.stringify(respuesta.herramientasEjecutadas || []),
                respuesta.escaladoHumano,
                respuesta.latenciaMs,
                JSON.stringify(respuesta.tokensUsados || {}),
                JSON.stringify(nuevoHistorial)
            )
        } catch (dbErr) {
            console.error("Error guardando en bot_simulador_conversaciones:", dbErr)
        }

        // 2. Guardar en archivo local (backup)
        try {
            fs.writeFileSync(
                logPath,
                JSON.stringify(
                    {
                        fecha: new Date().toISOString(),
                        usuario: username,
                        sessionId,
                        mensajeUsuario: mensaje,
                        historial,
                        opciones,
                        respuesta
                    },
                    null,
                    2
                )
            )
        } catch (e) {
            console.error("Error guardando ultimo-chat.json:", e)
        }
        return respuesta
    } catch (error: any) {
        try {
            fs.writeFileSync(
                logPath,
                JSON.stringify(
                    {
                        fecha: new Date().toISOString(),
                        usuario: username,
                        sessionId,
                        mensajeUsuario: mensaje,
                        historial,
                        opciones,
                        error: error.message || String(error)
                    },
                    null,
                    2
                )
            )
        } catch (e) {
            console.error("Error guardando ultimo-chat.json error:", e)
        }
        throw error
    }
}

export async function obtenerHistorialSimuladorAction(sessionId: string = "sesion-activa") {
    await requireAdmin()
    try {
        const filas = await prisma.$queryRawUnsafe<any[]>(
            `SELECT id, session_id, usuario, mensaje_usuario, respuesta_bot, herramientas, escalado_humano, latencia_ms, tokens, historial_completo, created_at 
             FROM bot_simulador_conversaciones 
             WHERE session_id = $1 
             ORDER BY created_at ASC`,
            sessionId
        )
        return filas
    } catch (e) {
        console.error("Error obteniendo historial simulador:", e)
        return []
    }
}

export async function limpiarHistorialSimuladorAction(sessionId: string = "sesion-activa") {
    await requireAdmin()
    try {
        await prisma.$executeRawUnsafe(
            `DELETE FROM bot_simulador_conversaciones WHERE session_id = $1`,
            sessionId
        )
        return { success: true }
    } catch (e: any) {
        return { success: false, error: e.message }
    }
}

export async function getConfiguracionAgenteAction(): Promise<ConfiguracionAgente> {
    await requireAdmin()
    return obtenerConfiguracionAgente()
}

export async function guardarConfiguracionAgenteAction(data: {
    tonoEstilo: string
    palabrasProhibidas: string
    permitirBro: boolean
    mensajeIncompatibilidad: string
    openaiApiKey?: string
    deepseekApiKey?: string
    openrouterApiKey?: string
    proveedorActivo?: string
}): Promise<{ success: boolean; error?: string }> {
    const session = await requireAdmin()
    const username = (session?.user as any)?.username || "admin"

    try {
        await guardarAjusteConfig("tono_estilo_vendedor", data.tonoEstilo.trim(), username)
        await guardarAjusteConfig("palabras_prohibidas", data.palabrasProhibidas.trim(), username)
        await guardarAjusteConfig("permitir_bro", data.permitirBro ? "true" : "false", username)
        await guardarAjusteConfig("mensaje_incompatibilidad", data.mensajeIncompatibilidad.trim(), username)

        if (data.openaiApiKey !== undefined) {
            await guardarAjusteConfig("openai_api_key", data.openaiApiKey.trim(), username)
        }
        if (data.deepseekApiKey !== undefined) {
            await guardarAjusteConfig("deepseek_api_key", data.deepseekApiKey.trim(), username)
        }
        if (data.openrouterApiKey !== undefined) {
            await guardarAjusteConfig("openrouter_api_key", data.openrouterApiKey.trim(), username)
        }
        if (data.proveedorActivo) {
            await guardarAjusteConfig("proveedor_activo", data.proveedorActivo.trim(), username)
        }

        return { success: true }
    } catch (err: any) {
        console.error("Error al guardar configuración del agente:", err)
        return { success: false, error: err.message || "Error al guardar configuración" }
    }
}
