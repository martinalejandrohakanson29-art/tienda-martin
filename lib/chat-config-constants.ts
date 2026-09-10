export const MENSAJE_INCOMPATIBILIDAD_DEFAULT = 'Lamentablemente este kit no es compatible.'

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
