import { normalizarTexto } from "./texto"

/**
 * NEGATIVA CONDICIONAL: "no le entra" no siempre quiere decir "nunca le va".
 * -------------------------------------------------------------------------
 * Muchas filas de incompatibilidad no dicen que el kit sea imposible, dicen que
 * hace falta un trabajo previo: "hay que alesar los cárteres", "hay que cambiar
 * la leva", "se le tiene que rectificar la tapa". Si el cliente ya hizo ese
 * trabajo (o lo va a hacer), la condición está cumplida y el veredicto de la
 * fila deja de aplicar: no le podemos repetir el "no" de memoria.
 *
 * Conv 3874 (Wave NF, 10/09): el bot dio la negativa, el cliente contestó
 * "Si ya se ya lo tengo a agrandado los carter todo / Ya esta todo modificado"
 * y al turno siguiente se le sirvió la MISMA negativa palabra por palabra. No
 * fue el modelo improvisando: la guía determinista le ordena copiar la línea
 * tal cual, así que el contrato mismo lo obligaba a responder ciego.
 *
 * POR QUÉ ESTO NO CRECE CON EL CATÁLOGO (la regla vive en el dato):
 * acá NO hay una lista de modificaciones posibles. El QUÉ hay que hacer sale
 * del `detalle` de la propia fila de compatibilidad; lo único hardcodeado es un
 * léxico chico y estable de dos cosas que no dependen del producto:
 *   1. verbos de taller, para saber si la fila describe un trabajo (condicional)
 *      y no una imposibilidad,
 *   2. marcas de "ya está hecho" / "lo voy a hacer" en boca del cliente.
 * Si mañana se carga un kit cuyo detalle dice "hay que cambiar la leva" y el
 * cliente escribe "ya le cambié la leva", esto matchea sin tocar una línea.
 *
 * Y si no matchea (el cliente lo dijo con palabras que no comparten nada con la
 * fila), no se pierde: el motor tiene la red de seguridad de la negativa ya
 * entregada — una segunda negativa a la misma moto nunca se repite, se deriva.
 */

/**
 * Raíces de trabajos de taller. Sirven para dos cosas: decidir si el detalle
 * describe una condición superable, y reconocer el mismo verbo en boca del
 * cliente ("alesar" / "alesado" comparten raíz).
 *
 * Son acciones, no productos: esta lista no crece cuando crece el catálogo.
 */
const RAICES_TRABAJO = [
    "alesa",
    "alesar",
    "agranda",
    "modific",
    "rectific",
    "tornea",
    "mecaniz",
    "recort",
    "perfor",
    "suelda",
    "soldar",
    "soldad",
    "adapta",
    "adaptar",
    "cambia",
    "cambiar",
    "reforma",
    "ampliar",
    "trabajar",
    "preparar",
    "preparad",
]

/**
 * El cliente afirma que el trabajo YA está hecho. Es la señal fuerte: la fila
 * habla de una moto de fábrica y la suya ya no lo es.
 */
const MARCAS_HECHO = [
    "ya lo tengo",
    "ya la tengo",
    "ya los tengo",
    "ya las tengo",
    "ya le tengo",
    "lo tengo hecho",
    "ya esta",
    "ya estan",
    "ya lo hice",
    "ya le hice",
    "ya se lo hice",
    "ya lo hizo",
    "ya lo mande",
    "lo mande a hacer",
    "ya se lo mande",
    "esta hecho",
    "esta modificado",
    "esta trabajado",
    "esta preparado",
    "ya le puse",
    "ya lo puse",
    "lo tengo",
    "la tengo",
    "tengo hecho",
    "viene hecho",
]

/**
 * Forma genérica del hecho consumado: "ya le cambié la leva", "ya lo mandé a
 * tornear", "ya se la hice". Con la lista sola había que prever cada verbo; con
 * esto alcanza el "ya + pronombre + verbo", y el filtro de verdad lo pone el
 * cruce con los términos de la fila (un "ya lo tengo el dinero" no comparte
 * nada con "alesar los cárteres" y no dispara).
 */
const RX_HECHO_GENERICO = /\bya\s+(?:se\s+)?(?:me\s+)?(?:lo|la|le|los|las)\s+[a-z]{3,}/

/**
 * El cliente no lo hizo todavía pero está dispuesto: "lo mando a hacer y lo
 * compro". Tampoco es un caso para el bot — es una venta que depende de una
 * respuesta técnica nuestra.
 */
const MARCAS_PREVISTO = [
    "lo voy a mandar",
    "lo mando a hacer",
    "se lo voy a hacer",
    "lo voy a hacer",
    "se lo puedo hacer",
    "lo puedo mandar",
    "si le hago",
    "si se lo hago",
    "si lo mando",
    "y si le hago",
    "haciendole",
    "haciendolo",
]

/** Palabras que no identifican nada: no sirven para cruzar la fila con el mensaje. */
const VACIAS = new Set([
    "para", "que", "hay", "con", "sin", "los", "las", "una", "uno", "del", "por", "mas",
    "este", "esta", "esto", "esos", "esas", "hacer", "hacerle", "entre", "entra", "poner",
    "cambio", "cambios", "directo", "fabrica", "kit", "kits", "combo", "moto", "motos",
    "modelo", "tiene", "tienen", "sino", "pero", "como", "toda", "todo", "todos", "solo",
    "algun", "alguna", "porque", "queda", "quedan", "viene", "vienen", "hace", "hacen",
    "compatible", "compatibles", "modificaciones", "modificacion",
])

function tieneRaizDeTrabajo(texto: string): boolean {
    return RAICES_TRABAJO.some((raiz) => texto.includes(raiz))
}

