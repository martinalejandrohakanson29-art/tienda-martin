import { prisma } from "@/lib/prisma"
import { normalizarTexto, STOP_WORDS_CATALOGO } from "./texto"

/**
 * RUBRO AJENO — el cliente pidió un tipo de producto que no manejamos.
 * ---------------------------------------------------------------------------
 * Conv 4206 (15/09): "Un kit de potenciación / Y un kit de electricidad
 * tendrías?". El catálogo no matcheó "electricidad" y la guía del no-match le
 * ofrecía al modelo dos salidas: reintentar con otra búsqueda, o escalar. El
 * modelo eligió reintentar — pero reintentó con `termino_busqueda` VACÍO, que
 * no pasa por el scorer y vuelca TODOS los kits activos. A una 110 DLX le
 * terminó ofreciendo el kit dakar 200 y el 220.
 *
 * Que ese turno igual escalara fue suerte: la orden era condicional ("si sigue
 * sin aparecer"). Acá el no-match se clasifica de forma determinista, para que
 * el rubro que no vendemos derive al equipo y no dispare una segunda búsqueda.
 *
 * El criterio: se declara AJENO lo que no toca NI UNA palabra del catálogo ni
 * de los modelos de moto. Lo que conserva el reintento de siempre es el término
 * que mezcla algo nuestro ("cilindor 120 para wave"); un typo aislado sí cae en
 * ajeno y deriva, y está bien que así sea — al equipo le cuesta un vistazo, y
 * la alternativa es que el bot siga buscando a ciegas hasta volcar el catálogo.
 * Preferimos derivar una consulta de más que inventarle al cliente un producto
 * que no tenemos.
 */
export type ClaseTermino =
    /** Ni una palabra del término existe en el catálogo: es otro rubro. */
    | "ajeno"
    /** Algo del término sí es vocabulario nuestro: puede ser un typo o una forma rara. */
    | "conocido"
    /** No se pudo decidir (término vacío/numérico, o el vocabulario no cargó). */
    | "indefinido"

let cacheVocabulario: { data: Set<string>; ts: number } | null = null

/**
 * Todo el vocabulario que el negocio conoce: catálogo (nombres, alias, títulos,
 * categorías, criterios de variante) y modelos de moto.
 *
 * Caché de 60s, igual que `nucleo/motos.ts` y `nucleo/resto-no-cubierto.ts`:
 * corre por turno y el catálogo no cambia entre dos mensajes de una ráfaga.
 *
 * Si UNA sola consulta falla se devuelve null y el clasificador se abstiene
 * ("indefinido"). Con un vocabulario a medias, lo que no se pudo leer pasaría a
 * ser "ajeno" y el bot derivaría consultas normales de a tandas — el mismo
 * criterio que documenta `resto-no-cubierto`.
 */
