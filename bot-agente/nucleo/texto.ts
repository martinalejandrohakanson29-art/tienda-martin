/**
 * Utilidades de texto compartidas por todo el bot-agente.
 *
 * ANTES estaban duplicadas (casi textualmente) en `herramientas/catalogo-precios.ts`
 * y `herramientas/compatibilidad.ts`. Cada vez que se ajustaba el matching habia
 * que tocar los dos lugares y era facil que se desincronizaran.
 *
 * REGLA: si hay que tunear como se normaliza o se puntua un termino del catalogo,
 * se toca ACA y en un solo lugar. Nada de volver a copiar el scorer a otra tool.
 */

// Rango de marcas diacriticas combinantes U+0300..U+036F (construido para no
// depender de caracteres invisibles en el fuente).
const RX_DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g")

/** Minusculas, sin tildes, sin signos raros, espacios colapsados. */
export function normalizarTexto(txt: string | null | undefined): string {
    return (txt || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(RX_DIACRITICOS, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

/** Distancia de edicion de Levenshtein (para tolerar typos de modelos de moto). */
export function distanciaLevenshtein(a: string, b: string): number {
    if (a === b) return 0
    if (a.length === 0) return b.length
    if (b.length === 0) return a.length

    const matrix: number[][] = []
    for (let i = 0; i <= b.length; i++) matrix[i] = [i]
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1]
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                )
            }
        }
    }
    return matrix[b.length][a.length]
}

/** Stop-words que no aportan al matching de un termino de catalogo. */
export const STOP_WORDS_CATALOGO = new Set([
    "combo", "kit", "para", "con", "de", "del", "el", "la", "los", "las", "un", "una",
    "y", "mas", "recorrido", "corto", "largo", "distribucion", "regalo", "corona"
])

/** Palabras que, si el cliente las pide, un item que no las tiene NO debe matchear. */
export const PALABRAS_DISTINTIVAS_CATALOGO = ["tapa", "cdi", "escape", "pwr", "leva", "dakar", "varillero"]

/** Palabras con las que el cliente pide explicitamente el kit "base" sin tapa/cdi. */
export const PALABRAS_SIN_TAPA = ["comun", "base", "estandar", "simple"]

const limpiarStop = (s: string) =>
    s.split(" ").filter((w) => !STOP_WORDS_CATALOGO.has(w)).join(" ")

/**
 * Puntua que tan bien matchea el nombre de un kit/combo/grupo contra el termino
 * que busco el cliente. Unico scorer del proyecto: lo usan el catalogo y la
 * deteccion de kits ambiguos en compatibilidad.
 *
 * Devuelve un score; el llamador decide el umbral (tipicamente `maxScore * 0.75`
 * y un piso absoluto de 30).
 */
export function puntuarItemCatalogo(
    terminoBuscado: string,
    nombreItem: string,
    corpusExtra: string = ""
): number {
    const termNorm = normalizarTexto(terminoBuscado)
    const normNombre = normalizarTexto(nombreItem)
    const normCorpus = normalizarTexto(corpusExtra)

    const bClean = limpiarStop(termNorm)
    const iClean = limpiarStop(normNombre)

    const tokensTerm = termNorm.split(" ").filter((w) => w.length >= 2 && !STOP_WORDS_CATALOGO.has(w))
    const numerosTerm: string[] = termNorm.match(/\b\d+\b/g) || []
    const distintivasTerm = tokensTerm.filter((w) => PALABRAS_DISTINTIVAS_CATALOGO.includes(w))
    const pideSinTapa = tokensTerm.some((w) => PALABRAS_SIN_TAPA.includes(w))

    const tokensNombre = normNombre.split(" ").filter((w) => w.length >= 2 && !STOP_WORDS_CATALOGO.has(w))
    const numerosNombre: string[] = normNombre.match(/\b\d+\b/g) || []

    let score = 0

    // 1. Coincidencia exacta o inclusion de nombre limpio
    if (normNombre === termNorm || iClean === bClean) {
        score += 1000
    } else if (bClean.length >= 2 && (iClean.includes(bClean) || bClean.includes(iClean))) {
        if (/^\d+$/.test(bClean)) score += 150 // solo una cilindrada aislada: score moderado
        else score += 500
    } else if (normNombre.includes(termNorm) || termNorm.includes(normNombre)) {
        score += 500
    }

    // 2. Tokens distintivos (tapa, cdi, escape, pwr, leva, dakar, varillero)
    for (const d of distintivasTerm) {
        if (tokensNombre.includes(d) || normNombre.includes(d)) score += 150
        else score -= 300
    }

    // Si pidio "comun"/"base" y el item tiene tapa o cdi
    if (pideSinTapa && (normNombre.includes("tapa") || normNombre.includes("cdi"))) {
        score -= 300
    }

    // 3. Cilindrada / numeros
    for (const n of numerosTerm) {
        if (numerosNombre.includes(n)) {
            score += 100
        } else if (Number(n) >= 50 && numerosNombre.some((x) => Number(x) >= 50 && x !== n)) {
            score -= 300 // cilindrada distinta (busca 170, el item es 120)
        }
    }

    // 4. Otros tokens
    for (const t of tokensTerm) {
        if (!PALABRAS_DISTINTIVAS_CATALOGO.includes(t) && !numerosTerm.includes(t)) {
            if (tokensNombre.includes(t)) score += 40
            else if (normCorpus.includes(t)) score += 15
        }
    }

    return score
}
