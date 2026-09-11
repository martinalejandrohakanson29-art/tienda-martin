/**
 * Resolucion de la moto del cliente CON NIVEL DE CONFIANZA.
 * -----------------------------------------------------------------------------
 * El problema que resuelve (Opcion 3, charla del 07/09 con Martin):
 *   `consultar_compatibilidad` devolvia un booleano desnudo. Matcheaba una fila
 *   floja ("blitz" a secas) contra un cliente que fue mas especifico ("blitz
 *   150") y lo cantaba como CERTEZA. La herramienta mentia una confianza que no
 *   tenia.
 *
 * La idea: la herramienta primero resuelve QUE moto es, y sabe si esa
 * resolucion es firme o no. No es una regla por atributo (cilindrada, año,
 * color...) — es UN concepto: "el registro tiene que ser al menos tan
 * especifico como lo que dijo el cliente, y no contradecirlo".
 *
 *   exacta      -> el texto del cliente es un modelo/alias tal cual.
 *   aproximada  -> matchea una sola familia y no hay contradiccion (typo, o el
 *                  cliente fue mas vago que el catalogo).
 *   ambigua     -> el cliente dio un dato distintivo (una cilindrada) que NO
 *                  cierra con ningun modelo conocido, O la familia tiene varios
 *                  modelos y no dijo cual. Se devuelven los candidatos para que
 *                  la IA pregunte con contexto, en vez de adivinar o escalar.
 *   ninguna     -> no se reconocio nada -> escalado.
 */

import { prisma } from "@/lib/prisma"
import { normalizarTexto, distanciaOSA } from "./texto"

export interface MotoCanonica {
    id: number
    nombre_completo: string
    cilindrada: number | null
    aliases: string[]
}

export type ConfianzaMoto = "exacta" | "aproximada" | "ambigua" | "ninguna"

export interface ResolucionMoto {
    confianza: ConfianzaMoto
    /** Modelo resuelto (solo en exacta / aproximada). */
    modelo?: MotoCanonica
    /** Modelos posibles de la familia (solo en ambigua). */
    candidatos: MotoCanonica[]
    /** Cilindrada que dijo el cliente y no cierra con ningun modelo conocido. */
    cilindradaCliente?: number
    /** Motivo legible de la ambiguedad. */
    detalle?: string
}

/**
 * Numeros que parecen una cilindrada (50-2000).
 *
 * El tope de 2000 es el que deja afuera los AÑOS: "wave s 2022" nombra un
 * modelo, no una cilindrada de 2022cc. Lo usa tambien `compatibilidad.ts` para
 * descartar filas que hablan de otra cilindrada; si se toca el rango, se toca
 * para los dos.
 */
export function cilindradasEn(texto: string): number[] {
    const nums = (normalizarTexto(texto).match(/\b\d{2,4}\b/g) || []).map(Number)
    return nums.filter((n) => n >= 50 && n <= 2000)
}

/**
 * Marcas de fabrica. Nombran una fabrica, no un modelo: por si solas nunca
 * definen familia ni confirman nada. `compatibilidad.ts` tenia su propia copia
 * de esta lista y se desincronizaron (le faltaban "bajaj" y "suzuki"), asi que
 * de aca sale la unica.
 */
export const MARCAS_MOTO = new Set([
    "honda", "yamaha", "motomel", "zanella", "gilera", "corven", "keller",
    "brava", "mondial", "guerrero", "bajaj", "suzuki",
])

/** Palabras "de identidad" del modelo: no numeros, no marcas, 3+ letras. */
const MARCAS = new Set([...MARCAS_MOTO, "moto", "para", "una", "mi"])

/**
 * Relleno de la frase: no nombra ni marca ni modelo. Si sacando marcas y
 * relleno no queda NADA, el cliente dijo solo la marca.
 *
 * La lista es corta a proposito: lo que no este aca cuenta como palabra de
 * contenido y el caso NO se toma como "marca sola" — o sea que el error por
 * omision cae del lado de escalar, que es el comportamiento de siempre.
 */
const RELLENO = new Set([
    "para", "una", "un", "uno", "mi", "mis", "la", "el", "los", "las",
    "de", "del", "con", "que", "es", "tengo", "ando", "tiene", "seria",
    "sobre", "en", "por", "moto", "motito", "marca", "modelo", "chino",
    "china", "chinita", "cc", "cilindrada", "yo", "ser",
])

