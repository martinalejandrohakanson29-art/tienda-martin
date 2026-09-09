/**
 * Clasificación del motivo de escalado en una de las 4 bandejas de pendientes
 * del equipo (las mismas que /admin/chatwoot/chats-vivo usa para etiquetar y
 * filtrar las conversaciones).
 *
 * Por qué existe: `escalar_a_humano` recibía el motivo como texto libre y el
 * ruteo a la tabla de pendientes comparaba strings exactos. El modelo inventaba
 * variantes ("producto_sin_catalogo", "producto_no_encontrado") que no
 * matcheaban ninguna rama y caían todas al cajón genérico `sin_match`. En la
 * conv 3599 (08/09) un pedido de precio del "kit 220" terminó etiquetado
 * "Sin resolver" en vez de "Precio".
 *
 * La defensa es doble: la herramienta declara un enum cerrado de motivos, y
 * acá se normaliza igual por palabras clave para que un motivo inesperado
 * (inventado por el modelo, o interno del motor) caiga en la bandeja correcta
 * en lugar del cajón genérico.
 */

export type BandejaEscalado = "tecnica" | "precio" | "negocio" | "sin_match"

/**
 * Motivos canónicos que la herramienta le ofrece al modelo. El orden importa
 * solo para la documentación; el ruteo sale del valor.
 */
export const MOTIVOS_CANONICOS = {
    // → bandeja Técnica
    moto_no_registrada: "tecnica",
    compatibilidad_dudosa: "tecnica",
    consulta_tecnica: "tecnica",
    // → bandeja Precio
    producto_no_catalogado: "precio",
    consulta_precio: "precio",
    stock: "precio",
    // → bandeja Negocio
    mayorista: "negocio",
    envio: "negocio",
    pago: "negocio",
    reclamo: "negocio",
    horarios: "negocio",
    ubicacion: "negocio",
    // → bandeja Sin resolver
    ambiguo: "sin_match",
    otro: "sin_match",
} as const satisfies Record<string, BandejaEscalado>

export type MotivoCanonico = keyof typeof MOTIVOS_CANONICOS

/**
 * Palabras clave para motivos que NO son canónicos: los que inventa el modelo
 * pese al enum y los internos del motor (`respuesta_no_confiable`,
 * `limite_pasos_react_superado`). Se evalúan en orden: gana la primera que
 * aparezca en el motivo.
 */
const REGLAS_APROXIMADAS: { patron: RegExp; bandeja: BandejaEscalado }[] = [
    // Técnica: la moto o la compatibilidad son el problema.
    { patron: /moto|modelo|compatib|cilindrada|tecnic|técnic|medida|varian/i, bandeja: "tecnica" },
    // Negocio: condiciones de la venta, no el producto.
    { patron: /mayorista|revend|envio|envío|flete|correo|pago|transferenc|cbu|alias|factur|reclamo|garantia|garantía|devoluc|horario|ubicac|direccion|dirección|local/i, bandeja: "negocio" },
    // Precio: quiere un producto/precio que el catálogo no tiene.
    { patron: /precio|costo|cotiz|catalog|catálog|producto|articulo|artículo|pieza|repuesto|kit|stock|disponib/i, bandeja: "precio" },
]

/**
 * Motivos internos del motor: no son una consulta del cliente sino un fallo o
 * una duda del propio bot. Van al cajón genérico a propósito — no ensucian una
 * bandeja temática con algo que el equipo no puede "responder" como tal.
 */
const MOTIVOS_INTERNOS = /respuesta_no_confiable|limite_pasos|límite_pasos|escalado_manual|escalado_piloto|sin_match|no_confiable/i

export function clasificarMotivoEscalado(motivo: string | null | undefined): BandejaEscalado {
    const crudo = (motivo || "").trim()
    if (!crudo) return "sin_match"

    // El motor arma motivos compuestos tipo "moto_no_registrada: Zanella fx150":
    // se clasifica por la parte previa a los dos puntos, y si no matchea, por el
    // texto completo.
    const base = crudo.split(":")[0].trim().toLowerCase()

    const canonico = MOTIVOS_CANONICOS[base as MotivoCanonico]
    if (canonico) return canonico

    if (MOTIVOS_INTERNOS.test(base)) return "sin_match"

    for (const regla of REGLAS_APROXIMADAS) {
        if (regla.patron.test(crudo)) return regla.bandeja
    }

    return "sin_match"
}

/**
 * Motivos donde el silencio tiene que ser ABSOLUTO: aunque en la misma ráfaga
 * el cliente haya preguntado otra cosa que sí sabemos, no se le contesta nada.
 *
 * Por qué existe: el escalado dejó de mutear el turno entero (ver "escalado
 * parcial" en motor.ts). Eso está bien cuando lo derivado es un dato puntual
 * que no tenemos (la marca del cilindro, una moto sin cargar): el resto de la
 * ráfaga se contesta igual. Pero hay temas donde seguir vendiendo por al lado
 * queda peor que callarse:
 *   - `reclamo`: el cliente tiene un problema. Contestarle la demora del envío
 *     mientras se ignora el reclamo es exactamente el destrato que evitamos.
 *   - `mayorista`: no es un dato suelto, es una negociación entera que toma el
 *     equipo desde cero.
 *   - `ambiguo` / `otro`: no sabemos ni qué preguntó. Sin entender la consulta
 *     no hay forma de saber qué parte es seguro contestar.
 *   - motivos internos del motor (`respuesta_no_confiable`, `limite_pasos`):
 *     el turno ya se dio por poco confiable; hablar igual sería contradecirlo.
 */
const MOTIVOS_SILENCIO_ABSOLUTO = /reclamo|mayorista|ambiguo|otro|respuesta_no_confiable|limite_pasos|l[íi]mite_pasos|no_confiable|escalado_manual|escalado_piloto|sin_match/i

/**
 * ¿Este escalado permite contestar el RESTO de la ráfaga?
 *
 * Devuelve false para los temas de `MOTIVOS_SILENCIO_ABSOLUTO`. Para todo lo
 * demás (dato técnico que no tenemos, moto sin cargar, producto fuera del
 * catálogo, envío, pago, horarios...) devuelve true: lo derivado queda mudo,
 * pero lo que una herramienta ya respondió se le dice al cliente.
 */
export function admiteRespuestaParcial(motivo: string | null | undefined): boolean {
    const crudo = (motivo || "").trim()
    if (!crudo) return false
    // Motivos compuestos del motor: "moto_no_registrada: Zanella fx150".
    const base = crudo.split(":")[0].trim().toLowerCase()
    if (MOTIVOS_SILENCIO_ABSOLUTO.test(base)) return false
    // Un motivo que no reconocemos es un motivo que no entendemos: se calla.
    return Boolean(MOTIVOS_CANONICOS[base as MotivoCanonico])
}
