/**
 * Guardrail y sanitizador determinista de salida.
 * Se ejecuta en código puro sobre cualquier texto generado por la IA
 * antes de ser entregado al cliente, garantizando el cumplimiento estricto
 * de las normas de estilo y tono de Revolución Motos.
 */

// Palabras o modismos que el bot NUNCA debe decir
const REEMPLAZOS_MODISMOS: [RegExp, string][] = [
    [/\bculia[do]s?\b/gi, "amigo"],
    [/\bche\b/gi, ""],
    [/\bchab[oó]n\b/gi, "amigo"],
    [/\bamigazo\b/gi, "amigo"],
    [/\bmaster\b/gi, "amigo"],
    [/\bvieja\b/gi, "amigo"],
    [/\bflaco\b/gi, "amigo"],
    [/\bwey\b/gi, ""],
    [/\bpana\b/gi, "amigo"]
]

// Frases prohibidas que delatan IA
const FRASES_PROHIBIDAS_IA = [
    /soy una inteligencia artificial/gi,
    /soy un bot/gi,
    /como modelo de lenguaje/gi,
    /como asistente virtual/gi,
    /no tengo sentimientos/gi,
    /en qué puedo asistirte hoy/gi
]

// Frases de espera o proceso interno que JAMÁS deben llegar al cliente
const FRASES_PROCESO_INTERNO = [
    /^un momento[,.]?\s*(voy a|que)?\s*(consultar|revisar|verificar|buscar|fijarme).*/gi,
    /^aguarda(me)?\s*(un instante|un momento|un segundo)?[,.]?\s*(voy a|que)?\s*(consultar|revisar|verificar).*/gi,
    /^dame un segundo[,.]?\s*(voy a|que)?\s*(consultar|revisar|verificar).*/gi,
    /^estoy consultando.*/gi,
    /^voy a consultar sobre la compatibilidad.*/gi
]

// Fórmulas de cierre pesadas o robóticas de call center / asistente virtual
const FRASES_CALL_CENTER: [RegExp, string][] = [
    [/si te interesa,?\s*(te)?\s*puedo ayudar(te)?\s*a coordinar la compra[^\n.?!]*(o responder[^\n.?!]*)?(\.?\s*qué te parece\??)?/gi, "Cualquier cosa avisanos y coordinamos."],
    [/puedo ayudar(te)?\s*a coordinar la compra[^\n.?!]*/gi, "Cualquier cosa avisanos y coordinamos."],
    [/responder cualquier otra duda que tengas[.,?!]?\s*(qué te parece\??)?/gi, "Cualquier duda nos avisás."],
    [/responder cualquier duda que tengas[.,?!]?\s*(qué te parece\??)?/gi, "Cualquier duda nos avisás."],
    [/qué te parece\??$/gi, ""],
    [/te gustaría que te reserve uno\??/gi, "Cualquier cosa nos avisás."],
    [/te gustaría que procedamos con la compra\??/gi, "Cualquier duda nos avisás."],
    [/no dudes en consultarme[.,?!]?/gi, "Cualquier duda me avisás."],
    [/quedo a tu (entera\s*)?disposición[.,?!]?/gi, ""],
    [/estoy a tu disposición[.,?!]?/gi, ""],
    [/en qué más (te puedo|puedo)\s*(ayudar|asistir|colaborar)\??/gi, ""]
]

// Corrección obligatoria de tuteo neutro a voseo argentino (ej: Recuerda -> Recordá)
const CORRECCIONES_VOSEO_ARGENTINO: [RegExp, string][] = [
    [/\brecuerda\b/gi, "recordá"],
    [/\bten en cuenta\b/gi, "tené en cuenta"],
    [/\bdime\b/gi, "decime"],
    [/\bdinos\b/gi, "decinos"],
    [/\bhazlo\b/gi, "hacelo"],
    [/\bhaz\b/gi, "hacé"],
    [/\bmira\b/gi, "mirá"],
    [/\bavísame\b/gi, "avisame"],
    [/\bescríbeme\b/gi, "escribime"],
    [/\bpídeme\b/gi, "pedime"],
    [/\bpregúntame\b/gi, "preguntame"],
    [/\bconsúltame\b/gi, "consultame"],
    [/\bcomunícate\b/gi, "comunicate"]
]

export interface ResultadoSanitizacion {
    textoLimpio: string
    modificado: boolean
    alertasIA: boolean
}

