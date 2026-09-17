import { prisma } from "@/lib/prisma"
import { normalizarTexto } from "./texto"

/**
 * LO QUE VENDEMOS SUELTO ES UN DATO, NO UNA POLÍTICA QUE EL BOT DEDUZCA
 * ---------------------------------------------------------------------
 * Conv 4394 (16/09). "Vendes levas solas" -> "Las levas las damos dentro de los
 * kits, no como pieza suelta". Las damos sueltas: hay tres levas activas en
 * `chat_articulos`, con precio y con el alias "leva sola" cargado a propósito.
 * Martín apagó el bot y la vendió a mano.
 *
 * La causa de raíz se arregla en `herramientas/catalogo-precios.ts` (el menú de
 * kits le ocultaba las piezas sueltas al modelo). Esto es el backstop: aunque
 * la guía falle, una frase que niega la venta por separado de algo que SÍ
 * vendemos por separado no sale al cliente.
 *
 * La regla de la casa es simple y está en la base: si la pieza está activa en
 * `chat_articulos`, se vende suelta. Es la misma premisa sobre la que ya
 * trabajan `cotizar_piezas_sueltas` y el bloque de piezas sueltas del catálogo.
 */

let cachePiezas: { data: Set<string>; ts: number } | null = null

/**
 * Las palabras con las que se nombra a una pieza que vendemos suelta.
 *
 * Sale de `titulo_comercial` y `categoria`, NO de `alias`: los alias están
 * escritos para el matching de búsqueda y traen justamente las palabras de la
 * negación ("leva sola", "cilindro solo", "nada mas"). Con ellas adentro, el
 * detector marcaría cualquier oración que diga "solo" y dejaría de distinguir.
 *
 * Caché de 60s, igual que `nucleo/rubros.ts`: corre por turno y el catálogo no
 * cambia entre dos mensajes de una ráfaga. Null si la consulta falla — el que
 * llama se abstiene y el mensaje sale como estaba.
 */
async function cargarPiezasSueltas(): Promise<Set<string> | null> {
    if (cachePiezas && Date.now() - cachePiezas.ts < 60_000) return cachePiezas.data

    const filas = await prisma
        .$queryRaw<{ txt: string | null }[]>`
            SELECT concat_ws(' ', titulo_comercial, categoria) AS txt
            FROM chat_articulos
            WHERE activo = true
        `
        .catch((err) => {
            console.error("[venta-suelta] no se pudieron cargar las piezas sueltas:", err?.message || err)
            return null
        })
    if (!filas) return null

    const vocabulario = new Set<string>()
    for (const fila of filas) {
        for (const palabra of normalizarTexto(fila.txt || "").split(" ")) {
            // 4 letras para abajo son ruido de nombre comercial ("de", "alto",
            // "cg") y los números son medidas, no el nombre de la pieza.
            if (palabra.length >= 4 && !/^\d+$/.test(palabra)) vocabulario.add(palabra)
        }
    }

    cachePiezas = { data: vocabulario, ts: Date.now() }
    return vocabulario
}

/** Solo para las pruebas: obliga a releer el catálogo en la próxima llamada. */
export function limpiarCacheVentaSuelta(): void {
    cachePiezas = null
}

/** "levas" -> "leva": el bot habla en plural y el catálogo nombra en singular. */
function singular(palabra: string): string {
    if (palabra.endsWith("es") && palabra.length > 4) return palabra.slice(0, -2)
    if (palabra.endsWith("s") && palabra.length > 3) return palabra.slice(0, -1)
    return palabra
}

/**
 * ¿Esta oración nombra una pieza que vendemos suelta? Devuelve el nombre tal
 * como lo escribió el bot, o null.
 */
export async function piezaQueVendemosSuelta(oracion: string): Promise<string | null> {
    const palabras = normalizarTexto(oracion).split(" ").filter(Boolean)
    if (palabras.length === 0) return null

    const vocabulario = await cargarPiezasSueltas().catch(() => null)
    if (!vocabulario) return null

    for (const palabra of palabras) {
        if (palabra.length < 4) continue
        if (vocabulario.has(palabra) || vocabulario.has(singular(palabra))) return palabra
    }
    return null
}