/**
 * ¿El cliente dijo SOLO la marca, sin modelo ni cilindrada? ("para una Gilera")
 *
 * No es lo mismo que "no se que moto es" (conv 3947, 11/09): ahi falta UN dato y
 * preguntarlo lo consigue, igual que en el caso "parcial". El bot escalaba en
 * silencio y un compañero tenia que escribir "cual gilera bro?" — justo la
 * pregunta que el bot podia hacer solo, y encima despues de haber sido EL quien
 * pregunto "para que moto estas buscando?".
 *
 * Si el cliente dio cilindrada ("gilera 110") o nombro algo que no es la marca
 * ("gilera altino"), esto devuelve null: ahi ya dio el dato y repreguntarselo
 * seria pedirle algo que ya dijo — ese caso sigue su camino de siempre
 * (compatibilidad por fila generica, o escalado si no consta).
 */
export function marcaSinModelo(texto: string): string | null {
    const norm = normalizarTexto(texto || "")
    if (!norm) return null
    if (cilindradasEn(norm).length > 0) return null

    const tokens = norm.split(" ").filter(Boolean)
    const marca = tokens.find((t) => MARCAS_MOTO.has(t))
    if (!marca) return null

    const contenido = tokens.filter((t) => !MARCAS_MOTO.has(t) && !RELLENO.has(t) && isNaN(Number(t)))
    if (contenido.length > 0) return null

    return marca
}

/**
 * Cuantas veces se le puede repreguntar la moto a un cliente antes de derivar.
 * Dos: la primera es la pregunta legitima, la segunda una reformulacion. A la
 * tercera el cliente ya contesto dos veces sin precisar y seguir preguntando es
 * hacerlo sentir en un interrogatorio — va al equipo.
 */
export const TOPE_REPREGUNTAS_MOTO = 2

function palabrasModelo(texto: string): string[] {
    return normalizarTexto(texto)
        .split(" ")
        .filter((w) => w.length >= 3 && isNaN(Number(w)) && !MARCAS.has(w))
}

let cacheModelos: { data: MotoCanonica[]; ts: number } | null = null
async function cargarModelos(): Promise<MotoCanonica[]> {
    if (cacheModelos && Date.now() - cacheModelos.ts < 60_000) return cacheModelos.data
    const filas = await prisma.$queryRaw<MotoCanonica[]>`
        SELECT id, nombre_completo, cilindrada, aliases FROM motos_modelos
    `.catch(() => [] as MotoCanonica[])
    cacheModelos = { data: filas, ts: Date.now() }
    return filas
}

/** Cilindradas conocidas de un modelo (la columna + cualquier numero en nombre/alias). */
function cilindradasDe(m: MotoCanonica): Set<number> {
    const set = new Set<number>()
    if (m.cilindrada && m.cilindrada >= 50) set.add(m.cilindrada)
    for (const n of cilindradasEn(`${m.nombre_completo} ${m.aliases.join(" ")}`)) set.add(n)
    return set
}

/** ¿El texto del cliente nombra a este modelo (por nombre completo o alias exacto)? */
function coincideExacto(textoNorm: string, m: MotoCanonica): boolean {
    if (normalizarTexto(m.nombre_completo) === textoNorm) return true
    return m.aliases.some((a) => normalizarTexto(a) === textoNorm)
}

/**
 * ¿Un alias de 3+ letras aparece contenido en el texto del cliente (o viceversa)?
 *
 * OJO con los alias que son "marca + cilindrada" ("brava 110", "mondial 110",
 * "keller 110"): al sacarles los numeros quedan reducidos a la MARCA sola, y
 * entonces cualquier moto de esa marca cae en la familia de ese modelo. Real
 * (conv 3730, 09/09): "brava altino 150 base" resolvia a la familia de la
 * "Brava Nevada 110" — una moto que no tiene nada que ver — y el bot le
 * repreguntaba al cliente citando ese modelo ajeno en vez de escalar.
 */
function coincideFamilia(textoNorm: string, m: MotoCanonica): boolean {
    const palabras = palabrasModelo(m.nombre_completo)

    // Alias COMPLETO (con sus números) presente como secuencia de palabras.
    //
    // La vía de abajo le saca los números al alias para reconocer la familia, y
    // eso deja afuera a los modelos con nombre corto o alfanumérico: la Motomel
    // S2 150 tiene "s2", "s2 150" y "s 2", que sin números quedan en una sola
    // letra y nunca llegan al mínimo de 3. Resultado real (conv 3694, 09/09):
    // `resolverMoto("s2 150")` daba EXACTA, pero la misma moto dentro de la frase
    // del cliente ("para mi s2 150 para hacerlo 190... Año 2025") daba NINGUNA, y
    // el bot le repreguntaba una moto que ya le había dicho.
    //
    // Se exige la secuencia completa y con bordes de palabra: "brava 110" no pega
    // con "brava altino 150" (el falso positivo de la conv 3730) ni "s 2" con
    // "wave s 2022".
    const conBordes = ` ${textoNorm} `
    for (const a of [m.nombre_completo, ...m.aliases]) {
        const aNorm = normalizarTexto(a)
        if (aNorm.length >= 2 && conBordes.includes(` ${aNorm} `)) return true
    }

    for (const a of m.aliases) {
        const aNorm = normalizarTexto(a)
        const soloLetras = aNorm.replace(/[0-9\s]/g, "")
        if (MARCAS.has(soloLetras)) continue // "brava 110" -> "brava": es la marca, no el modelo
        if (soloLetras.length >= 3 && (textoNorm.includes(soloLetras) || palabras.some((p) => p === soloLetras))) {
            // el alias sin numeros aparece en el texto -> misma familia
            if (textoNorm.split(" ").some((w) => w === soloLetras) || textoNorm.includes(` ${soloLetras}`) || textoNorm.startsWith(soloLetras)) {
                return true
            }
        }
    }
    return false
}

