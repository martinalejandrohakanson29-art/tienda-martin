/**
 * "Entro por el anuncio, pero no viene por ESE kit."
 *
 * El que clickea una publicidad de Instagram casi siempre acompana el click con
 * una linea escrita. Normalmente esa linea es sobre el kit del aviso ("le va a
 * mi wave 110?", "cuanto sale?") y la ficha oficial es justo lo que necesita.
 * Pero a veces la linea dice lo contrario: que el cliente quiere OTRO producto,
 * de otra medida. Ahi la ficha —que lleva precio y foto— se lee como "esto es
 * lo que preguntaste" y hay que desdecirla a mano.
 *
 * Conv 4386 (16/09, +5493406436694): entro por el anuncio del "Kit 170
 * varillero + leva" y escribio *"Quiero saber si tienen kid de cg 190"*. El bot
 * le mando la ficha del 170 con su $99.990 y, arriba, una negativa de
 * compatibilidad contra una moto que el cliente nunca nombro ("Ese kit no le va
 * a la CG Titan 150"). El equipo tuvo que contestar a mano tres minutos despues
 * ("sisi tenemos, cilindro 190 marca kamisno, $129.999").
 *
 * Decision de Martin (16/09): si el texto que acompana la plantilla pide otro
 * producto, la plantilla NO sale y la consulta la contesta el equipo.
 *
 * El detector es deterministico a proposito (no depende del modelo): busca una
 * cilindrada HUERFANA —que no es la del aviso ni la de la moto del cliente—
 * pegada a una palabra de producto ("kit 190", "kid de cg 190").
 */

import { normalizarTexto } from "./texto"
import { cilindradasEn, resolverMoto } from "./motos"

/** Palabras con las que el cliente nombra lo que quiere comprar. */
const PALABRAS_PRODUCTO = new Set([
    "kit", "kits", "kid", "kids", "combo", "cilindro", "cilindros",
    "tapa", "leva", "levas", "piston", "pistones", "carburador", "corona"
])

/**
 * Cuantos tokens puede haber entre la palabra de producto y el numero. Con 3
 * entra "kid de cg 190" y queda afuera "el kit me sirve para hacerla 190?",
 * que es una pregunta sobre el kit del aviso y no un pedido de otro producto.
 *
 * Ese "hacerla 190" no queda sin dueño: lo levanta `nucleo/cilindrada-objetivo.ts`,
 * que mira otra cosa —a cuanto quiere llevar el motor— y tambien deriva. Si se
 * toca uno de los dos, mirar el otro.
 */
const VENTANA_TOKENS = 3

export interface OtroProductoDetectado {
    /** El texto pide un producto de otra medida que la del aviso. */
    esOtroProducto: boolean
    /** Cilindrada huerfana que lo delata (para el resumen del escalado). */
    cilindrada?: number
}

function numerosDe(texto: string | null | undefined): Set<number> {
    return new Set(cilindradasEn(texto || ""))
}

/**
 * @param resto        lo que el cliente escribio ademas de la plantilla
 * @param contextoAnuncio  titulo + cuerpo del aviso + nombre del kit presentado
 */
export async function pideOtroProductoQueElAnuncio(
    resto: string | null | undefined,
    contextoAnuncio: string | null | undefined
): Promise<OtroProductoDetectado> {
    const norm = normalizarTexto(resto)
    if (!norm) return { esOtroProducto: false }

    const delAnuncio = numerosDe(contextoAnuncio)
    if (delAnuncio.size === 0) return { esOtroProducto: false }

    const cilindradasDelTexto = cilindradasEn(norm)
    if (cilindradasDelTexto.length === 0) return { esOtroProducto: false }

    // Las cilindradas de SU MOTO no son un pedido de producto: "el kit le va a
    // mi rouser 200?" no es pedir un kit 200. Se resuelven PRIMERO porque la
    // cilindrada de la moto suele estar tambien en la letra del aviso ("kit 200
    // para varilleros 150"): si no se descuentan antes, el "150" de la moto
    // haria pasar el mensaje por "sigue hablando del aviso".
    const moto = await resolverMoto(norm).catch(() => null)
    const deLaMoto = new Set<number>()
    for (const m of [moto?.modelo, ...(moto?.candidatos || [])]) {
        if (!m) continue
        if (m.cilindrada) deLaMoto.add(m.cilindrada)
        for (const n of cilindradasEn(m.nombre_completo)) deLaMoto.add(n)
        for (const a of m.aliases || []) for (const n of cilindradasEn(a)) deLaMoto.add(n)
    }

    // El cliente tambien nombro la medida del aviso: sigue hablando de ESE kit
    // (ej. "el 170 le entra? y de 190 tenes?"). La ficha sale igual y el
    // sub-turno se encarga del resto.
    if (cilindradasDelTexto.some((c) => !deLaMoto.has(c) && delAnuncio.has(c))) {
        return { esOtroProducto: false }
    }

    const tokens = norm.split(" ").filter(Boolean)
    for (let i = 0; i < tokens.length; i++) {
        const n = Number(tokens[i])
        if (!/^\d{2,4}$/.test(tokens[i]) || !(n >= 50 && n <= 2000)) continue
        if (delAnuncio.has(n) || deLaMoto.has(n)) continue
        for (let j = Math.max(0, i - VENTANA_TOKENS); j < i; j++) {
            if (PALABRAS_PRODUCTO.has(tokens[j])) return { esOtroProducto: true, cilindrada: n }
        }
    }

    return { esOtroProducto: false }
}