/**
 * ¿La fila describe un trabajo que el cliente podría tener hecho, o una
 * imposibilidad lisa y llana?
 *
 * Un detalle vacío NO es condicional: sin saber qué habría que hacer, no hay
 * condición que el cliente pueda haber cumplido.
 */
export function esNegativaCondicional(detalle: string | null | undefined): boolean {
    const texto = normalizarTexto(detalle || "")
    if (!texto) return false
    return tieneRaizDeTrabajo(texto)
}

/** Tokens significativos de un texto (lo que sirve para cruzar fila ↔ mensaje). */
function terminos(texto: string): string[] {
    return normalizarTexto(texto)
        .split(" ")
        .filter((t) => t.length >= 4 && !VACIAS.has(t) && !/^\d+$/.test(t))
}

/**
 * ¿Dos términos hablan de lo mismo? Comparación por raíz común, para que
 * "cárteres" matchee "carter" y "alesado" matchee "alesar" sin un lematizador.
 */
function mismaRaiz(a: string, b: string): boolean {
    const largo = Math.min(a.length, b.length)
    if (largo < 4) return false
    return a.slice(0, largo) === b.slice(0, largo)
}

export interface CondicionSuperada {
    /** "hecho": ya lo hizo. "previsto": dice que lo va a hacer. */
    tipo: "hecho" | "previsto"
    /** La pieza/trabajo que se reconoció en común entre la fila y el mensaje. */
    termino: string
}

/**
 * ¿El cliente está diciendo que la condición de la negativa ya no es un
 * problema? Devuelve null cuando no hay señal — el default es no intervenir.
 *
 * Pide DOS cosas juntas, para no escalar cualquier "ya lo tengo":
 *   1. una marca de hecho consumado (o de intención firme) en el mensaje, y
 *   2. que el mensaje nombre algo de lo que pide la fila (la pieza o el trabajo).
 * "Ya lo tengo agrandado los carter" cumple las dos contra una fila que dice
 * "hay que alesar los cárteres"; "ya tengo la plata" no cumple la segunda.
 */
export function condicionSuperada(
    mensajeCliente: string | null | undefined,
    detalle: string | null | undefined
): CondicionSuperada | null {
    if (!esNegativaCondicional(detalle)) return null

    const mensaje = normalizarTexto(mensajeCliente || "")
    if (!mensaje) return null

    const previsto = MARCAS_PREVISTO.some((m) => mensaje.includes(m))
    const hecho = MARCAS_HECHO.some((m) => mensaje.includes(m)) || RX_HECHO_GENERICO.test(mensaje)
    if (!hecho && !previsto) return null

    // El cruce con la fila: la pieza ("cárteres", "leva") o el mismo trabajo
    // ("alesar" ~ "alesado"). Sale del dato, no de una lista nuestra.
    const delDetalle = terminos(detalle || "")
    const delMensaje = terminos(mensaje)
    for (const t of delDetalle) {
        const match = delMensaje.find((m) => mismaRaiz(m, t))
        if (match) return { tipo: hecho ? "hecho" : "previsto", termino: t }
    }

    // El cliente puede nombrar el trabajo con otro verbo del mismo palo
    // ("agrandado" por "alesar"): si los dos lados hablan de trabajo de motor,
    // alcanza. Sigue siendo conservador: derivar, nunca afirmar.
    if (tieneRaizDeTrabajo(mensaje)) {
        return { tipo: hecho ? "hecho" : "previsto", termino: delDetalle[0] || "la modificación" }
    }

    return null
}

/**
 * Guía para el agente cuando la condición de la negativa quedó en duda. No se
 * le contesta nada al cliente sobre ese punto: lo toma el equipo, que es el que
 * sabe si con esa modificación le entra.
 */
export function guiaCondicionSuperada(params: { moto: string; tipo: "hecho" | "previsto" }): string {
    return [
        `NO LE DIGAS QUE NO LE VA. (dato interno)`,
        params.tipo === "hecho"
            ? `El cliente dice que a su ${params.moto} ya le hizo la modificación que pedía la ficha, así que el "no es compatible" que tengo cargado es de una moto de fábrica y no habla de la suya.`
            : `El cliente está dispuesto a hacerle la modificación que pedía la ficha, así que el "no es compatible" que tengo cargado no contesta lo que está preguntando.`,
        `NO repitas la negativa, no la matices, no la expliques de nuevo.`,
        `NO le confirmes que ahora sí le va: eso lo define el equipo.`,
        `Ejecutá escalar_a_humano(motivo: 'compatibilidad_dudosa') y guardá silencio total sobre este punto. Si en el mismo mensaje preguntó otra cosa que una herramienta sí te contesta (envío, pago, horarios), esa sí se responde.`,
    ].join("\n")
}

/**
 * Guía para cuando la negativa YA se le dio a este cliente para esta moto y
 * sigue escribiendo del tema. Es la red de seguridad genérica: no mira qué dijo
 * ni por qué, solo que insistir después de un "no" es una charla de mostrador,
 * no de bot.
 */
export function guiaNegativaYaEntregada(params: { moto: string }): string {
    return [
        `LA NEGATIVA DE LA ${params.moto.toUpperCase()} YA SE LA DISTE EN ESTA CHARLA. (dato interno)`,
        `PROHIBIDO repetirla, reformularla o volver a explicar el motivo: el cliente ya la leyó y siguió escribiendo.`,
        `No sabés por qué insiste, así que no improvises una respuesta técnica.`,
        `Ejecutá escalar_a_humano(motivo: 'compatibilidad_dudosa') y guardá silencio total sobre este punto. Lo que haya preguntado por otro lado y una herramienta te conteste, eso sí se responde.`,
    ].join("\n")
}
