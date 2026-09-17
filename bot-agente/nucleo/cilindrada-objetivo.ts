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
 * La cilindrada OBJETIVO es un dato distinto de los otros dos números que ya
 * sabemos leer:
 *   - la cilindrada de SU MOTO ("un econor de 110")  -> `nucleo/motos.ts`
 *   - la medida del producto que PIDE ("tenés kit 190?") -> `otro-producto-anuncio.ts`
 *   - a cuánto quiere DEJARLA ("hacerla 140")        -> esto.
 *
 * No hay forma de contestarlo con el catálogo: `cilindradas_base` dice para qué
 * motor es el kit, nunca en cuánto lo deja. Así que la regla es dura y
 * conservadora: si el número objetivo no es el del producto que está sobre la
 * mesa, el bot no confirma nada y la consulta va al equipo.
 *
 * Determinista a propósito (no depende del modelo), igual que sus dos hermanos.
 */

import { normalizarTexto } from "./texto"
import { cilindradasEn } from "./motos"

/**
 * Verbos con los que se dice "llevarla a X". Se aceptan con el pronombre
 * pegado, que es como se escribe en WhatsApp ("hacerla", "pasarlo", "dejarla").
 */
const RX_VERBO_OBJETIVO =
    /^(hacer|haser|aser|llevar|pasar|subir|agrandar|ampliar|aumentar|potenciar|convertir|dejar|trucar|modificar)(la|lo|le|las|los|me|se|mela|melo|sela|selo)?$/

/** Las mismas, conjugadas en primera/tercera persona ("la paso a 140"). */
const RX_VERBO_CONJUGADO =
    /^(hago|hace|hacen|llevo|lleva|paso|pasa|subo|sube|agrando|agranda|potencio|potencia|dejo|deja|quede|quedaria|convierto)$/

/** Imperativo de voseo con el pronombre pegado: "hacela de 140", "pasalo a 150". */
const RX_VERBO_IMPERATIVO =
    /^(hac|has|llev|pas|sub|agrand|ampli|aument|potenci|dej|truc|modific)[ae](la|lo|le|las|los)$/

/**
 * Palabras que pueden ir ENTRE el verbo y el número sin romper la idea
 * ("llevarla a 140", "dejarla en unos 140"). Cualquier otra palabra corta la
 * cadena: así "hacer el envío a 140 km" o "lo dejo para el 15" no matchean.
 */
const PUENTE = new Set([
    "a", "al", "de", "del", "en", "hasta", "como", "unos", "unas", "un", "una",
    "el", "la", "los", "las", "mi", "su", "moto", "motor", "cilindrada", "cc",
])

/** Cuántas palabras puente se toleran entre el verbo y el número. */
const VENTANA_PUENTE = 3

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
export function detectarCilindradaObjetivo(mensaje: string | null | undefined): CilindradaObjetivo | null {
    const norm = normalizarTexto(mensaje || "")
    if (!norm) return null

    const tokens = norm.split(" ").filter(Boolean)
    for (let i = 0; i < tokens.length; i++) {
        const esVerbo =
            RX_VERBO_OBJETIVO.test(tokens[i]) ||
            RX_VERBO_CONJUGADO.test(tokens[i]) ||
            RX_VERBO_IMPERATIVO.test(tokens[i])
        if (!esVerbo) continue

        for (let j = i + 1; j <= i + 1 + VENTANA_PUENTE && j < tokens.length; j++) {
            const m = tokens[j].match(/^(\d{2,4})(cc)?$/)
            if (m) {
                const n = Number(m[1])
                if (n < 50 || n > 2000) break
                return { cilindrada: n, frase: tokens.slice(i, j + 1).join(" ") }
            }
            if (!PUENTE.has(tokens[j])) break
        }
    }

    return null
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
export function pideOtraCilindradaQueElProducto(
    mensaje: string | null | undefined,
    contextoProducto: string | null | undefined
): CilindradaObjetivo | null {
    const objetivo = detectarCilindradaObjetivo(mensaje)
    if (!objetivo) return null

    const delProducto = new Set(cilindradasEn(contextoProducto || ""))
    if (delProducto.size === 0) return null
    if (delProducto.has(objetivo.cilindrada)) return null

    return objetivo
}
