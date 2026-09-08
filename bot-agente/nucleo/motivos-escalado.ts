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
