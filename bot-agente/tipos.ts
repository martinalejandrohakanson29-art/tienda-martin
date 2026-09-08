/**
 * Tipos e interfaces del Agente de WhatsApp para Revolución Motos
 */

export type RolMensaje = "system" | "user" | "assistant" | "tool"

export interface MensajeChat {
    rol: RolMensaje
    contenido: string
    nombre?: string
    tool_call_id?: string
    tool_calls?: LlamadaHerramientaLLM[]
}

export interface LlamadaHerramientaLLM {
    id: string
    type: "function"
    function: {
        name: string
        arguments: string // JSON stringified
    }
}

export interface ParametroPropiedad {
    type: string
    description: string
    enum?: string[]
}

export interface DefinicionHerramienta {
    type: "function"
    function: {
        name: string
        description: string
        parameters: {
            type: "object"
            properties: Record<string, ParametroPropiedad>
            required: string[]
        }
    }
}

export interface EjecutorHerramienta<TArgs = any, TResult = any> {
    definicion: DefinicionHerramienta
    ejecutar: (args: TArgs) => Promise<TResult>
}

export interface HerramientaEjecutadaInfo {
    nombre: string
    argumentos: Record<string, any>
    resultado: any
}

export interface RespuestaAgente {
    /** Mensaje de texto a enviar al cliente. Si es null, el bot debe guardar silencio */
    mensajeFinal: string | null
    /** Lista de mensajes cuando la respuesta se emite en ráfaga (separados por pausas de tipeo humano) */
    mensajesFinales?: string[]
    /** Foto del kit/combo a adjuntar junto con el mensaje de bienvenida (match exacto o descubierto por el LLM) */
    fotoUrl?: string | null
    /** Lista de herramientas que la IA ejecutó durante este turno */
    herramientasEjecutadas: HerramientaEjecutadaInfo[]
    /** Indica si la consulta requirió escalar a un humano en silencio */
    escaladoHumano: boolean
    /** Motivo por el cual se escaló a humano, si aplica */
    motivoEscalado?: string
    /**
     * true si el motor YA persistió el pendiente en la bandeja del equipo. Quien
     * consume el turno (el piloto en vivo) no debe volver a llamar a
     * `escalarAHumano`: duplicaba la fila en el panel (conv 3599).
     */
    escaladoPersistido?: boolean
    /** Tiempo de procesamiento en milisegundos */
    latenciaMs: number
    /** Tokens utilizados en la llamada (estimados o reales del proveedor) */
    tokensUsados?: {
        prompt: number
        completion: number
        total: number
    }
}
