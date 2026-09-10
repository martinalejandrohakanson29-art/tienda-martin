import { prisma } from "@/lib/prisma"
import { MENSAJE_INCOMPATIBILIDAD_DEFAULT } from "@/lib/chat-config-constants"

export interface ConfiguracionAgente {
    tonoEstilo: string
    palabrasProhibidas: string[] // palabras a limpiar automáticamente
    permitirBro: boolean // si false, reemplaza "bro" por "amigo" o lo quita
    mensajeIncompatibilidad: string
    openaiApiKey?: string
    deepseekApiKey?: string
    openrouterApiKey?: string
    proveedorActivo?: string
    /**
     * Proveedor suplente para cuando el principal no responde (misma sintaxis
     * que `proveedorActivo`). Vacío = sin red: un turno que falla espera al
     * barrido de entrantes pendientes, 4 minutos después.
     */
    proveedorFallback?: string
    /**
     * Cuánto razona el modelo antes de contestar (`minimal` | `low` | `medium` |
     * `high`), solo para gpt-5 y la serie o. Vacío = no se manda el parámetro y
     * el proveedor aplica su default (`medium`), que es lo que había: ~600
     * tokens de razonamiento invisible por turno, cobrados a precio de salida.
     */
    reasoningEffort?: string
    /**
     * Modo de razonamiento de los modelos Flash de DeepSeek (`enabled` |
     * `disabled`). Los Flash piensan por default y ese razonamiento invisible
     * se paga a precio de SALIDA, así que la tentación es apagarlo: apagado el
     * turno sale la MITAD (US$0,30 contra US$0,75 cada 1000 turnos) y tarda la
     * mitad (3,1s contra 7,0s de latencia promedio).
     *
     * Va en `enabled` igual, porque apagarlo se paga donde duele. Medido 3
     * veces por caso sobre el banco (10/09):
     *   - pensando:  variante por pista de color 3/3, no inventar piezas 3/3,
     *                escalado por dato sin cargar 3/3.
     *   - sin pensar: 1/3, 2/3, 1/3.
     * Es decir, sin pensar el bot afirma cosas que no tiene e informa en vez de
     * derivar — justo lo que no queremos que haga solo. La diferencia de plata
     * es de centavos por cada mil turnos; la de criterio, no.
     *
     * (Lo único que mejora apagado es el pedido de descuento, que sin pensar
     * sostiene el precio 3/3 y pensando escala 0/3. Eso es un agujero del
     * prompt, no del modelo, y se arregla en el prompt.)
     */
    deepseekThinking?: string
    debounceSegundos: number
    debounceActivo: boolean
    /** Demora deliberada antes de enviar la respuesta, para simular una persona escribiendo (no una respuesta automática instantánea). */
    respuestaDelayActivo: boolean
    respuestaDelayMinSeg: number
    respuestaDelayMaxSeg: number
    /** true = el bot-agente responde TODAS las conversaciones (no solo las de bot_agente_piloto). n8n debe estar apagado. */
    botAgenteGlobal: boolean
}

export const CONFIG_DEFAULTS: ConfiguracionAgente = {
    tonoEstilo: "Vendedor de mostrador cordobés amigable, buena onda, conciso y respetuoso. Atendiendo por WhatsApp en Revolución Motos.",
    palabrasProhibidas: ["culiau", "culiao", "che", "chabón", "amigazo", "master", "vieja", "flaco", "wey", "pana"],
    permitirBro: true,
    mensajeIncompatibilidad: MENSAJE_INCOMPATIBILIDAD_DEFAULT,
    openaiApiKey: "",
    deepseekApiKey: "",
    openrouterApiKey: "",
    proveedorActivo: "openai:gpt-5",
    proveedorFallback: "openai:gpt-5", // red para cuando el principal (barato) se cae
    reasoningEffort: "low", // el trabajo difícil lo hacen las tools, no el razonamiento del modelo
    deepseekThinking: "enabled", // pensar cuesta el doble pero sostiene el grounding y el escalado (ver arriba)
    debounceSegundos: 15, // ventana para agrupar una ráfaga del cliente antes de responder (era 60: mucha espera; 3 en "off": partía ráfagas y las respuestas se pisaban)
    debounceActivo: true,
    respuestaDelayActivo: true,
    respuestaDelayMinSeg: 45,
    respuestaDelayMaxSeg: 75,
    botAgenteGlobal: false
}

/**
 * Obtiene la configuración actual del bot desde la base de datos (chat_config)
 */
