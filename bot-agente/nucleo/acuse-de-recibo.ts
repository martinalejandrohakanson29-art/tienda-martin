/**
 * ACUSE DE RECIBO: el cliente contesta "bueno", "d1", "sale meta" a un pedido
 * que le dejamos nosotros. No hay nada que responder.
 *
 * El problema (convs 4172 y 4206, 14-15/09): el bot le pedía al cliente que
 * fuera a medir la leva ("fijate eso y me decís"), el cliente asentía con una
 * palabra de jerga que el modelo no conocía, y el bot improvisaba:
 *   - conv 4172: "Bueno" + "D1"  ->  "No te entendí el 'D1' 😅 Contame qué
 *     necesitás". El cliente tuvo que aclarar que "D1 es como decir bueno".
 *   - conv 4206: "Sale meta"     ->  otra vez el sermón de que sin la medida no
 *     hay precio, como si el cliente no hubiera entendido.
 *
 * En los dos casos la pelota YA estaba del lado del cliente: el turno correcto
 * es no decir nada y esperar el dato. Callarse cubre además toda la jerga que
 * no está en ninguna lista ("arre", "de10", "tuki"): mientras el mensaje no
 * traiga una pregunta ni un dato, no hay respuesta que dar.
 *
 * REGLA (angosta, dos mitades que tienen que darse juntas):
 *   1. El cliente mandó SOLO asentimiento o una promesa de traer el dato
 *      ("bueno", "sale meta", "dale después lo mido y te aviso").
 *   2. El último mensaje del bot dejó un pedido pendiente: le pidió al cliente
 *      que mida / averigüe / confirme algo y se lo diga.
 *
 * Por qué es seguro: si el bot había ofrecido algo con respuesta sí/no ("te lo
 * reservo?", "te paso el link?"), un "dale" SÍ significa algo y la regla no
 * aplica. Y si el mensaje trae un término que no es asentimiento puro (una
 * medida, una moto, un pedido), tampoco.
 *
 * Es el hermano de [cierre-social]: aquel corta cuando la charla ya terminó,
 * este cuando la charla sigue pero el próximo movimiento es del cliente.
 */

import { normalizarTexto } from "./texto"

/**
 * Todo lo que un cliente puede mandar sin aportar información nueva: asentir,
 * agradecer y prometer que después trae el dato.
 *
 * Deliberadamente NO incluye nada que pueda ser un dato (medidas, cilindradas,
 * modelos): el filtro exige que TODAS las palabras del mensaje estén acá.
 */
const PALABRAS_DE_ASENTIMIENTO = new Set([
    // asentimiento y jerga de asentimiento
    "dale", "dele", "d1", "ok", "oka", "okey", "okay", "oki", "okis", "listo", "lista", "listorti",
    "sale", "meta", "va", "vale", "arre", "bueno", "buena", "bien", "esta", "si", "sisi", "sip", "obvio",
    "claro", "correcto", "perfecto", "perfe", "barbaro", "buenisimo", "genial", "joya", "excelente",
    "tal", "cual", "de", "una", "entendido", "entiendo", "anotado", "copiado", "ah", "ahh", "ya",
    // agradecimiento (un "gracias" pegado al asentimiento no cambia nada)
    "gracias", "grasias", "muchas", "muchisimas", "mil", "agradezco", "te", "les",
    // promesa de traer el dato: "después lo mido y te aviso"
    "voy", "a", "lo", "la", "los", "las", "le", "me", "mi", "fijo", "fijar", "fijarme", "fijare",
    "mido", "medir", "medirlo", "medirla", "veo", "ver", "verlo", "chequeo", "chequear", "reviso",
    "revisar", "desarmo", "desarmar", "pregunto", "preguntar", "averiguo", "averiguar", "confirmo",
    "confirmar", "aviso", "avisar", "avisare", "digo", "decir", "paso", "pasar", "mando",
    "cuando", "pueda", "tenga", "sepa", "despues", "luego", "ahora", "hoy", "manana", "rato",
    "mas", "tarde", "al", "el", "y", "en", "un", "unos", "dias", "dia", "finde", "que", "lu",
    // vocativos / relleno
    "bro", "amigo", "hermano", "hno", "capo", "maestro", "genio", "crack", "loco", "che", "muy", "todo"
])

