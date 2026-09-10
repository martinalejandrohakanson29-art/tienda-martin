import { prisma } from "@/lib/prisma"
import { normalizarTexto } from "./texto"

/**
 * RESTO NO CUBIERTO — qué dijo el cliente que NINGUNA herramienta miró.
 * ---------------------------------------------------------------------------
 * Por qué existe (conv 3820, 10/09): el cliente escribió "No leva larga con
 * freno". `resolver_variante` matchea contra `sinonimos_variante` — vio
 * "larga", devolvió VARIANTE RESUELTA + $99.000 — y la palabra "freno" se cayó
 * del análisis en silencio: no matchear no generaba ninguna señal. La guía de
 * la herramienta termina con "si el cliente preguntó otra cosa en el mismo
 * mensaje, respondé eso también", así que el modelo, para no dejar el tema
 * suelto, lo absorbió en la confirmación: "Con freno: $99.000". Le puso precio
 * a una configuración que no existe (el grupo tiene dos packs, leva corta y
 * leva larga, y "freno" no aparece en ningún artículo del catálogo).
 *
 * Es la misma familia que "el bot no ofrece sin tool", del otro lado: acá no
 * inventa una oferta, RATIFICA como dato un atributo que puso el cliente.
 *
 * Qué hace esto: descuenta del mensaje todo lo que el sistema SÍ consumió (los
 * sinónimos y etiquetas de las variantes, la moto, el nombre del combo), lo que
 * es vocabulario conocido (catálogo y modelos de moto) y la charla normal de
 * WhatsApp. Lo que queda es un término que nadie miró.
 *
 * Deliberadamente NO decide sola que hay que escalar: devuelve el término y la
 * guía le pone la regla dura (no confirmarlo, no cotizarlo, no darlo por
 * incluido) más el escalado CONDICIONADO a que sea algo del producto. Un falso
 * positivo ("mi cuñado", una marca de nafta) así no genera un escalado espurio,
 * pero la afirmación inventada —que es el daño real— queda bloqueada igual.
 *
 * Fuera de alcance a propósito: la pieza que SÍ está en el catálogo pero no
 * pertenece a este pack ("y la corona?"). Ese caso tiene dueño propio
 * (`cotizar_piezas_sueltas` / la composición del pack) y meterlo acá haría que
 * este detector opine sobre cosas que otra herramienta responde bien.
 */

/**
 * Palabras que un cliente usa para hablar, comprar y preguntar por temas que
 * OTRAS herramientas ya cubren (envío, pago, demora, garantía, ubicación).
 * Ninguna es un atributo de producto, así que ninguna puede disparar el aviso.
 * Lista chata a propósito: es más barato agregar una palabra acá que explicar
 * por qué el bot se quedó mudo con un cliente.
 */
const CHARLA_CONOCIDA = new Set([
    // saludos y cortesía
    "hola", "buenas", "buenos", "buen", "dias", "tardes", "noches", "gracias", "favor",
    "saludos", "amigo", "amiga", "bro", "capo", "maestro", "master", "chau", "abrazo",
    "dale", "bueno", "buenisimo", "genial", "perfecto", "barbaro", "excelente", "listo",
    "claro", "obvio", "okey", "joya", "copado",
    // tiempo y conectores
    "ahora", "despues", "luego", "entonces", "tambien", "tampoco", "todavia", "recien",
    "siempre", "nunca", "cuando", "donde", "cuanto", "cuanta", "cuantos", "cuantas",
    "cual", "cuales", "como", "porque", "pero", "para", "esta", "este", "esto", "esos",
    "esas", "ese", "esa", "mismo", "misma", "todo", "toda", "todos", "todas", "algo",
    "nada", "otra", "otro", "solo", "sola", "mas", "menos", "bien", "mejor", "peor",
    "igual", "aparte", "encima",
    // querer / tener / poder
    "quiero", "queria", "quisiera", "queres", "necesito", "necesita", "necesitan",
    "tengo", "tenes", "tiene", "tienen", "tenia", "puedo", "podes", "puede", "pueden",
    "hacen", "hace", "hacer", "sirve", "sirven", "anda", "andan", "funciona", "funcionan",
    "viene", "vienen", "trae", "traen", "lleva", "llevan", "queda", "quedan", "seria",
    "serian", "existe", "existen",
    // compra y logística (tienen sus propias herramientas)
    "precio", "precios", "costo", "costos", "sale", "salen", "cuesta", "cuestan", "vale",
    "valen", "plata", "pesos", "presupuesto", "cotizar", "cotizacion", "descuento",
    "oferta", "envio", "envios", "enviar", "manda", "mandan", "mandar", "mandame",
    "llega", "llegar", "demora", "demoran", "tarda", "tardan", "correo", "andreani",
    "pago", "pagar", "pagos", "tarjeta", "efectivo", "transferencia", "cuotas", "deposito",
    "factura", "garantia", "cambio", "devolucion", "stock", "disponible", "local",
    "direccion", "ubicacion", "ubicados", "horario", "horarios", "abren", "cierran",
    "compro", "comprar", "comprarlo", "llevo", "llevar", "reservar", "reserva",
    // el producto en abstracto y el taller
    "moto", "motos", "modelo", "marca", "cilindrada", "kits", "combo", "combos", "pieza",
    "piezas", "repuesto", "repuestos", "producto", "articulo", "medida", "medidas",
    "variante", "opcion", "opciones", "poner", "ponerle", "ponerlo", "colocar", "colocarlo",
    "instalar", "armar", "cambiar", "desarmar", "medir", "fijarme", "fijar", "mecanico",
    "taller", "original", "nuevo", "nueva", "usado", "consulta", "consultar", "pregunta",
    "preguntar", "avisame", "decime", "pasame", "mostrame", "info", "informacion", "foto",
    "fotos", "video", "link", "mercadolibre", "whatsapp", "instagram",
])

