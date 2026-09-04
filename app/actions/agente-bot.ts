"use server"

import { requireAdmin } from "@/lib/auth-guard"
import { ejecutarTurnoAgente } from "@/bot-agente/motor"
import { MensajeChat, RespuestaAgente } from "@/bot-agente/tipos"
import {
    obtenerConfiguracionAgente,
    guardarAjusteConfig,
    ConfiguracionAgente
} from "@/bot-agente/configuracion"

export async function enviarMensajeSimulador(
    mensaje: string,
    historial: MensajeChat[] = [],
    opciones: { apiKey?: string; modelo?: string; baseUrl?: string } = {}
): Promise<RespuestaAgente> {
    await requireAdmin()

    if (!mensaje || !mensaje.trim()) {
        throw new Error("El mensaje no puede estar vacío.")
    }

    const fs = await import("fs")
    const path = await import("path")
    const logPath = path.join(process.cwd(), "bot-agente", "ultimo-chat.json")

    try {
        const respuesta = await ejecutarTurnoAgente(mensaje, historial, opciones)
        try {
            fs.writeFileSync(
                logPath,
                JSON.stringify(
                    {
                        fecha: new Date().toISOString(),
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
