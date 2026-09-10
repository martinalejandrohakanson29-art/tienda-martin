/**
 * Piezas puras del aprendizaje de compatibilidad: el tipo del destino y la
 * redacción del mensaje que se le manda al cliente.
 *
 * Vive aparte de `lib/aprendizaje-compatibilidad.ts` (que habla con Postgres)
 * para que el formulario del chat pueda previsualizar el texto exacto que va a
 * salir sin arrastrar Prisma al bundle del navegador.
 */

/** Kit al que se le carga la compatibilidad: un grupo de variantes o un pack suelto. */
export type DestinoCompat = {
    tipo: "grupo" | "pack"
    id: number
    nombre: string
}

/** Pega la aclaración al mensaje base sin comerse la puntuación del medio. */
export function unirMensajeYDetalle(base: string, detalle: string): string {
    const limpio = (base || "").trim()
    const extra = (detalle || "").trim()
    if (!extra) return limpio
    return /[.!?]$/.test(limpio) ? `${limpio} ${extra}` : `${limpio}. ${extra}`
}

/** "Sí, el Kit 120 para 110 le va bien a tu Gilera Smash." */
export function textoCompatibleSugerido(kitNombre: string, modeloMoto: string, detalle = ""): string {
    return unirMensajeYDetalle(`Sí, el ${kitNombre} le va bien a tu ${modeloMoto.trim()}.`, detalle)
}

/**
 * La negativa de compatibilidad, redactada por la casa (no por la IA).
 *
 * Es un dato conocido: hay una fila que dice que no le entra y por qué. Cuando
 * la redacción quedaba a cargo del modelo salía con preámbulo de confesión
 * ("te soy sincero: ese combo no le entra directo...", conv 3874 — Wave NF).
 * Acá se arma la línea exacta: negativa seca + el motivo cargado, y nada más.
 *
 * `base` es el texto editable del equipo (chat_config.mensaje_incompatibilidad).
 * Si trae `{moto}`, se reemplaza por el modelo que dijo el cliente; si no lo
 * trae, se usa tal cual (el texto es del equipo, no se le agrega nada).
 */
export function textoIncompatibleSugerido(base: string, modeloMoto: string, detalle = ""): string {
    const moto = nombreMotoParaCliente(modeloMoto)
    const plantilla = (base || "").trim() || MENSAJE_INCOMPATIBILIDAD_SIN_MOTO
    const conMoto = plantilla.includes("{moto}")
        ? plantilla.replace(/\{moto\}/g, moto || "esa moto")
        : plantilla
    return unirMensajeYDetalle(conMoto, detalle)
}

/** Fallback cuando el equipo dejó el texto vacío. */
const MENSAJE_INCOMPATIBILIDAD_SIN_MOTO = "Ese kit no le va a esa moto."

/**
 * "wave nf" -> "Wave NF", "motomel blitz 110" -> "Motomel Blitz 110".
 *
 * Las motos vienen en minúscula (así están normalizadas en las tablas de
 * compatibilidad, y así las escribe el cliente). Las siglas de hasta 2 letras
 * van enteras en mayúscula: "nf", "zb", "xr", "s2" no son palabras. De 3 en
 * adelante sí lo son ("biz" no es "BIZ").
 */
export function nombreMotoParaCliente(modeloMoto: string): string {
    return (modeloMoto || "")
        .trim()
        .split(/\s+/)
        .map((palabra) => {
            const letras = palabra.replace(/[^a-záéíóúñ]/gi, "")
            if (letras.length <= 2) return palabra.toUpperCase()
            return palabra.charAt(0).toUpperCase() + palabra.slice(1)
        })
        .join(" ")
}