/** Unidades pegadas al número ("74mm", "110cc"): no son un término aparte. */
const RX_SOLO_NUMERO_O_MEDIDA = /^\d+([.,]\d+)?(mm|cm|cc|hp|kg)?$/

/**
 * Palabras que ADOSAN algo al pedido. Solo lo que viene detrás de una de estas
 * puede disparar el aviso.
 *
 * Sin este filtro el detector se vuelve inusable: probado contra el catálogo
 * real, "cuanto demora el envio a Corrientes?" avisaba por "Corrientes" y
 * "cualquier cosa te aviso" por tres palabras de nada. Ninguna lista blanca
 * cubre los topónimos y las conjugaciones del español, y cada falso positivo es
 * un escalado que el equipo no pidió.
 *
 * El recorte es a propósito y deja pasar formas más sueltas ("la larga, freno
 * nuevo tambien"): el daño concreto —afirmar un atributo como incluido y
 * cotizarlo— vive en el patrón "con X", que es como el cliente especifica lo
 * que quiere que venga en el combo.
 */
const MARCADORES_ADOSA = new Set([
    "con", "sin", "incluye", "incluido", "incluidos", "incluida", "incluidas",
    "trae", "traiga", "lleva", "lleve", "agregale", "sumale", "ademas",
])

/** Artículos y posesivos que se saltean entre el marcador y el término ("con el freno"). */
const RELLENO_TRAS_MARCADOR = new Set([
    "el", "la", "los", "las", "un", "una", "unos", "unas", "su", "sus", "mi", "mis",
    "ese", "esa", "este", "esta", "otro", "otra",
])

let cacheVocabulario: { data: Set<string>; ts: number } | null = null

/**
 * Todas las palabras que el sistema "conoce": catálogo (alias, títulos, packs,
 * grupos, categorías) y modelos de moto. Si el término del cliente está acá no
 * es desconocido — la herramienta que le corresponde puede resolverlo.
 *
 * Caché de 60s, igual que `nucleo/motos.ts`: esto corre en cada turno donde se
 * resuelve una variante, y el vocabulario cambia cuando se toca el catálogo, no
 * entre dos mensajes de la misma ráfaga.
 */
async function cargarVocabularioConocido(): Promise<Set<string> | null> {
    if (cacheVocabulario && Date.now() - cacheVocabulario.ts < 60_000) return cacheVocabulario.data

    // Si UNA sola de las cuatro falla se aborta: con un vocabulario a medias, lo
    // que no se pudo leer pasa a ser "desconocido" y el bot escala consultas
    // perfectamente normales. Sin vocabulario, este detector se calla — el
    // costo de callarse es volver al comportamiento de antes; el de un
    // vocabulario parcial es una tanda de escalados espurios al equipo.
    const filas = await Promise.all([
        prisma.$queryRaw<{ txt: string | null }[]>`
            SELECT concat_ws(' ', alias, titulo_comercial, categoria) AS txt FROM chat_articulos
        `,
        prisma.$queryRaw<{ txt: string | null }[]>`
            SELECT concat_ws(' ', nombre, criterio_variante, array_to_string(sinonimos_variante, ' ')) AS txt
            FROM chat_packs
        `,
        prisma.$queryRaw<{ txt: string | null }[]>`
            SELECT concat_ws(' ', nombre, categoria) AS txt FROM chat_pack_grupos
        `,
        prisma.$queryRaw<{ txt: string | null }[]>`
            SELECT concat_ws(' ', modelo, nombre_completo, array_to_string(aliases, ' ')) AS txt
            FROM motos_modelos
        `,
    ])
        .then((r) => r.flat())
        .catch((err) => {
            console.error("[resto-no-cubierto] no se pudo cargar el vocabulario:", err?.message || err)
            return null
        })
    if (!filas || filas.length === 0) return null

    const vocabulario = new Set<string>()
    for (const fila of filas) {
        for (const palabra of tokenizar(fila.txt || "")) vocabulario.add(palabra)
    }

    cacheVocabulario = { data: vocabulario, ts: Date.now() }
    return vocabulario
}

