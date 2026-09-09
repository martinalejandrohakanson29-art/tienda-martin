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
    /**
     * Escalado PARCIAL: una parte de la ráfaga quedó derivada al equipo, pero
     * otra se resolvió con datos de herramienta y sí se le contesta al cliente.
     * `mensajeFinal` viene con texto aunque `escaladoHumano` sea true — quien
     * consume el turno debe enviarlo igual (ver `lib/bot-agente-tiempo-real.ts`).
     */
    escaladoParcial?: boolean
    /** Tiempo de procesamiento en milisegundos */
    latenciaMs: number
    /**
     * Tokens utilizados en el turno, sumados sobre todos los pasos del loop
     * ReAct. Es lo que permite atribuir el gasto real: sin esto el costo diario
     * solo se veia en la factura del proveedor, sin saber que turno lo genero.
     */
    tokensUsados?: {
        prompt: number
        completion: number
        total: number
        /**
         * Parte del prompt que el proveedor sirvio desde su cache (90% mas
         * barata en OpenAI). Es el termometro de si el prefijo estable
         * (prompt de sistema + definiciones de tools) se esta reusando:
         * si esto queda en 0 turno tras turno, algo variable se colo arriba
         * del prompt y rompio el prefijo.
         */
        cacheados: number
        /**
         * Tokens de razonamiento interno (gpt-5 / serie o). No se ven en la
         * respuesta pero se pagan a precio de salida, que es 8x el de entrada:
         * es la partida mas cara del turno y la que controla `reasoningEffort`.
         */
        razonamiento: number
        /** Pasos del loop ReAct que consumio el turno (1 = respondio directo). */
        pasos: number
        /** Modelo que efectivamente atendio el turno (puede ser el suplente). */
        modelo: string
        /**
         * true si el proveedor principal se cayo y contesto el suplente. Es el
         * contador de confiabilidad del proveedor barato: si esto empieza a
         * aparecer seguido, el ahorro se esta pagando en latencia y en turnos
         * que termina cubriendo el modelo caro.
         */
        fallback?: boolean
    }
}
