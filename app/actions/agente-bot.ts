"use server"

import { requireAdmin } from "@/lib/auth-guard"
import { ejecutarTurnoAgente } from "@/bot-agente/motor"
import { correrBancoPruebas, ReporteBanco } from "@/bot-agente/pruebas/correr-banco"
import { limpiarEstadoConversacion } from "@/bot-agente/nucleo/estado-persistente"
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
        const respuesta = await ejecutarTurnoAgente(mensaje, historial, { ...opciones, estadoKey: sessionId })

        const nuevoHistorial = [
            ...historial,
            { rol: "user", contenido: mensaje },
            { rol: "assistant", contenido: respuesta.mensajeFinal }
        ]

        // 1. Guardar en Postgres (para monitoreo y soporte en tiempo real)
        try {
            await prisma.$executeRawUnsafe(
                `INSERT INTO bot_simulador_conversaciones
                 (session_id, usuario, mensaje_usuario, respuesta_bot, herramientas, escalado_humano, latencia_ms, tokens, historial_completo, foto_url, created_at)
                 VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9::jsonb, $10, NOW())`,
                sessionId,
                username,
                mensaje,
                respuesta.mensajeFinal,
                JSON.stringify(respuesta.herramientasEjecutadas || []),
                respuesta.escaladoHumano,
                respuesta.latenciaMs,
                JSON.stringify(respuesta.tokensUsados || {}),
                JSON.stringify(nuevoHistorial),
                respuesta.fotoUrl || null
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
            `SELECT id, session_id, usuario, mensaje_usuario, respuesta_bot, herramientas, escalado_humano, latencia_ms, tokens, historial_completo, foto_url, created_at
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
        await limpiarEstadoConversacion(sessionId)
        return { success: true }
    } catch (e: any) {
        return { success: false, error: e.message }
    }
}

/**
 * Corre el banco de pruebas real (bot-agente/pruebas/casos-reales.ts) contra el
 * motor y devuelve el reporte de pasa/falla por caso. Red de seguridad
 * anti-regresion: correr antes de dar por terminado cualquier cambio del bot.
 */
export async function correrBancoPruebasAction(opciones: {
    apiKey?: string
    modelo?: string
    baseUrl?: string
    soloIds?: string[]
} = {}): Promise<ReporteBanco> {
    await requireAdmin()
    return correrBancoPruebas(
        {
            apiKey: opciones.apiKey?.trim() || undefined,
            modelo: opciones.modelo || undefined,
            baseUrl: opciones.baseUrl?.trim() || undefined
        },
        opciones.soloIds
    )
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
    debounceSegundos?: number
    debounceActivo?: boolean
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
        if (data.debounceSegundos !== undefined) {
            await guardarAjusteConfig("debounce_segundos", String(data.debounceSegundos), username)
        }
        if (data.debounceActivo !== undefined) {
            await guardarAjusteConfig("debounce_activo", data.debounceActivo ? "true" : "false", username)
        }

        return { success: true }
    } catch (err: any) {
        console.error("Error al guardar configuración del agente:", err)
        return { success: false, error: err.message || "Error al guardar configuración" }
    }
}

export async function probarConexionModeloAction(data: {
    apiKey: string
    modelo: string
    baseUrl?: string
}): Promise<{ ok: boolean; mensaje: string; latenciaMs?: number }> {
    await requireAdmin()
    const inicio = Date.now()
    try {
        const rawBase = data.baseUrl?.trim() || "https://api.openai.com/v1"
        const cleanBaseUrl = rawBase.replace(/\/chat\/completions\/?$/, "").replace(/\/$/, "")
        const url = `${cleanBaseUrl}/chat/completions`

        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 15_000)

        // Modelos de razonamiento de OpenAI (gpt-5*, o1/o3/o4): no aceptan `temperature`
        // distinto del default y usan `max_completion_tokens` en vez de `max_tokens`.
        const modeloNorm = data.modelo.trim().toLowerCase()
        const esRazonador = /(^|\/)(gpt-5|o1|o3|o4)([.-]|$)/.test(modeloNorm)
        const cuerpo: Record<string, any> = {
            model: data.modelo.trim(),
            messages: [{ role: "user", content: "hola" }]
        }
        if (esRazonador) {
            cuerpo.max_completion_tokens = 16
        } else {
            cuerpo.max_tokens = 10
            cuerpo.temperature = 0
        }

        const res = await fetch(url, {
            method: "POST",
            signal: ctrl.signal,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${data.apiKey.trim()}`
            },
            body: JSON.stringify(cuerpo)
        })
        clearTimeout(timer)

        const latenciaMs = Date.now() - inicio

        if (!res.ok) {
            const errText = await res.text()
            let mensajeLimpio = errText
            try {
                const parsed = JSON.parse(errText)
                mensajeLimpio = parsed.error?.message || parsed.message || errText
            } catch {
                // mantener texto original
            }
            return {
                ok: false,
                mensaje: `Error ${res.status}: ${mensajeLimpio.slice(0, 250)}`,
                latenciaMs
            }
        }

        const json = await res.json()
        const respuesta = json.choices?.[0]?.message?.content || "(OK)"
        return {
            ok: true,
            mensaje: `Conexión exitosa con ${data.modelo} (${latenciaMs}ms). Respuesta de prueba: "${respuesta.trim().slice(0, 50)}"`,
            latenciaMs
        }
    } catch (err: any) {
        return {
            ok: false,
            mensaje: `Error de conexión: ${err.message || String(err)}`,
            latenciaMs: Date.now() - inicio
        }
    }
}

