/**
 * CIERRE SOCIAL: cuando la charla ya terminó y lo que sigue es puro saludo.
 *
 * El problema (convs 3985, 3988, 3960, 11/09): el bot siempre se quedaba con la
 * última palabra. El cliente agradecía, el bot contestaba "cualquier cosa me
 * escribís", el cliente devolvía "dale mil gracias buen finde", el bot contestaba
 * otra vez, el cliente mandaba tres emojis de bíceps... y el bot contestaba otra
 * vez. En un mostrador real eso no pasa: al "gracias" se le devuelve UNA
 * cortesía y después se deja ir al cliente.
 *
 * REGLA (una sola, deliberadamente angosta):
 *   - Un mensaje que es SOLO cortesía se contesta una vez.
 *   - Si el bot ya se despidió en su mensaje anterior, el siguiente mensaje de
 *     pura cortesía va a SILENCIO.
 *   - Un mensaje que es solo emojis/reacción va siempre a silencio en una charla
 *     ya empezada: no hay nada que contestar.
 *
 * Por qué es seguro: el corte NO depende solo de reconocer la cortesía del
 * cliente (eso solo sería frágil: un "si" puede ser la respuesta a una
 * pregunta). Depende de que el mensaje ANTERIOR DEL BOT haya sido una despedida
 * pelada — sin datos, sin precio y sin pregunta abierta. Si el bot todavía tenía
 * algo pendiente, nunca se calla.
 */

import { normalizarTexto } from "./texto"

/**
 * Palabras que por sí solas no piden respuesta: cortesía, asentimiento y
 * despedida. Un mensaje hecho 100% de estas palabras no aporta nada nuevo.
 */
const PALABRAS_DE_CORTESIA = new Set([
    // agradecimiento
    "gracias", "grasias", "gracia", "graciad", "muchas", "muchisimas", "mil", "agradezco", "agradecido", "te", "les",
    // asentimiento
    "dale", "dele", "ok", "oka", "okey", "okay", "oki", "okis", "listo", "lista", "perfecto", "perfe",
    "barbaro", "buenisimo", "buenismo", "genial", "joya", "excelente", "de", "una", "tal", "cual",
    "si", "sisi", "sip", "ya", "esta", "bien", "bueno", "buena", "obvio", "claro", "correcto", "ah",
    // despedida
    "chau", "chao", "adios", "saludos", "abrazo", "abrazos", "suerte", "exitos", "bendiciones",
    "nos", "vemos", "hasta", "luego", "pronto", "seguimos", "estamos", "en", "contacto", "cualquier", "cosa",
    "buen", "buenos", "buenas", "finde", "fin", "semana", "dia", "tarde", "noche", "tardes", "noches", "dias",
    // vocativos / relleno
    "bro", "amigo", "hermano", "hno", "capo", "maestro", "master", "genio", "crack", "loco", "che",
    "muy", "todo", "nada", "y", "a", "vos", "igualmente", "igual", "para", "lo", "mismo", "por", "el", "la", "aviso", "aviso"
])

/** Rango de emojis, símbolos y modificadores de tono de piel. */
const RX_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F3FB}-\u{1F3FF}\u{200D}\u{20E3}]/gu

/** Deja solo letras/números: saca emojis, puntuación y espacios de más. */
function soloTexto(mensaje: string | null | undefined): string {
    return normalizarTexto((mensaje || "").replace(RX_EMOJI, " "))
}

/**
 * El mensaje es solo emojis o signos (👍, 💪🏼💪🏼, "!!", "🙏") — sin una sola
 * letra. No hay pregunta ni dato adentro.
 */
export function esSoloEmojiOReaccion(mensaje: string | null | undefined): boolean {
    const crudo = (mensaje || "").trim()
    if (!crudo) return false
    if (crudo.length > 40) return false
    return soloTexto(crudo).length === 0
}

/**
 * El mensaje del cliente es puro trámite social: gracias / dale / buen finde /
 * estamos en contacto. Sin preguntas y sin ningún término que aporte contenido.
 */
