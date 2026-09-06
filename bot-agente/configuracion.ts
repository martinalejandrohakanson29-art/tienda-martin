import { prisma } from "@/lib/prisma"

export interface ConfiguracionAgente {
    tonoEstilo: string
    palabrasProhibidas: string[] // palabras a limpiar automáticamente
    permitirBro: boolean // si false, reemplaza "bro" por "amigo" o lo quita
    mensajeIncompatibilidad: string
    openaiApiKey?: string
    deepseekApiKey?: string
    openrouterApiKey?: string
    proveedorActivo?: string
    debounceSegundos: number
    debounceActivo: boolean
}

export const CONFIG_DEFAULTS: ConfiguracionAgente = {
    tonoEstilo: "Vendedor de mostrador cordobés amigable, buena onda, conciso y respetuoso. Atendiendo por WhatsApp en Revolución Motos.",
    palabrasProhibidas: ["culiau", "culiao", "che", "chabón", "amigazo", "master", "vieja", "flaco", "wey", "pana"],
    permitirBro: true,
    mensajeIncompatibilidad: "Lamentablemente este kit no es compatible.",
    openaiApiKey: "",
    deepseekApiKey: "",
    openrouterApiKey: "",
    proveedorActivo: "openai:gpt-4o-mini",
    debounceSegundos: 60,
    debounceActivo: true
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

        const debounceSegundosRaw = mapa.get("debounce_segundos")
        const debounceSegundos = debounceSegundosRaw ? parseInt(debounceSegundosRaw, 10) || 60 : CONFIG_DEFAULTS.debounceSegundos
        const debounceActivo = mapa.has("debounce_activo")
            ? mapa.get("debounce_activo") === "true"
            : CONFIG_DEFAULTS.debounceActivo

        return {
            tonoEstilo,
            palabrasProhibidas,
            permitirBro,
            mensajeIncompatibilidad,
            openaiApiKey,
            deepseekApiKey,
            openrouterApiKey,
            proveedorActivo,
            debounceSegundos,
            debounceActivo
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
