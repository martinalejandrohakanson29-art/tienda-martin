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
 * Deterministico a proposito (no depende del modelo): la cilindrada tiene que
 * ser HUERFANA —que no es la del aviso ni la de la moto del cliente— y venir
 * pegada a una palabra de producto ("kit 190", "kid de cg 190"). Quien decide
 * que un numero es "de producto" y no de su moto ni un objetivo ("hacerla 190")
 * es `nucleo/numeros-del-mensaje.ts`, con su precedencia escrita una sola vez.
 */

import { normalizarTexto } from "./texto"
import { cilindradasEn } from "./motos"
import { leerNumeros } from "./numeros-del-mensaje"

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

    const lectura = await leerNumeros(norm)
    if (lectura.numeros.length === 0) return { esOtroProducto: false }

    // El cliente tambien nombro la medida del aviso: sigue hablando de ESE kit
    // (ej. "el 170 le entra? y de 190 tenes?"). La ficha sale igual y el
    // sub-turno se encarga del resto.
    //
    // Las cilindradas de SU MOTO no cuentan para esto: "el kit le va a mi
    // rouser 200?" no habla del aviso ni pide un kit 200. Por eso se miran los
    // numeros que el lector NO le atribuyo a la moto.
    const ajenosALaMoto = lectura.numeros.filter((n) => n.rol !== "moto")
    if (ajenosALaMoto.some((n) => delAnuncio.has(n.valor))) {
        return { esOtroProducto: false }
    }

    const pedido = ajenosALaMoto.find((n) => n.rol === "producto" && !delAnuncio.has(n.valor))
    if (pedido) return { esOtroProducto: true, cilindrada: pedido.valor }

    return { esOtroProducto: false }
}