async function cargarVocabulario(): Promise<Set<string> | null> {
    if (cacheVocabulario && Date.now() - cacheVocabulario.ts < 60_000) return cacheVocabulario.data

    const filas = await Promise.all([
        prisma.$queryRaw<{ txt: string | null }[]>`
            SELECT concat_ws(' ', alias, titulo_comercial, categoria) AS txt FROM chat_articulos
        `,
        prisma.$queryRaw<{ txt: string | null }[]>`
            SELECT concat_ws(' ', nombre, categoria, criterio_variante, array_to_string(sinonimos_variante, ' ')) AS txt
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
            console.error("[rubros] no se pudo cargar el vocabulario:", err?.message || err)
            return null
        })
    if (!filas || filas.length === 0) return null

    const vocabulario = new Set<string>()
    for (const fila of filas) {
        for (const palabra of normalizarTexto(fila.txt || "").split(" ")) {
            if (palabra.length >= 3) vocabulario.add(palabra)
        }
    }

    cacheVocabulario = { data: vocabulario, ts: Date.now() }
    return vocabulario
}

/** Solo para las pruebas: obliga a releer el catálogo en la próxima llamada. */
export function limpiarCacheRubros(): void {
    cacheVocabulario = null
    cacheCategorias = null
}

/**
 * Clasifica el término que NO tuvo match en el catálogo.
 *
 * Los números quedan afuera del análisis: una cilindrada suelta ("200") no dice
 * nada del rubro, y el guard de la moto ya se ocupa de ella aparte.
 */
export async function clasificarTerminoSinMatch(termino: string | null | undefined): Promise<ClaseTermino> {
    const norm = normalizarTexto(termino || "")
    if (!norm) return "indefinido"

    const tokens = norm
        .split(" ")
        .filter((p) => p.length >= 3 && !STOP_WORDS_CATALOGO.has(p) && !/^\d+$/.test(p))
    if (tokens.length === 0) return "indefinido"

    const vocabulario = await cargarVocabulario().catch(() => null)
    if (!vocabulario) return "indefinido"

    return tokens.some((t) => vocabulario.has(t)) ? "conocido" : "ajeno"
}

let cacheCategorias: { data: Map<string, Set<string>>; ts: number } | null = null

/**
 * Los RUBROS cargados en el catálogo, indexados por palabra.
 *
 * `chat_pack_grupos.categoria` y `chat_packs.categoria` son el dato que dice
 * "esto es un kit de potenciación", pero no entraban a ninguna búsqueda: el
 * corpus del scorer no las incluye, y "kit" es stop-word, así que el cliente
 * que escribe "un kit de potenciación" —el rubro entero del negocio— no
 * matcheaba NADA. De ahí salía el reintento que terminaba volcando el catálogo.
 *
 * Mapa: palabra de la categoría -> categorías que la contienen. Los números
 * quedan afuera ("Potenciacion 110" indexa solo "potenciacion"): la cilindrada
 * de la categoría no es lo que el cliente está nombrando cuando pide el rubro,
 * y cruzarla con la de su moto es justo el error que evita `terminoEsSoloMoto`.
 */
async function cargarCategorias(): Promise<Map<string, Set<string>> | null> {
    if (cacheCategorias && Date.now() - cacheCategorias.ts < 60_000) return cacheCategorias.data

    const filas = await Promise.all([
        prisma.$queryRaw<{ categoria: string | null }[]>`
            SELECT categoria FROM chat_pack_grupos WHERE categoria IS NOT NULL AND activo = true
        `,
        prisma.$queryRaw<{ categoria: string | null }[]>`
            SELECT categoria FROM chat_packs WHERE categoria IS NOT NULL AND activo = true
        `,
    ])
        .then((r) => r.flat())
        .catch((err) => {
            console.error("[rubros] no se pudieron cargar las categorías:", err?.message || err)
            return null
        })
    if (!filas) return null

    const indice = new Map<string, Set<string>>()
    for (const fila of filas) {
        const categoria = (fila.categoria || "").trim()
        if (!categoria) continue
        for (const palabra of normalizarTexto(categoria).split(" ")) {
            if (palabra.length < 4 || /^\d+$/.test(palabra)) continue
            if (!indice.has(palabra)) indice.set(palabra, new Set())
            indice.get(palabra)!.add(categoria)
        }
    }

    cacheCategorias = { data: indice, ts: Date.now() }
    return indice
}

/**
 * Las categorías del catálogo que el cliente está nombrando ("un kit de
 * potenciación" -> todas las de potenciación). Vacío si no nombra ninguna.
 *
 * Se usa como RESCATE, solo cuando el scorer no encontró nada: un cliente que
 * pide un producto puntual tiene que seguir cayendo en ese producto, no en su
 * rubro entero.
 */
export async function categoriasNombradas(termino: string | null | undefined): Promise<string[]> {
    const norm = normalizarTexto(termino || "")
    if (!norm) return []

    const indice = await cargarCategorias().catch(() => null)
    if (!indice) return []

    const encontradas = new Set<string>()
    for (const palabra of norm.split(" ")) {
        for (const categoria of indice.get(palabra) || []) encontradas.add(categoria)
    }
    return [...encontradas]
}