export function esCierreSocialDelCliente(mensaje: string | null | undefined): boolean {
    const crudo = (mensaje || "").trim()
    if (!crudo) return false
    if (crudo.length > 70) return false
    // Una pregunta nunca es un cierre, por más corta que sea ("dale y el envío?").
    if (/[?¿]/.test(crudo)) return false
    if (esSoloEmojiOReaccion(crudo)) return true

    const texto = soloTexto(crudo)
    if (!texto) return false
    // Un número suelto casi siempre es un dato (cilindrada, modelo, cantidad).
    if (/\d/.test(texto)) return false

    const palabras = texto.split(" ").filter(Boolean)
    if (!palabras.length || palabras.length > 8) return false
    return palabras.every((p) => PALABRAS_DE_CORTESIA.has(p))
}

/**
 * El último mensaje del BOT fue una despedida pelada: corto, sin pregunta, sin
 * datos (precios, medidas) y con alguna fórmula de cierre de mostrador.
 *
 * Es la mitad que hace segura a la regla: mientras el bot haya dicho algo con
 * sustancia (un precio, una compatibilidad, una pregunta), el cliente todavía
 * merece respuesta.
 */
export function esDespedidaDelBot(mensaje: string | null | undefined): boolean {
    const crudo = (mensaje || "").trim()
    if (!crudo) return false
    if (crudo.length > 120) return false
    // Si el bot preguntó algo, la charla sigue abierta: el "dale" del cliente
    // puede ser la respuesta.
    if (/\?/.test(crudo)) return false
    // Precio, medida o cualquier dato duro = el mensaje tenía contenido.
    if (/\d/.test(crudo)) return false

    const texto = soloTexto(crudo)
    if (!texto) return false

    const formulasDeCierre = [
        /\bcualquier (cosa|duda|consulta)\b/,
        /\b(me|nos) (escribis|avisas|chiflas|hablas|escribias)\b/,
        /\b(te )?(esperamos|quedamos a la espera)\b/,
        /\bavisame\b/,
        /\bcuando quieras\b/,
        /\bbuen (finde|fin de semana|dia|domingo|sabado)\b/,
        /\babrazo\b/,
        /\bsuerte\b/,
        /\bnos vemos\b/,
        /\b(chau|saludos)\b/,
        /\bpor ac[a]? (andamos|estamos)\b/
    ]
    if (formulasDeCierre.some((rx) => rx.test(texto))) return true

    // "De una!", "Dale bro!", "Listo!" a secas también cierran.
    return esCierreSocialDelCliente(crudo)
}

/**
 * El modelo respondió "no te entendí, me lo repetís?". Sirve cuando el local ya
 * se despidió: repreguntar por un "Metta" o un "jeje" solo alarga la charla
 * (conv 3985).
 */
export function pareceNoTeEntendi(mensaje: string | null | undefined): boolean {
    const texto = soloTexto(mensaje)
    if (!texto) return false
    if (texto.length > 120) return false
    return (
        /\bno (te |lo )?(entiendo|entendi|entendimos|cazo)\b/.test(texto) ||
        /\b(me lo|melo) (repetis|repetias|podes repetir)\b/.test(texto) ||
        /\bcomo (seria|es)\b.*\bno (entendi|entiendo)\b/.test(texto)
    )
}

/**
 * Decisión completa: ¿este turno es un saludo de despedida sobre una charla que
 * el bot ya cerró? `ultimoDelBot` es el último mensaje público que mandó el bot.
 */
export function debeCallarPorCierreSocial(
    mensajeCliente: string | null | undefined,
    ultimoDelBot: string | null | undefined,
    hayHistorial: boolean
): boolean {
    if (!hayHistorial) return false
    // Reacción pelada (emojis, "jaja", "👍"): nunca necesita respuesta a mitad
    // de una charla ya contestada.
    if (esSoloEmojiOReaccion(mensajeCliente)) return true
    if (!esCierreSocialDelCliente(mensajeCliente)) return false
    return esDespedidaDelBot(ultimoDelBot)
}