/**
 * Typo: una palabra del cliente (4+ letras) está a distancia OSA 1 de una
 * palabra del NOMBRE OFICIAL del modelo. Solo el nombre oficial, no los aliases
 * (los aliases ya traen typos a propósito: hacer fuzzy sobre "bliz" hacía que
 * "biz" (Honda Biz) resolviera a Motomel Blitz).
 *
 * El mínimo era 5 para no colisionar modelos cortos distintos, pero dejaba
 * afuera los nombres de 4 letras del catálogo — Wave, Skua, Trip — y "wawe"
 * (conv 3660, 08/09) caía como moto desconocida y escalaba en silencio.
 * En 4 letras un typo cambia demasiado la palabra, así que ahí se exige
 * ADEMÁS la misma inicial: "wawe"→"wave" pasa, "nave"/"llave" no.
 */
export function palabraUtilParaTypo(w: string): boolean {
    return w.length >= 4 && isNaN(Number(w)) && !MARCAS.has(w)
}

/**
 * Criterio ÚNICO de "esto es un typo de aquello". Vive acá para que
 * `compatibilidad.ts`, que tiene su propio resolvedor, no vuelva a divergir.
 */
export function esTypoDe(tokenCliente: string, palabraNombre: string): boolean {
    if (!palabraUtilParaTypo(tokenCliente) || !palabraUtilParaTypo(palabraNombre)) return false
    if (distanciaOSA(tokenCliente, palabraNombre) !== 1) return false // incluye swap de letras pegadas ("blizt"->"blitz")
    if (Math.min(tokenCliente.length, palabraNombre.length) >= 5) return true
    return tokenCliente[0] === palabraNombre[0]
}

function coincidePorTypo(textoNorm: string, m: MotoCanonica): boolean {
    const tokens = textoNorm.split(" ")
    const nombreWords = normalizarTexto(m.nombre_completo).split(" ")
    for (const tok of tokens) {
        for (const nw of nombreWords) {
            if (esTypoDe(tok, nw)) return true
        }
    }
    return false
}

/**
 * ¿El cliente y alguno de los candidatos comparten al menos una palabra de
 * MODELO (no la marca, no los numeros)? Si no comparten ninguna, el cliente
 * nombro una moto que sencillamente no tenemos: repreguntar "tenes la 110 o la
 * 125?" citando modelos ajenos es peor que escalar, porque le mete al cliente
 * datos de otra moto/kit. Ver conv 3730 (09/09).
 */
function comparteModeloCon(textoNorm: string, candidatos: MotoCanonica[]): boolean {
    const delCliente = palabrasModelo(textoNorm)
    if (delCliente.length === 0) return true // solo dijo marca+cc: la familia es lo unico que hay
    for (const m of candidatos) {
        const propias = [
            ...palabrasModelo(m.nombre_completo),
            ...m.aliases.flatMap((a) => palabrasModelo(a)),
        ]
        for (const w of delCliente) {
            if (propias.some((p) => p === w || esTypoDe(w, p))) return true
        }
    }
    return false
}

/**
 * Resuelve la moto del cliente con nivel de confianza. NO decide compatibilidad
 * — solo dice "que moto es y que tan seguro estoy".
 */