/** Rango de emojis y modificadores (mismo criterio que cierre-social). */
const RX_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F3FB}-\u{1F3FF}\u{200D}\u{20E3}]/gu

/**
 * Variantes escritas de "dale" que la normalización parte en dos ("de10" ->
 * "de 10") o que quedarían como número suelto. Se colapsan antes de tokenizar.
 */
function colapsarJergaDeAsentimiento(txt: string): string {
    return txt
        .replace(/\bd\s*e?\s*10\b/g, "dale")
        .replace(/\bd\s*1\b/g, "dale")
}

/**
 * El mensaje del cliente es puro asentimiento: no trae pregunta, ni dato, ni
 * pedido. "Bueno", "D1", "sale meta", "dale mañana lo mido y te aviso".
 */
export function esAsentimientoPelado(mensaje: string | null | undefined): boolean {
    const crudo = (mensaje || "").trim()
    if (!crudo) return false
    // Una pregunta siempre se contesta, por más corta que sea.
    if (/[?¿]/.test(crudo)) return false
    if (crudo.length > 90) return false

    const texto = colapsarJergaDeAsentimiento(normalizarTexto(crudo.replace(RX_EMOJI, " ")))
    if (!texto) return false

    const palabras = texto.split(" ").filter(Boolean)
    if (!palabras.length || palabras.length > 12) return false
    return palabras.every((p) => PALABRAS_DE_ASENTIMIENTO.has(p))
}

/**
 * El bot pidió algo que el cliente tiene que ir a buscar (medir la leva, mirar
 * el motor, preguntar en el taller) y avisarnos después. Mientras ese pedido
 * esté abierto, un "dale" no es una respuesta: es un acuse de recibo.
 */
export function elBotDejoUnPedidoPendiente(mensaje: string | null | undefined): boolean {
    const texto = normalizarTexto(mensaje)
    if (!texto) return false

    // Si el bot ofreció algo con respuesta sí/no, el "dale" del cliente SÍ
    // significa algo ("te lo reservo?" -> "dale" es que sí). No se calla.
    const hayPregunta = /[?]/.test(mensaje || "")
    const esOferta =
        /\b(queres|querias|te (lo|la|los|las) (reservo|preparo|mando|armo|dejo|paso|cierro)|te (paso|mando|reservo|preparo|armo) (el|la|los|las|un|una)|lo (reservo|preparo|mando)|avanzamos|lo cerramos|te sirve)\b/.test(
            texto
        )
    if (hayPregunta && esOferta) return false

    const pedidos = [
        /\bcuando (lo|la|los|las|le|te)?\s*(midas|tengas|sepas|averigues|veas|revises|chequees|desarmes|confirmes|preguntes)\b/,
        /\b(me|nos) (decis|avisas|confirmas|pasas|contas)\b/,
        /\bavisame\b/,
        /\bconfirmame\b/,
        /\bdecime\b/,
        /\bfijate\b/,
        /\b(medila|medilo|medis|medi)\b/,
        /\bhay que (desarmar|medir|mirar|revisar)\b/,
        /\bse (saca|mide) midiendo\b/
    ]
    return pedidos.some((rx) => rx.test(texto))
}

/**
 * Decisión completa: este turno es un "recibido" sobre un pedido que sigue
 * abierto del lado del cliente. `ultimoDelBot` es el último mensaje público que
 * mandó el bot.
 */
export function debeCallarPorAcuseDeRecibo(
    mensajeCliente: string | null | undefined,
    ultimoDelBot: string | null | undefined,
    hayHistorial: boolean
): boolean {
    if (!hayHistorial) return false
    if (!esAsentimientoPelado(mensajeCliente)) return false
    return elBotDejoUnPedidoPendiente(ultimoDelBot)
}