export interface OpcionesSanitizacion {
    palabrasProhibidas?: string[]
    permitirBro?: boolean
}

/**
 * Limpia y normaliza el mensaje generado por el LLM
 */
export function sanitizarMensajeSalida(
    texto: string | null | undefined,
    opciones: OpcionesSanitizacion = {}
): ResultadoSanitizacion {
    if (!texto || !texto.trim()) {
        return { textoLimpio: "", modificado: false, alertasIA: false }
    }

    let limpio = texto.trim()
    let modificado = false
    let alertasIA = false

    // 1. Quitar signos de apertura obligatoriamente (¿ y ¡)
    if (/[¿¡]/.test(limpio)) {
        limpio = limpio.replace(/[¿¡]/g, "")
        modificado = true
    }

    // 2. Control contra frases que delatan IA
    for (const regex of FRASES_PROHIBIDAS_IA) {
        if (regex.test(limpio)) {
            alertasIA = true
            limpio = limpio.replace(regex, "")
            modificado = true
        }
    }

    // 2.b Control contra frases de espera o proceso interno (silencio cara al cliente)
    for (const regex of FRASES_PROCESO_INTERNO) {
        if (regex.test(limpio)) {
            // Si el mensaje es solo una frase de espera ("un momento voy a consultar..."), se anula completamente
            return {
                textoLimpio: "",
                modificado: true,
                alertasIA: false
            }
        }
    }

    // 2.c Reemplazo de fórmulas pesadas de call center por cierres naturales de mostrador
    for (const [regex, reemplazo] of FRASES_CALL_CENTER) {
        if (regex.test(limpio)) {
            limpio = limpio.replace(regex, reemplazo)
            modificado = true
        }
    }

    // 2.d Corrección determinista de voseo argentino (ej: Recuerda -> Recordá, Dime -> Decime)
    for (const [regex, reemplazo] of CORRECCIONES_VOSEO_ARGENTINO) {
        if (regex.test(limpio)) {
            limpio = limpio.replace(regex, (match) => {
                const esMayus = match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase()
                return esMayus ? reemplazo.charAt(0).toUpperCase() + reemplazo.slice(1) : reemplazo
            })
            modificado = true
        }
    }

    // 3. Reemplazo o eliminación de modismos no deseados fijos
    for (const [regex, reemplazo] of REEMPLAZOS_MODISMOS) {
        if (regex.test(limpio)) {
            limpio = limpio.replace(regex, reemplazo)
            modificado = true
        }
    }

    // 4. Si el usuario configuró permitirBro === false, eliminar 'bro'
    if (opciones.permitirBro === false) {
        if (/\bbro\b/gi.test(limpio)) {
            limpio = limpio.replace(/\bbro\b/gi, "amigo")
            modificado = true
        }
    }

    // 5. Palabras prohibidas dinámicas configuradas por el usuario desde el admin
    if (opciones.palabrasProhibidas && opciones.palabrasProhibidas.length > 0) {
        for (const palabra of opciones.palabrasProhibidas) {
            const pLimpia = palabra.trim()
            if (!pLimpia) continue
            // Escapar caracteres especiales de regex
            const escapada = pLimpia.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            const rx = new RegExp(`\\b${escapada}\\b`, "gi")
            if (rx.test(limpio)) {
                limpio = limpio.replace(rx, "")
                modificado = true
            }
        }
    }

    // 6. Limpieza de espacios horizontales dobles, puntos duplicados o puntuación huérfana tras los reemplazos
    // PRESERVANDO saltos de línea y párrafos para formato de WhatsApp
    limpio = limpio
        .replace(/\.{2,}/g, ".")
        .replace(/\?{2,}/g, "?")
        .replace(/!{2,}/g, "!")
        .replace(/[^\S\r\n]+/g, " ") // colapsa solo espacios horizontales repetidos (espacio/tab), NO saltos de línea
        .replace(/[^\S\r\n]*\n[^\S\r\n]*/g, "\n") // elimina espacios sobrantes alrededor de un salto de línea
        .replace(/\n{3,}/g, "\n\n") // máximo 2 saltos de línea consecutivos (párrafo limpio)
        .replace(/[^\S\r\n]+([.,?!])/g, "$1") // quita espacio antes de signo de puntuación en la misma línea
        .replace(/^[.,\s]+/, "")
        .trim()

    return {
        textoLimpio: limpio,
        modificado,
        alertasIA
    }
}
