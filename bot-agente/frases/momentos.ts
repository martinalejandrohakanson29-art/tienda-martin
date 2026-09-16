/**
 * LOS MOMENTOS DE LA VENTA QUE TIENEN LETRA PROPIA
 * ------------------------------------------------
 * Lista cerrada, en código, a propósito. El `momento` es un contrato entre
 * tres lados: la herramienta que lo declara al resolver su paso, la fila de
 * `chat_frases` que le carga la letra, y el panel que la ofrece para editar.
 * Si fuera texto libre, una fila con un momento mal tipeado quedaría cargada,
 * activa y muda para siempre — nadie se enteraría de que no se usa nunca.
 *
 * Agregar un momento nuevo es declararlo acá y setearlo en el retorno de la
 * herramienta que lo resuelve. Son los dos únicos lugares.
 *
 * Este archivo NO importa Prisma ni nada del servidor: lo comparte el panel.
 */

export type MomentoFrase =
    | "compat_confirmada"
    | "variante_resuelta"
    | "precio_presentado"
    | "pieza_suelta"
    | "info_negocio"
    | "cierre"

export interface DefinicionMomento {
    momento: MomentoFrase
    /** Nombre del momento en el panel. */
    titulo: string
    /** Cuándo se inyecta, contado como lo ve el cliente. */
    cuando: string
    /** Placeholders que tienen dato real en este momento. */
    placeholders: string[]
    ejemplo: string
}

/**
 * `cierre` es el único transversal: ninguna herramienta lo resuelve, porque
 * cerrar no es un paso del embudo. Va al bloque de contexto del turno, y solo
 * si tiene frases activas — vacío, no cuesta un token.
 */
export const MOMENTO_TRANSVERSAL: MomentoFrase = "cierre"

export const MOMENTOS: DefinicionMomento[] = [
    {
        momento: "compat_confirmada",
        titulo: "El kit le va a su moto",
        cuando: "Cuando la compatibilidad da positiva y hay que confirmársela al cliente.",
        placeholders: ["{moto}", "{kit}"],
        ejemplo: "Este kit va perfecto para tu {moto}"
    },
    {
        momento: "variante_resuelta",
        titulo: "Se definió la variante",
        cuando: "Cuando ya se sabe qué opción lleva (recorrido, leva, color) y se confirma con su precio.",
        placeholders: ["{kit}", "{precio}", "{moto}", "{envio}"],
        ejemplo: "Entonces vas con {kit}, te queda en {precio} con {envio}"
    },
    {
        momento: "precio_presentado",
        titulo: "Se presenta el kit con su precio",
        cuando: "Cuando se le pasan las opciones del combo y los precios por primera vez.",
        placeholders: ["{kit}", "{precio}", "{envio}"],
        ejemplo: "Mirá, el {kit} te sale {precio} con {envio}"
    },
    {
        momento: "pieza_suelta",
        titulo: "Precio de una pieza sola",
        cuando: "Cuando el cliente pide una pieza por separado y se le cotiza.",
        placeholders: ["{kit}", "{precio}", "{envio}"],
        ejemplo: "La {kit} sola te queda en {precio}"
    },
    {
        momento: "info_negocio",
        titulo: "Envío, pago, garantía o ubicación",
        // OJO: es UN solo momento para los 7 temas de `info_negocio` (envíos,
        // pago, garantía, ubicación, horarios, mayorista, otro). Una frase que
        // nombre un tema puntual se le va a ofrecer igual cuando el cliente
        // pregunte por otro, así que acá solo entra registro que sirva para
        // cualquiera. Los hechos (plazos, montos, transportista, direccion) van
        // en info_negocio y no se repiten acá: duplicarlos es como quedan dos
        // verdades distintas cuando una cambia.
        cuando:
            "Cuando se contesta una condición de la venta. Es el mismo momento para envíos, pago, garantía, ubicación y horarios: la frase tiene que servir para cualquiera de esos temas. El dato en sí va en Info del Negocio.",
        placeholders: [],
        ejemplo: "Te cuento cómo lo manejamos nosotros"
    },
    {
        momento: "cierre",
        titulo: "Cierre del mensaje",
        cuando: "Se ofrece en todos los turnos, como repertorio de cierres cortos. Solo si cargás frases acá.",
        placeholders: [],
        ejemplo: "Cualquier cosa avisanos y coordinamos"
    }
]

/** Datos del turno que rellenan los placeholders, si el paso los tiene. */
export interface DatosFrase {
    moto?: string | null
    kit?: string | null
    precio?: string | null
    /**
     * La clausula de envio que corresponde a ESE producto, segun lo cargado en
     * la base (la resuelve `nucleo/envio.ts`, la pasa la herramienta). Vacia
     * cuando el envio no es gratis o no hay dato: ahi la frase sale sin la
     * clausula en vez de prometer algo que no consta.
     */
    envio?: string | null
}

/**
 * Rellena los placeholders con los datos del turno.
 *
 * Un placeholder sin dato NO queda a la vista: se saca junto con el articulo o
 * la preposicion que lo precede, porque "va perfecto para tu {moto}" sin moto
 * tiene que salir como "va perfecto" y no como "va perfecto para tu". La frase
 * se le da al modelo como muestra de registro, asi que tiene que leerse
 * entera.
 *
 * Vive aca, y no en el index del modulo, porque el panel la usa para la vista
 * previa y ese import no puede arrastrar Prisma al bundle del navegador.
 */
export function rellenarFrase(frase: string, datos: DatosFrase): string {
    const valores: Record<string, string | undefined> = {
        moto: datos.moto?.trim() || undefined,
        kit: datos.kit?.trim() || undefined,
        precio: datos.precio?.trim() || undefined,
        envio: datos.envio?.trim() || undefined
    }

    let texto = frase
    for (const clave of ["moto", "kit", "precio", "envio"] as const) {
        const soloLlave = new RegExp(`\\{${clave}\\}`, "g")
        const valor = valores[clave]
        if (valor) {
            texto = texto.replace(soloLlave, valor)
            continue
        }
        // Se come el artículo o la preposición pegada al placeholder ("para tu
        // {moto}", "a la {moto}", "el {kit}") y no solo la llave.
        const conPrevias = new RegExp(
            `\\s*\\b(?:para|a|en|de|con)?\\s*(?:tu|su|el|la|los|las|un|una)?\\s*\\{${clave}\\}`,
            "gi"
        )
        texto = texto.replace(conPrevias, "").replace(soloLlave, "")
    }

    texto = texto
        .replace(/\s{2,}/g, " ")
        .replace(/\s+([.,!?])/g, "$1")
        .trim()

    // Si el placeholder estaba al arranque, el recorte se lleva la mayúscula
    // con él ("A la {moto} le entra directo" -> "le entra directo"). Se
    // devuelve: la frase se le muestra al modelo como muestra de registro, y
    // una que empieza en minúscula le enseña a escribir así.
    const arrancabaEnMayuscula = /^[A-ZÁÉÍÓÚÑ]/.test(frase.trim())
    if (arrancabaEnMayuscula && /^[a-záéíóúñ]/.test(texto)) {
        texto = texto.charAt(0).toUpperCase() + texto.slice(1)
    }

    return texto
}

const CLAVES = new Set<string>(MOMENTOS.map((m) => m.momento))

export function esMomentoValido(valor: string | null | undefined): valor is MomentoFrase {
    return Boolean(valor) && CLAVES.has(valor as string)
}

export function tituloMomento(momento: string): string {
    return MOMENTOS.find((m) => m.momento === momento)?.titulo || momento
}
