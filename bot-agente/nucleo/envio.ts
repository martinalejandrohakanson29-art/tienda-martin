/**
 * QUÉ DECIMOS DEL ENVÍO, SEGÚN LO QUE DICE LA BASE
 * ------------------------------------------------
 * El "con envío gratis a todo el país" venía hardcodeado en las guías de
 * `resolver_variante` y del catálogo: salía igual para un kit al que alguien
 * le cargara un envío con costo. El dato existe y está cargado por producto
 * (`chat_packs.envio`, texto libre; `chat_articulos.envio_gratis`, booleano),
 * solo que nadie lo miraba para decidir la frase.
 *
 * Este módulo es el ÚNICO criterio: lo comparten la letra de la casa
 * (placeholder `{envio}`) y las guías de las herramientas, así que el bot no
 * puede prometer gratis en un renglón y cobrarlo en el otro.
 *
 * Los kits van con texto libre a propósito: ahí Martín escribe el transportista
 * y la demora ("por Andreani a domicilio, 4 a 6 días hábiles"), que es un dato
 * del envío y no su precio. Por eso se clasifica leyendo el texto en vez de
 * pedirle un checkbox más.
 */

export type ClaseEnvio = "gratis" | "con_costo" | "sin_dato"

/** Dice que no le cuesta nada al cliente. */
const DICE_GRATIS = /\b(gratis|gratuito|sin cargo|sin costo|bonificad[oa]|lo\s+pagamos|corre por (nuestra|la) cuenta)\b/i

/** Dice que lo paga el cliente. Se lee DESPUÉS de "gratis": un texto que
 *  arranca con "Envío gratis" y aclara "la colocación va aparte" es gratis. */
const DICE_COSTO =
    /\b(a cargo del cliente|lo paga el cliente|lo abona el cliente|con costo|va aparte|se cobra|a convenir|no incluye el env[íi]o)\b/i

/**
 * Un kit SIN envío cargado se venía contando como gratis (era el default del
 * catálogo: `p.envio ? ... : " - Envío gratis a todo el país"`). Se respeta esa
 * lectura para no cambiarle el veredicto a ningún producto de hoy, pero queda
 * en UN solo lugar: poner "sin_dato" acá hace que un kit sin envío cargado deje
 * de prometer gratis, en la letra y en las guías a la vez.
 */
export const ENVIO_SIN_CARGAR: ClaseEnvio = "gratis"

/** Clasifica el texto libre de envío de un kit (`chat_packs.envio`). */
export function clasificarEnvioPack(texto: string | null | undefined): ClaseEnvio {
    const t = (texto || "").trim()
    if (!t) return ENVIO_SIN_CARGAR
    if (DICE_GRATIS.test(t)) return "gratis"
    if (DICE_COSTO.test(t)) return "con_costo"
    // Hay texto pero solo habla del transportista o la demora: del precio del
    // envío no dice nada, y no nos lo vamos a inventar.
    return "sin_dato"
}

/**
 * La cláusula que puede entrar en la letra de la casa, o null si no
 * corresponde. Null no es un error: la frase se rellena sin ella y se lee
 * entera igual ("el kit cuesta $115.000"), porque `rellenarFrase` se come la
 * preposición junto con el placeholder.
 *
 * Solo el "gratis" se dice acá. El envío con costo NO se resuelve con una
 * frase linda: es un monto que el bot no tiene y que sale por su propio camino
 * (`cotizar_piezas_sueltas` lo pide a `info_negocio` o escala).
 */
export function clausulaEnvio(clase: ClaseEnvio, alcance: "pais" | "corto" = "pais"): string | null {
    if (clase !== "gratis") return null
    return alcance === "pais" ? "envío gratis a todo el país" : "envío gratis"
}

/** Atajo para los kits: del texto de la base a la cláusula de la letra. */
export function clausulaEnvioPack(texto: string | null | undefined): string | null {
    return clausulaEnvio(clasificarEnvioPack(texto))
}
