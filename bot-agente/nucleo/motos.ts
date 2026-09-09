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

/** Numeros que parecen una cilindrada (50-2000). */
function cilindradasEn(texto: string): number[] {
    const nums = (normalizarTexto(texto).match(/\b\d{2,4}\b/g) || []).map(Number)
    return nums.filter((n) => n >= 50 && n <= 2000)
}

/** Palabras "de identidad" del modelo: no numeros, no marcas, 3+ letras. */
const MARCAS = new Set([
    "honda", "yamaha", "motomel", "zanella", "gilera", "corven", "keller",
    "brava", "mondial", "guerrero", "bajaj", "moto", "para", "una", "mi",
])
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
