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
        // "170cc" / "kit170cc" / "220 cc" -> ".. 170 cc": el numero pegado a
        // "cc" no matchea la cilindrada del catalogo y el kit "170cc" del
        // anuncio de Instagram caia en "no se encontro".
        .replace(/(\d+)\s*cc\b/g, "$1 cc")
        // "kit170" / "zb110" -> "kit 170" / "zb 110": separa letra pegada a un
        // numero de 2-4 digitos (cilindrada). No toca "s2" (1 letra), "x3m"
        // (numero de 1 digito) ni "cb125f" (el numero no cierra en \b).
        .replace(/\b([a-z]{2,})(\d{2,4})\b/g, "$1 $2")
        .replace(/\s+/g, " ")
        .trim()
}

/**
 * Precio en formato es-AR de la casa: `$175.000` (sin decimales, sin espacio
 * despues del signo). `Intl.NumberFormat` con `currency: ARS` mete un espacio
 * duro (U+00A0) entre el `$` y el numero ("$ 175.000") que en WhatsApp se ve mal
 * y no es el estilo de Revolucion. Unico formateador de precios del proyecto.
 */
export function formatearPrecioAR(monto: number | null | undefined): string {
    const n = Number(monto) || 0
    const entero = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n)
    return `$${entero}`
}

/** Colapsa `$ 175.000` (con espacio o nbsp tras el signo) -> `$175.000` en un texto libre. */
export function normalizarSignoPeso(txt: string): string {
    // `\s` en JS ya incluye el espacio duro U+00A0 que mete Intl.NumberFormat
    return (txt || "").replace(/\$\s+(?=\d)/g, "$")
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

/**
 * Distancia de edicion con transposicion de caracteres adyacentes
 * (Optimal String Alignment / Damerau-Levenshtein restringido). A diferencia
 * de la Levenshtein pura, un swap de dos letras pegadas cuesta 1, no 2:
 * "blizt"->"blitz" = 1, "gilrea"->"gilera" = 1. Los typos por transposicion
 * son de los mas comunes al tipear rapido en el celular.
 */
export function distanciaOSA(a: string, b: string): number {
    if (a === b) return 0
    const m = a.length
    const n = b.length
    if (m === 0) return n
    if (n === 0) return m

    const d: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
    for (let i = 0; i <= m; i++) d[i][0] = i
    for (let j = 0; j <= n; j++) d[0][j] = j

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const costo = a[i - 1] === b[j - 1] ? 0 : 1
            d[i][j] = Math.min(
                d[i - 1][j] + 1,
                d[i][j - 1] + 1,
                d[i - 1][j - 1] + costo
            )
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
            }
        }
    }
    return d[m][n]
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

/**
 * Saca la pregunta final "a qué moto se lo querés poner?" de una plantilla de
 * bienvenida cuando la moto del cliente YA está confirmada.
 *
 * Las bienvenidas del catálogo cierran pidiendo la moto porque están escritas
 * para el primer contacto. Si el cliente clickea un anuncio a mitad de una
 * charla en la que ya dijo su moto, esa pregunta llega absurda (pasó en la
 * conv 3561: se le preguntó la moto una hora después de que dijera "Motomel S2").
 *
 * Solo toca la ÚLTIMA línea con contenido y solo si es exactamente esa
 * pregunta: si la plantilla cierra con otra cosa, no se modifica nada.
 */
const RX_PREGUNTA_MOTO_FINAL =
    /^\s*(?:y\s+)?(?:a|para|en)\s+(?:qu[eé]|cu[aá]l)\s+(?:moto|modelo|moto\s+o\s+modelo)\b[^\n?]*\?\s*$/i

export function quitarPreguntaDeMotoFinal(texto: string | null | undefined): string {
    const original = (texto || "").trim()
    if (!original) return ""

    const lineas = original.split("\n")
    let i = lineas.length - 1
    while (i >= 0 && lineas[i].trim() === "") i--
    if (i < 0) return original

    if (!RX_PREGUNTA_MOTO_FINAL.test(lineas[i])) return original

    const recortado = lineas.slice(0, i).join("\n").replace(/\n{3,}/g, "\n\n").trim()
    // Nunca dejar el mensaje vacío: si la plantilla era solo esa pregunta, se
    // manda tal cual (que no salga nada lo decide el motor, no este helper).
    return recortado.length > 0 ? recortado : original
}