export async function resolverMoto(textoCliente: string): Promise<ResolucionMoto> {
    const textoNorm = normalizarTexto(textoCliente)
    if (!textoNorm) return { confianza: "ninguna", candidatos: [] }

    const modelos = await cargarModelos()
    if (modelos.length === 0) return { confianza: "ninguna", candidatos: [] }

    const ccCliente = cilindradasEn(textoCliente)

    // 1. Match exacto (nombre completo o alias tal cual)
    for (const m of modelos) {
        if (coincideExacto(textoNorm, m)) {
            return { confianza: "exacta", modelo: m, candidatos: [] }
        }
    }

    // 2. Familia: modelos cuyo nombre/alias (sin numeros) aparece en el texto
    const familia = modelos.filter((m) => coincideFamilia(textoNorm, m))

    if (familia.length > 0) {
        // 2.a El cliente dio una cilindrada -> tiene que cerrar con algun modelo de la familia
        if (ccCliente.length > 0) {
            const compatibles = familia.filter((m) => {
                const ccs = cilindradasDe(m)
                return ccCliente.some((c) => ccs.has(c))
            })
            if (compatibles.length === 1) {
                return { confianza: "aproximada", modelo: compatibles[0], candidatos: [] }
            }
            if (compatibles.length > 1) {
                return {
                    confianza: "ambigua",
                    candidatos: compatibles,
                    detalle: `Varios modelos de esa familia comparten la cilindrada ${ccCliente.join("/")}.`,
                }
            }
            // Ninguno de la familia tiene esa cilindrada: el cliente fue MAS
            // especifico que el catalogo, o se confundio.
            // Red de seguridad: si ademas nombro un modelo que no es ninguno de
            // los candidatos ("brava altino" vs "Brava Nevada"), no hay nada que
            // repreguntar — es una moto que no tenemos y va a humano.
            if (!comparteModeloCon(textoNorm, familia)) {
                return { confianza: "ninguna", candidatos: [] }
            }
            return {
                confianza: "ambigua",
                candidatos: familia,
                cilindradaCliente: ccCliente[0],
                detalle: `El cliente dijo ${ccCliente[0]}cc pero no me consta ese modelo con esa cilindrada.`,
            }
        }

        // 2.b Sin cilindrada: si hay una sola en la familia, alcanza
        if (familia.length === 1) {
            return { confianza: "aproximada", modelo: familia[0], candidatos: [] }
        }
        return {
            confianza: "ambigua",
            candidatos: familia,
            detalle: "El cliente nombro la familia pero no cual modelo.",
        }
    }

    // 3. Typo tolerante (Levenshtein) sobre una sola familia
    const porTypo = modelos.filter((m) => coincidePorTypo(textoNorm, m))
    if (porTypo.length === 1) {
        const m = porTypo[0]
        if (ccCliente.length === 0 || ccCliente.some((c) => cilindradasDe(m).has(c))) {
            return { confianza: "aproximada", modelo: m, candidatos: [] }
        }
        return {
            confianza: "ambigua",
            candidatos: porTypo,
            cilindradaCliente: ccCliente[0],
            detalle: `Puede ser ${m.nombre_completo} (typo), pero el cliente dijo ${ccCliente[0]}cc.`,
        }
    }

    return { confianza: "ninguna", candidatos: [] }
}

/** Texto corto para el `mensaje_para_agente`: lista de candidatos. */
export function listarCandidatos(cands: MotoCanonica[]): string {
    return cands.map((c) => c.nombre_completo).join(" / ")
}

/** Marca con mayúscula inicial, para que el texto al cliente no diga "gilera". */
export function marcaLegible(marca: string): string {
    return marca.charAt(0).toUpperCase() + marca.slice(1)
}

/**
 * Guia para la IA cuando el cliente dijo solo la marca. La pregunta es corta y
 * de mostrador ("cual Gilera tenes?"): sin recitar el catalogo interno (mismo
 * criterio que la repregunta por candidatos) y sin pedirle papeles.
 */
export function guiaMarcaSinModelo(marca: string): string {
    const Marca = marcaLegible(marca)
    return [
        `FALTA UN DATO, no escales: el cliente dijo la marca ("${Marca}") pero no el modelo ni la cilindrada.`,
        `Preguntale con naturalidad cual ${Marca} tiene (ej: "cual ${Marca} tenes?" o "que modelo de ${Marca} es?"). Una sola pregunta, corta.`,
        `NO le recites los modelos que tenemos cargados, NO le pidas la cedula, el manual ni ningun papel, y NO le preguntes nada que ya te haya dicho.`,
        `NO confirmes ni niegues compatibilidad todavia. Cuando te diga el modelo o la cilindrada, volve a consultar con ese dato.`,
    ].join("\n")
}

/**
 * La misma situacion pero ya agotado el tope de repreguntas: el cliente contesto
 * dos veces sin precisar. Insistir una tercera es un interrogatorio; va al equipo.
 */
export function guiaMarcaSinModeloAgotada(marca: string): string {
    return [
        `Ya le preguntaste ${TOPE_REPREGUNTAS_MOTO} veces cual ${marcaLegible(marca)} tiene y sigue sin precisar el modelo.`,
        `NO se lo vuelvas a preguntar. Ejecuta escalar_a_humano(motivo: 'moto_no_registrada') y guarda silencio sobre ese punto.`,
        `Si en el mismo mensaje pregunto otra cosa (precio, envio, demora), esa si contestala.`,
    ].join("\n")
}