/** Palabras normalizadas de 3+ letras (las cortas no discriminan nada). */
function tokenizar(texto: string): string[] {
    return normalizarTexto(texto)
        .split(" ")
        .filter((p) => p.length >= 3 && !RX_SOLO_NUMERO_O_MEDIDA.test(p))
}

export interface RestoNoCubierto {
    /** Los términos, tal cual los escribió el cliente. */
    terminos: string[]
    /** Bloque listo para pegar en el `mensaje_para_agente` de la herramienta. */
    aviso: string
}

/**
 * @param mensajeCliente lo último que dijo el cliente.
 * @param consumido todo lo que el sistema sí miró en este turno (sinónimos y
 *        etiquetas de las variantes, la moto, el nombre del combo).
 */
export async function detectarRestoNoCubierto(
    mensajeCliente: string | null | undefined,
    consumido: string[]
): Promise<RestoNoCubierto | null> {
    const original = (mensajeCliente || "").trim()
    if (!original) return null

    const yaMirado = new Set<string>()
    for (const texto of consumido) {
        for (const palabra of tokenizar(texto || "")) yaMirado.add(palabra)
    }

    const vocabulario = await cargarVocabularioConocido().catch(() => null)
    if (!vocabulario) return null

    // Se recorren las palabras del mensaje ORIGINAL para poder devolverle al
    // modelo el término como lo escribió el cliente, no su forma normalizada.
    const crudas = original.split(/[^\p{L}\p{N}.]+/u).filter(Boolean)
    const terminos: string[] = []
    const vistos = new Set<string>()
    /** Venimos de un "con"/"sin"/"trae" (o de un término ya marcado: "con pistón forjado"). */
    let adosando = false

    for (const crudo of crudas) {
        const palabra = normalizarTexto(crudo)
        if (!palabra) continue

        if (MARCADORES_ADOSA.has(palabra)) {
            adosando = true
            continue
        }
        if (adosando && RELLENO_TRAS_MARCADOR.has(palabra)) continue

        const conocida =
            palabra.length < 4 ||
            RX_SOLO_NUMERO_O_MEDIDA.test(palabra) ||
            yaMirado.has(palabra) ||
            vocabulario.has(palabra) ||
            CHARLA_CONOCIDA.has(palabra)

        if (conocida) {
            // Una palabra que el sistema sí conoce corta la cadena: lo que venga
            // después ya no está pegado al "con" ("con leva larga y despues veo").
            adosando = false
            continue
        }
        if (!adosando) continue

        if (!vistos.has(palabra)) {
            vistos.add(palabra)
            terminos.push(crudo.trim())
        }
        // Se sigue "adosando": un término desconocido puede venir con su
        // calificativo pegado ("con pistón forjado").
    }

    if (terminos.length === 0) return null

    const lista = terminos.map((t) => `"${t}"`).join(", ")
    return {
        terminos,
        aviso: [
            `OJO — EL CLIENTE DIJO ALGO QUE EL SISTEMA NO MIRO: ${lista}.`,
            `No es parte de este combo ni de ninguna de sus variantes, y ninguna herramienta te dio un dato sobre eso.`,
            `PROHIBIDO confirmarlo, cotizarlo, nombrarlo junto al precio o darlo por incluido (ni "con ${terminos[0]}: $X", ni "viene con ${terminos[0]}").`,
            `Si es algo del producto (una pieza, una medida, una version que pide): ejecuta escalar_a_humano(motivo: 'producto_no_catalogado') y guarda silencio sobre ESE punto.`,
            `Si es un comentario que no tiene que ver con lo que vendemos, ignoralo y no lo menciones.`,
            // Sin esta línea el modelo trata TODO el turno como derivado y
            // contesta SIN_RESPUESTA: en la prueba de la conv 3820 el cliente se
            // quedaba sin la confirmación de la leva larga, que estaba resuelta
            // y no dependía del término derivado. Derivar es dejar muda esa
            // consulta, no la charla.
            `IMPORTANTE: lo que SI esta resuelto arriba (la variante y su precio) se lo confirmas igual en este mismo mensaje, sin nombrar ${lista} ni dar a entender que lo incluye. NO respondas SIN_RESPUESTA por esto.`,
        ].join("\n"),
    }
}