export async function obtenerConfiguracionAgente(): Promise<ConfiguracionAgente> {
    try {
        const filas = await prisma.$queryRaw<{ clave: string; valor: string }[]>`
            SELECT clave, valor FROM chat_config
        `

        const mapa = new Map<string, string>()
        for (const f of filas || []) {
            mapa.set(f.clave, f.valor)
        }

        const tonoEstilo = mapa.get("tono_estilo_vendedor") || CONFIG_DEFAULTS.tonoEstilo
        const permitirBro = mapa.has("permitir_bro") ? mapa.get("permitir_bro") === "true" : CONFIG_DEFAULTS.permitirBro
        const mensajeIncompatibilidad = mapa.get("mensaje_incompatibilidad") || CONFIG_DEFAULTS.mensajeIncompatibilidad
        const palabrasRaw = mapa.get("palabras_prohibidas")
        let palabrasProhibidas = CONFIG_DEFAULTS.palabrasProhibidas
        if (palabrasRaw) {
            palabrasProhibidas = palabrasRaw
                .split(",")
                .map((p) => p.trim().toLowerCase())
                .filter(Boolean)
        }

        const openaiApiKey = mapa.get("openai_api_key") || process.env.OPENAI_API_KEY || ""
        const deepseekApiKey = mapa.get("deepseek_api_key") || process.env.DEEPSEEK_API_KEY || ""
        const openrouterApiKey = mapa.get("openrouter_api_key") || process.env.OPENROUTER_API_KEY || ""
        const proveedorActivo = mapa.get("proveedor_activo") || CONFIG_DEFAULTS.proveedorActivo
        const proveedorFallback = mapa.has("proveedor_fallback")
            ? (mapa.get("proveedor_fallback") || "").trim()
            : CONFIG_DEFAULTS.proveedorFallback
        // Un valor no válido (ej. "off") deja el parámetro sin mandar y el
        // proveedor usa su default: sirve para comparar A/B desde la base, sin deploy.
        const effortRaw = (mapa.get("reasoning_effort") ?? CONFIG_DEFAULTS.reasoningEffort ?? "").trim().toLowerCase()
        const reasoningEffort = ["minimal", "low", "medium", "high"].includes(effortRaw) ? effortRaw : ""

        const thinkingRaw = (mapa.get("deepseek_thinking") ?? CONFIG_DEFAULTS.deepseekThinking ?? "").trim().toLowerCase()
        const deepseekThinking = ["enabled", "disabled"].includes(thinkingRaw) ? thinkingRaw : "enabled"

        const debounceSegundosRaw = mapa.get("debounce_segundos")
        const debounceSegundos = debounceSegundosRaw ? parseInt(debounceSegundosRaw, 10) || 15 : CONFIG_DEFAULTS.debounceSegundos
        const debounceActivo = mapa.has("debounce_activo")
            ? mapa.get("debounce_activo") === "true"
            : CONFIG_DEFAULTS.debounceActivo

        const respuestaDelayActivo = mapa.has("respuesta_delay_activo")
            ? mapa.get("respuesta_delay_activo") === "true"
            : CONFIG_DEFAULTS.respuestaDelayActivo
        const parseSegPositivo = (clave: string, def: number) => {
            const n = parseInt(mapa.get(clave) || "", 10)
            return Number.isFinite(n) && n >= 0 ? n : def
        }
        let respuestaDelayMinSeg = parseSegPositivo("respuesta_delay_min_seg", CONFIG_DEFAULTS.respuestaDelayMinSeg)
        let respuestaDelayMaxSeg = parseSegPositivo("respuesta_delay_max_seg", CONFIG_DEFAULTS.respuestaDelayMaxSeg)
        if (respuestaDelayMaxSeg < respuestaDelayMinSeg) respuestaDelayMaxSeg = respuestaDelayMinSeg

        const botAgenteGlobal = mapa.get("bot_agente_global") === "true"

        return {
            tonoEstilo,
            palabrasProhibidas,
            permitirBro,
            mensajeIncompatibilidad,
            openaiApiKey,
            deepseekApiKey,
            openrouterApiKey,
            proveedorActivo,
            proveedorFallback,
            reasoningEffort,
            deepseekThinking,
            debounceSegundos,
            debounceActivo,
            respuestaDelayActivo,
            respuestaDelayMinSeg,
            respuestaDelayMaxSeg,
            botAgenteGlobal
        }
    } catch (err) {
        console.error("Error al leer chat_config, usando valores por defecto:", err)
        return CONFIG_DEFAULTS
    }
}

/**
 * Guarda o actualiza un ajuste en chat_config
 */
export async function guardarAjusteConfig(clave: string, valor: string, usuario: string = "admin"): Promise<void> {
    await prisma.$executeRaw`
        INSERT INTO chat_config (clave, valor, actualizado_en, actualizado_por)
        VALUES (${clave}, ${valor}, now(), ${usuario})
        ON CONFLICT (clave) DO UPDATE
        SET valor = EXCLUDED.valor,
            actualizado_en = now(),
            actualizado_por = EXCLUDED.actualizado_por
    `
}
