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

/**
 * Qué contesta el bot cuando en la MISMA ráfaga el cliente mandó las plantillas
 * de dos o más anuncios distintos (clickeó varios avisos seguidos). Antes se
 * entregaba la ficha de uno solo y los otros quedaban sin contestar o se
 * derivaban (conv 4149, 14/09: preguntó por el 200, el 170+leva y el 220).
 *
 * A propósito NO enumera los kits: los nombres del catálogo son internos y al
 * cliente no le dicen nada (ver el fix de la repregunta de candidatos). Se le
 * devuelve la pelota y él contesta con sus palabras.
 */
export const MENSAJE_VARIOS_KITS_DEFAULT = 'Hola bro! Veo que estás consultando por varios kits, en cuál estás interesado?'

export type ChatConfig = {
    mensajeIncompatibilidad: string
    mensajeVariosKits: string
    costoEnvioSueltas: number | null
}
