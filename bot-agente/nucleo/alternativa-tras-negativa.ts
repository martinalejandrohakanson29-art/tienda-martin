/**
 * "Y ALGO PARA ESA NO TENES??" — el pedido de alternativa despues de un "no le va".
 * ------------------------------------------------------------------------------
 * Conv 4186 (14/09, Honda Wave NF 100): el bot dio bien la negativa del Combo
 * Tapa CDI + Cilindro 120 y el cliente contesto "Ahhhhh q lastima / Y algo para
 * esa no tenes ??". El modelo no llamo NINGUNA herramienta y le devolvio un menu
 * de categorias inventado ("Decime que queres armar en la Wave 100: Tapa CDI /
 * Cilindro / Leva / Escape...") cerrando con "te paso las opciones y precios que
 * tenemos para esa". Una promesa que el sistema no podia respaldar: el equipo
 * entro a mano y contesto "perdon, para la wave nada por el momento".
 *
 * POR QUE PASA: la memoria de estado ya le decia "no repitas la negativa; si
 * vuelve sobre ESE tema, escala". Pero pedir OTRA cosa para la misma moto no se
 * lee como "volver sobre el tema": se lee como una consulta nueva de catalogo. Y
 * no tenemos ninguna herramienta que conteste "que le va a esta moto" (la compat
 * se consulta siempre producto -> moto, nunca al reves), asi que el modelo se
 * queda sin dato y rellena.
 *
 * REGLA: con una negativa vigente sobre una moto, un pedido de alternativa para
 * ESA misma moto no se contesta ni se re-preguntan categorias: se deriva al
 * equipo en silencio. Es exactamente el criterio de la casa — lo incierto es del
 * humano, el bot solo saca lo que ya esta confirmado.
 *
 * DOS FRENOS para no derivar de mas:
 *  1. Si el cliente nombra otra MARCA de moto, ya no habla de la moto de la
 *     negativa: cambio de consulta, sigue el flujo normal.
 *  2. Si en la misma rafaga pregunta ademas otro tema que si sabemos contestar
 *     (envio, precio, pago, garantia, horarios, ubicacion), no cortamos el turno:
 *     esa parte se le tiene que contestar igual. Ahi decide el modelo con la
 *     linea reforzada de la memoria de estado.
 */

import { normalizarTexto } from "./texto"
import { MARCAS_MOTO } from "./motos"

/**
 * El cliente pide algo DISTINTO a lo que se le nego. Pide alternativa, no
 * insiste con la misma pieza (eso ya lo cubre la negativa condicional).
 *
 * Se exige la combinacion de dos cosas: un pronombre de "otra cosa" y un verbo
 * de tener/ir/servir. Un "algo" suelto no alcanza.
 */
const RX_ALTERNATIVA: RegExp[] = [
    // "y algo para esa no tenes?", "algun kit para la wave?", "otra cosa que le vaya?"
    /\b(algo|algun|alguna|alguno|otra|otro|otras|otros|alternativa|opcion|opciones)\b[^?]{0,40}\b(tenes|tenez|tienen|tendras|tendrias|hay|manejan|venden|vendes|para|que le|que me|sirva|sirve|vaya|va|entre|ande|funcione|calce)\b/,
    // "no tenes nada para esa?", "nada que le vaya?"
    /\bno\s+(tenes|tienen|hay|manejan)\b[^?]{0,30}\b(nada|algo|otra|otro)\b/,
    /\b(nada|algo)\s+(para|que le|que me)\b/,
    // "que me recomendas para esa?", "que le puedo poner entonces?"
    /\bque\s+(me\s+)?(recomendas|recomiendan|recomendarias|aconsejas|sugeris|sugieren)\b/,
    /\bque\s+(le\s+)?(puedo|podria|se le puede)\s+(poner|meter|montar|colocar|hacer)\b/,
    // "que kit le va?", "cual combo le entra?", "que tenes para la wave?"
    /\b(que|cual|cuales)\s+(kit|kits|combo|combos|cosa|cosas|opcion|opciones|producto|productos)?\s*(le|me)?\s*(va|van|entra|entran|sirve|sirven|tenes|tienen|hay)\b/,
]

/**
 * Temas que SI sabemos contestar con una herramienta. Si vienen pegados al
 * pedido de alternativa, el turno no se corta: hay algo que responder.
 */
const RX_OTRO_TEMA_CONTESTABLE =
    /\b(envio|envios|envian|mandan|correo|andreani|precio|precios|cuanto sale|cuanto cuesta|cuanto esta|pago|pagos|transferencia|tarjeta|cuotas|garantia|horario|horarios|abren|cierran|ubicacion|donde estan|direccion|local|stock|instagram|tiktok|mercado libre)\b/

/**
 * El cliente nombra un producto CONCRETO ("y el kit 170 le entra?", "el combo
 * de 120 que tenes"). Eso ya no es "algo para esa moto" a ciegas: hay un
 * producto que consultarle a la compat, asi que el turno sigue normal.
 */
const RX_PRODUCTO_CONCRETO = /\b(kit|combo|cilindro|tapa|leva|escape|corona|piston)\s*(de\s+)?\d{2,4}\b|\b\d{2,4}\s*cc\b/

export interface NegativaVigente {
    moto: string
    kit: string
}

/**
 * Marcas de moto que nombra el mensaje del cliente (normalizado).
 */
function marcasEn(texto: string): string[] {
    const tokens = texto.split(/\s+/)
    return tokens.filter((t) => MARCAS_MOTO.has(t))
}

/**
 * ¿Este mensaje es un pedido de alternativa para la moto que ya recibio el "no"?
 *
 * Devuelve false (y el turno sigue normal) si el cliente cambio de moto o si en
 * la misma rafaga pregunto otra cosa que si podemos contestar.
 */
export function pideAlternativaTrasNegativa(
    mensaje: string | null | undefined,
    negativa: NegativaVigente | null | undefined
): boolean {
    if (!negativa?.moto) return false

    const texto = normalizarTexto(mensaje)
    if (!texto) return false

    if (!RX_ALTERNATIVA.some((rx) => rx.test(texto))) return false
    if (RX_OTRO_TEMA_CONTESTABLE.test(texto)) return false
    if (RX_PRODUCTO_CONCRETO.test(texto)) return false

    // Cambio de moto: "y para una Gilera Smash tenes algo?" ya no es esta charla.
    const marcasMensaje = marcasEn(texto)
    if (marcasMensaje.length > 0) {
        const marcasNegativa = marcasEn(normalizarTexto(negativa.moto))
        const mismaMarca = marcasMensaje.some((m) => marcasNegativa.includes(m))
        if (!mismaMarca) return false
    }

    return true
}

/** Resumen para la bandeja tecnica del panel de pendientes. */
export function resumenAlternativaTrasNegativa(negativa: NegativaVigente, mensaje: string): string {
    return (
        `Le dijimos que el "${negativa.kit || "kit consultado"}" no le va a la ${negativa.moto} y ahora pregunta ` +
        `si tenemos otra cosa para esa moto: "${(mensaje || "").trim()}". No hay alternativa confirmada en el sistema.`
    )
}
