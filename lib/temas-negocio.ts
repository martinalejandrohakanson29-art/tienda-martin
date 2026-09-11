// Vocabulario exacto que usa el clasificador "Extraer Tema Negocio" en
// workflow_mateo.json — mantenerlo sincronizado con esas 6 opciones.
export const TEMAS_NEGOCIO = [
    { value: "ubicacion", label: "Ubicación / dirección" },
    { value: "horarios", label: "Horarios de atención" },
    { value: "medios_pago", label: "Medios de pago" },
    { value: "envios", label: "Formas de envío" },
    { value: "garantia", label: "Garantía" },
    { value: "mayorista", label: "Venta por mayor / reventa" },
    { value: "otro", label: "Otro" },
] as const

/**
 * El bloque de confianza vive en la fila `garantia`, pero el cliente casi nunca
 * lo pide con esa palabra: pregunta por el Instagram, el TikTok, si estamos en
 * Mercado Libre o si nos puede ver en Maps. Sin estos sinónimos, el modelo pedía
 * `tema: "instagram"`, no matcheaba ninguna fila y el turno terminaba escalado
 * en silencio con el dato cargado en la base.
 *
 * Vive acá (y no en la herramienta) porque el panel los muestra: quien edita el
 * texto tiene que ver con qué preguntas lo va a servir el bot.
 */
export const SINONIMOS_CONFIANZA = [
    "garant", "confian", "estaf", "segur",
    "instagram", "insta", "ig", "tiktok", "tik tok", "red", "redes",
    "mercadolibre", "mercado libre", "meli", "maps", "google",
    "link", "enlace", "perfil", "referencia", "reseña", "resena", "opinion"
]

/**
 * Ficha de cada tema para el panel de "Mensajes del bot": qué es, con qué
 * preguntas del cliente lo sirve el bot y un ejemplo de cómo escribirlo. No lo
 * lee el motor — es la documentación al lado del campo, para que el texto se
 * cargue sabiendo dónde va a salir.
 */
export type FichaTemaNegocio = {
    value: string
    label: string
    /** Qué contesta el bot con este dato. */
    descripcion: string
    /** Preguntas reales del cliente que caen en esta fila. */
    disparadores: string[]
    placeholder: string
}

export const FICHAS_TEMAS_NEGOCIO: FichaTemaNegocio[] = [
    {
        value: "envios",
        label: "Envíos",
        descripcion:
            "Cómo y cuándo se despacha, a dónde llega, demoras y cadete. Es el dato que más se pide después del precio.",
        disparadores: ["mandan a...?", "cuánto tarda en llegar?", "hacen envíos?", "cómo lo mandan?"],
        placeholder:
            "Hacemos envíos a todo el país por correo.\n\nSe despacha después de acreditado el pago y demora entre 3 y 5 días hábiles.",
    },
    {
        value: "ubicacion",
        label: "Ubicación",
        descripcion: "Dónde está el local físico, para retiros y para el que quiere pasar.",
        disparadores: ["dónde están?", "tienen local?", "puedo retirar?", "la dirección?"],
        placeholder: "Estamos en <calle y número>, Córdoba capital.\n\nPodés pasar a retirar en el horario de atención.",
    },
    {
        value: "medios_pago",
        label: "Medios de pago",
        descripcion: "Con qué se puede pagar: transferencia, efectivo, tarjetas, cuotas.",
        disparadores: ["cómo se paga?", "aceptan tarjeta?", "hacen cuotas?", "puedo transferir?"],
        placeholder: "Aceptamos transferencia, efectivo y tarjeta de débito o crédito.",
    },
    {
        value: "horarios",
        label: "Horarios de atención",
        descripcion:
            "Los horarios generales del local. A este tema el bot le suma solo el día y la hora reales de Córdoba: si preguntan por hoy, contesta la situación de hoy antes que la semana entera.",
        disparadores: ["están abiertos ahora?", "hasta qué hora atienden?", "abren el sábado?"],
        placeholder: "Lunes a viernes de 9 a 13:30 y de 16 a 19 hs. Sábados de 9 a 13 hs.",
    },
    {
        value: "garantia",
        label: "Confianza y redes",
        descripcion:
            "El bloque que contesta al que duda si somos reales: garantía, años de trayectoria y los links de Instagram, TikTok, Google Maps y Mercado Libre. El bot manda SOLO el link que le piden, copiado carácter por carácter.",
        disparadores: [
            "cómo sé que no me estafan?",
            "tienen instagram?",
            "están en mercado libre?",
            "tienen garantía?",
            "los puedo ver en maps?",
        ],
        placeholder:
            "Tenemos local a la calle en Córdoba y más de X años vendiendo repuestos, con garantía en todo lo que sale de acá.\n\nNuestro Instagram: https://instagram.com/...\n\nNuestro TikTok: https://tiktok.com/@...",
    },
    {
        value: "mayorista",
        label: "Venta por mayor / reventa",
        descripcion: "Qué contestarle al que compra para revender o pide lista mayorista.",
        disparadores: ["tienen precio por mayor?", "vendo repuestos, hay lista?", "soy de un taller"],
        placeholder: "Trabajamos con precios especiales por cantidad. Contame qué volumen manejás y te paso la lista.",
    },
]
