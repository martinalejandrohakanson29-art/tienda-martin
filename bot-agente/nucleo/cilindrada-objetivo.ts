/**
 * "Quiero hacerla 140" — el cliente dice A CUÁNTO quiere llevar el motor.
 * ---------------------------------------------------------------------------
 * Conv 4352 (17/09, +5492477332855): el cliente entró por el anuncio del "Combo
 * Tapa CDI + Cilindro 120" y al otro día escribió *"Quiero hacerla 140. Un
 * econor con motor de 110"*. El bot leyó la moto ("110"), confirmó la
 * compatibilidad y le preguntó el recorrido. El 140 —lo único que el cliente
 * realmente vino a preguntar— no lo miró nadie: el combo deja el motor en 120,
 * no en 140, y de a cuánto deja cada kit NO hay dato en la base.
 *
 * No hay forma de contestarlo con el catálogo: `cilindradas_base` dice para qué
 * motor es el kit, nunca en cuánto lo deja. Así que la regla es dura y
 * conservadora: si el número objetivo no es el del producto que está sobre la
 * mesa, el bot no confirma nada y la consulta va al equipo.
 *
 * Quién lee el número y con qué precedencia contra los otros dos roles (la
 * cilindrada de su moto, la medida del producto que pide) vive en
 * `nucleo/numeros-del-mensaje.ts`. Acá queda solo la regla de negocio.
 */

import { cilindradasEn } from "./motos"
import { leerNumeros, type LecturaNumeros } from "./numeros-del-mensaje"

export interface CilindradaObjetivo {
    /** A cuánto quiere llevar el motor. */
    cilindrada: number
    /** El pedazo del mensaje que lo dice, para el resumen del escalado. */
    frase: string
}

/**
 * ¿El cliente dijo a cuánto quiere llevar el motor?
 *
 * Devuelve el primer objetivo que aparece; con dos números distintos alcanza el
 * primero para saber que hay que derivar.
 */
export async function detectarCilindradaObjetivo(
    mensaje: string | null | undefined,
    /**
     * La lectura de este mismo texto, si el motor ya la hizo en este turno
     * (viaja en el embudo). Sin ella se lee de nuevo, que es lo mismo pero
     * pagando otra resolucion de moto.
     */
    lecturaPrevia?: LecturaNumeros | null
): Promise<CilindradaObjetivo | null> {
    const { objetivo } = lecturaPrevia || (await leerNumeros(mensaje))
    return objetivo ? { cilindrada: objetivo.valor, frase: objetivo.frase } : null
}

/**
 * ¿El objetivo que dijo el cliente es OTRO que el del producto en juego?
 *
 * `contextoProducto` es el nombre del combo/kit (y lo que lo acompañe: el
 * título del aviso, las etiquetas de sus variantes). El "120" del "Cilindro
 * 120" es la medida del producto: si el cliente dice "hacerla 120" está
 * hablando de ESTE kit y no hay nada que derivar. Cualquier otro número sí.
 *
 * Sin número en el contexto no se opina: no hay con qué comparar.
 */
export async function pideOtraCilindradaQueElProducto(
    mensaje: string | null | undefined,
    contextoProducto: string | null | undefined,
    lecturaPrevia?: LecturaNumeros | null
): Promise<CilindradaObjetivo | null> {
    const objetivo = await detectarCilindradaObjetivo(mensaje, lecturaPrevia)
    if (!objetivo) return null

    const delProducto = new Set(cilindradasEn(contextoProducto || ""))
    if (delProducto.size === 0) return null
    if (delProducto.has(objetivo.cilindrada)) return null

    return objetivo
}
