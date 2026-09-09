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
