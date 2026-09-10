// Letra fija de la casa para la negativa de compatibilidad. `{moto}` se
// reemplaza por la moto que dijo el cliente y atrás se le pega el motivo de la
// fila, así que el texto arranca y termina donde tiene que terminar: sin
// preámbulo ("te soy sincero") y sin adornos del modelo.
export const MENSAJE_INCOMPATIBILIDAD_DEFAULT = 'Ese kit no le va a la {moto}.'

/**
 * Costo del envío cuando la pieza suelta NO va con envío gratis. Uno solo para
 * todo el catálogo: es lo que se cobra por el paquete, no por pieza. `null` =
 * sin cargar, y ahí el bot dice que el envío corre por cuenta del cliente pero
 * no inventa un monto.
 */
export const COSTO_ENVIO_SUELTAS_DEFAULT: number | null = null

export type ChatConfig = {
    mensajeIncompatibilidad: string
    costoEnvioSueltas: number | null
}
