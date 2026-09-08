import { normalizarTexto } from "../nucleo/texto"
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

// Frases prohibidas que delatan IA o filtran datos del sistema
const FRASES_PROHIBIDAS_IA = [
    /soy una inteligencia artificial/gi,
    /soy un bot\b/gi,
    /como modelo de lenguaje/gi,
    /soy un modelo de lenguaje/gi,
    /como asistente virtual/gi,
    /soy un asistente virtual/gi,
    /como ia\b/gi,
    /no tengo sentimientos/gi,
    /en qué puedo asistirte hoy/gi,
    /mis instrucciones (de sistema|son|internas)/gi,
    /mi prompt (de sistema|es|dice)/gi,
    /fui programado para/gi,
    /fui creado por OpenAI/gi
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
    // Pregunta-oferta de relleno al final del mensaje ("querés que te prepare el
    // combo?", "querés que te pase el alias?", "te gustaría que procedamos?").
    // Solo se recorta cuando es la ÚLTIMA oración: las preguntas del embudo
    // ("a qué moto...?", "sabés si es corto o largo?") no son "querés que ...".
    // Cuando definamos las ofertas permitidas, van por el `mensaje_para_agente`
    // de la tool del paso de cierre, no acá.
    [/(^|[.!?]\s+|\n+)\s*(?:quer[eé]s|querr[ií]as|te gustar[ií]a|podr[ií]as|podés)\s+que\s+(?:te|nos|le|lo|la|se\s+lo|se\s+la)?\s*[a-záéíóúñ]+[^\n?]*\?\s*$/gi, "$1"],
    [/no dudes en consultarme[.,?!]?/gi, "Cualquier duda me avisás."],
    [/quedo a tu (entera\s*)?disposición[.,?!]?/gi, ""],
    [/estoy a tu disposición[.,?!]?/gi, ""],
    [/en qué más (te puedo|puedo)\s*(ayudar|asistir|colaborar)\??/gi, ""],
    [/(?:^|\s*)(?:éxitos|exitos|suerte|ojal[aá])\s+(?:con\s+(?:la\s+)?juntada|con\s+(?:la\s+)?junta|juntando(?:\s+(?:la\s+)?plata)?|juntes(?:\s+(?:la\s+)?plata)?|puedas\s+juntar|con\s+el\s+cobro|cobres\s+pronto)[.!]*/gi, ""]
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

// ── Guardrail duro: respuestas que NO pueden llegar al cliente ────────────────
// El modelo a veces filtra su razonamiento interno, texto en inglés, o el
// `mensaje_para_agente` crudo de una herramienta (guía operativa, no un mensaje
// para el cliente). Si algo de esto aparece, NO se limpia — se descarta la
// respuesta entera y se escala a un humano (ver motor.ts).

// Palabras que son inequívocamente inglés (no se cruzan con español).
const PALABRAS_INGLES = [
    "the", "and", "you", "your", "with", "this", "that", "for", "are", "will",
    "should", "must", "need", "before", "after", "follow", "instruction",
    "instructions", "require", "requires", "required", "tool", "tools", "system",
    "answer", "customer", "already", "then", "now", "call", "please", "note",
    "here", "there", "which", "what", "when", "cannot", "can't", "don't", "i'll",
    "i've", "it's", "let", "me", "provide", "response", "message", "user",
]

// Frases meta / de proceso que delatan que es guía interna, no un mensaje.
const FRASES_META_INTERNAS = [
    /\bel sistema (requiere|necesita|me pide|exige|indica) que/i,
    /\b(the system|i) (requires?|need|should|must|will|have to|am required)/i,
    /\bfollow the (tool|system)/i,
    /\bbefore answering\b/i,
    /\b(resolver_variante|consultar_compatibilidad|consultar_catalogo_y_precios|consultar_info_negocio|escalar_a_humano|mensaje_para_agente)\b/i,
    /\bPASO \d+\b/,
    /CAT[ÁA]LOGO OFICIAL/i,
    /ATENCI[ÓO]N VENDEDOR/i,
    /REGLA (DE MOSTRADOR|COMERCIAL|ESTRICTA|DURA|DEL PROYECTO)/i,
    /TEXTO PARA (ENVIAR|EL CLIENTE)/i,
    /\bmensaje oficial cargado\b/i,
    /\b(escal[áa]|escalar) (en silencio|al equipo|a un humano)\b/i,
    /\[(silencio|dry-?run|piloto|reproceso|escalad)/i,
    /\bPROHIBIDO\b/,
    /\bel cliente (ya eligi|todav[ií]a no|a[uú]n no|no mencion|no dio|no aclar)/i,
    // Fuga de la guía interna en español: el modelo NARRA la instrucción en vez
    // de ejecutarla ("Fijate el contrato: tenes que preguntarle exactamente...").
    /\b(fijate|seg[uú][ií]|revis[áa]|respet[áa]|mir[áa])\s+(en\s+)?(el|la|este|esta)\s+(contrato|gu[ií]a|instrucci[oó]n|pauta|consigna)\b/i,
    /\bcontrato de grounding\b/i,
    /\b(el|seg[uú]n el|este)\s+contrato\s+(dice|indica|pide|exige|me pide)/i,
    /\b(ten[eé]s|tengo|deb[eo]|hay)\s+que\s+(preguntar|decir|explicar|responder|contestar)(le|selo)\b/i,
    /\b(pregunt|explic|dec|contest)[aá](le|selo)?\s+(exactamente|textual(mente)?|tal\s+cual|literal(mente)?)\b/i,
    /\bgu[ií]a t[eé]cnica( de taller)?\b/i,
    /\bpregunta[_ ](inicial|variante)\b/i,
    /(^|\n|\.\s)\s*(nota|mensaje|texto|gu[ií]a|instrucci[oó]n|indicaci[oó]n)?\s*para\s+(el\s+|un\s+)?(agente|vendedor|equipo)\b/i,
    /\bel\s+(paso|estado)\s+(del\s+embudo|actual\s+del\s+embudo)\b/i,
    /\bno\s+(le\s+)?vuelvas\s+a\s+preguntar\b/i,
]

/**
 * ¿La respuesta parece razonamiento interno / inglés / guía de herramienta en
 * vez de un mensaje real para el cliente? Si devuelve true, la respuesta se
 * descarta y se escala — NO se intenta limpiar.
 */
export function pareceRespuestaNoConfiable(texto: string | null | undefined): boolean {
    const t = (texto || "").trim()
    if (!t) return false

    for (const rx of FRASES_META_INTERNAS) {
        if (rx.test(t)) return true
    }

    // Detección de inglés: 2+ palabras inequívocamente inglesas como tokens.
    const tokens = t.toLowerCase().match(/[a-z']+/g) || []
    const setIngles = new Set(PALABRAS_INGLES)
    let hits = 0
    const vistas = new Set<string>()
    for (const tok of tokens) {
        if (setIngles.has(tok) && !vistas.has(tok)) {
            vistas.add(tok)
            hits++
            if (hits >= 2) return true
        }
    }

    return false
}

export interface OpcionesSanitizacion {
    palabrasProhibidas?: string[]
    permitirBro?: boolean
    esConversacionEnCurso?: boolean
}

/**
 * Limpia y normaliza el mensaje generado por el LLM
 */
/** Normaliza una oración para compararla: sin tildes, signos ni doble espacio. */
function claveOracion(oracion: string): string {
    return normalizarTexto(oracion)
}

/**
 * Quita del mensaje las oraciones que el bot YA dijo textualmente en sus
 * mensajes anteriores de esta conversación.
 *
 * Por qué existe: las frases de ejemplo del prompt terminaban usándose como
 * plantilla y salían idénticas dos mensajes seguidos ("Le va bien bro,
 * cualquier cosa avisanos y coordinamos." en la conv 3561). Esto NO es una
 * regla de negocio ni de embudo — es higiene de texto — así que vive acá, en el
 * sanitizador determinista, y no suma un párrafo al prompt.
 *
 * Conservador a propósito:
 *   - Solo compara oraciones de 4 palabras o más (no toca "Dale!", "Si bro").
 *   - Nunca deja el mensaje vacío: si todo era repetido, devuelve el original
 *     (que no se mande nada lo decide el motor, no este filtro).
 *   - No toca preguntas: repreguntar algo es legítimo.
 */
export function quitarOracionesYaDichas(texto: string, mensajesPreviosDelBot: string[]): string {
    if (!texto?.trim() || !mensajesPreviosDelBot?.length) return texto

    const yaDichas = new Set<string>()
    for (const previo of mensajesPreviosDelBot) {
        for (const o of (previo || "").split(/(?<=[.!?])\s+|\n+/)) {
            const clave = claveOracion(o)
            if (clave.split(" ").length >= 4) yaDichas.add(clave)
        }
    }
    if (yaDichas.size === 0) return texto

    const lineas = texto.split(/\n/)
    const salida: string[] = []
    for (const linea of lineas) {
        const oraciones = linea.split(/(?<=[.!?])\s+/)
        const conservadas = oraciones.filter((o) => {
            if (o.trim().endsWith("?")) return true // repreguntar es válido
            const clave = claveOracion(o)
            if (clave.split(" ").length < 4) return true
            return !yaDichas.has(clave)
        })
        salida.push(conservadas.join(" ").trim())
    }

    const resultado = salida.join("\n").replace(/\n{3,}/g, "\n\n").trim()
    return resultado.length > 0 ? resultado : texto
}

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

    // 0. Si la conversación ya está en curso (turno 2 en adelante o globos secundarios),
    // remover cualquier saludo inicial residual que el modelo o la plantilla hayan arrastrado
    if (opciones.esConversacionEnCurso) {
        // Incluye los saludos SUELTOS, sin "hola" adelante: las plantillas del
        // catálogo abren con "Como va!" / "Que tal!" y a mitad de charla eso
        // llega igual de robótico que un "Hola!" repetido (conv 3561, ficha del
        // Kit 200 entregada en el turno 8).
        const rxSaludoInicial =
            /^(hola(\s+(bro|amigo|amiga|como va|como andas|buenas|buen dia|buenas tardes|buenas noches))?|buenas(\s+(tardes|dias|noches|bro|amigo))?|buen dia|buenas tardes|buenas noches|c[oó]mo (va|andas|andan|te va)|que tal|qu[eé] hac[eé]s)(\s+(bro|amigo|amiga))?[!.,?\s]*/i
        if (rxSaludoInicial.test(limpio)) {
            limpio = limpio.replace(rxSaludoInicial, "").trim()
            if (limpio.length > 0) {
                limpio = limpio.charAt(0).toUpperCase() + limpio.slice(1)
            }
            modificado = true
        }
    }

    // 0.b Normalizar el signo de peso: "$ 175.000" / "$ 175.000" -> "$175.000" (estilo es-AR de la casa)
    if (/\$[\s ]+\d/.test(limpio)) {
        limpio = limpio.replace(/\$[\s ]+(?=\d)/g, "$")
        modificado = true
    }

    // 1. Quitar signos de apertura obligatoriamente (¿ y ¡)
    if (/[¿¡]/.test(limpio)) {
        limpio = limpio.replace(/[¿¡]/g, "")
        modificado = true
    }

    // 2. Control contra frases que delatan IA
    for (const regex of FRASES_PROHIBIDAS_IA) {
        regex.lastIndex = 0 // los regex son constantes de modulo con flag /g: reset obligatorio
        if (regex.test(limpio)) {
            alertasIA = true
            limpio = limpio.replace(regex, "")
            modificado = true
        }
    }

    // 2.b Control contra frases de espera o proceso interno (silencio cara al cliente)
    for (const regex of FRASES_PROCESO_INTERNO) {
        regex.lastIndex = 0
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
        regex.lastIndex = 0
        const nuevo = limpio.replace(regex, reemplazo).trim()
        if (nuevo !== limpio) {
            limpio = nuevo
            modificado = true
        }
    }

    // 2.d Corrección determinista de voseo argentino (ej: Recuerda -> Recordá, Dime -> Decime)
    for (const [regex, reemplazo] of CORRECCIONES_VOSEO_ARGENTINO) {
        regex.lastIndex = 0
        const nuevo = limpio.replace(regex, (match) => {
            const esMayus = match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase()
            return esMayus ? reemplazo.charAt(0).toUpperCase() + reemplazo.slice(1) : reemplazo
        })
        if (nuevo !== limpio) {
            limpio = nuevo
            modificado = true
        }
    }

    // 3. Reemplazo o eliminación de modismos no deseados fijos
    for (const [regex, reemplazo] of REEMPLAZOS_MODISMOS) {
        regex.lastIndex = 0
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
