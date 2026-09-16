import { prisma } from "@/lib/prisma"
import { esMomentoValido, rellenarFrase, MOMENTO_TRANSVERSAL, type DatosFrase, type MomentoFrase } from "./momentos"

/**
 * LA LETRA DE LA CASA (anti-crecimiento del prompt, capa de redacción)
 * -------------------------------------------------------------------
 * `chat_situaciones` resuelve QUÉ hacer en un caso puntual. Esto resuelve CÓMO
 * lo decimos en un momento puntual, que es un problema distinto: el bot ya
 * contestaba bien, pero con tics propios ("el kit te va bien") en vez de la
 * letra del mostrador.
 *
 * Por qué no va en el prompt: el prompt maestro fija identidad, voz y contrato
 * de grounding, y tiene prohibido crecer un párrafo por caso. Una letra por
 * cada momento del embudo serían seis párrafos más, cargados en los 5.800
 * tokens de TODOS los turnos, incluso los que no llegan a ese momento.
 *
 * Por qué no va en `tono_estilo_vendedor`: eso es la pauta global de estilo y
 * se inyecta siempre, pegada al prompt. Sirve para "hablá cordobés, sé
 * conciso", no para "así confirmamos una compatibilidad".
 *
 * Cómo funciona: cada herramienta declara en su resultado el `momento` que
 * acaba de resolver. El motor pega las frases de ESE momento a la guía de la
 * herramienta, donde el modelo ya está leyendo qué hacer en el paso. Un turno
 * que no llega a un momento no paga por su letra.
 *
 * La tabla vacía no cambia nada: sin frases activas no se inyecta bloque.
 */

export interface FraseCasa {
    momento: MomentoFrase
    frase: string
}

let cacheFrases: { data: Map<MomentoFrase, string[]>; expira: number } | null = null
const TTL_CACHE_MS = 60_000

/** Techo de frases que se le muestran al modelo por momento. */
const MAX_FRASES_POR_MOMENTO = 4

async function cargarFrases(): Promise<Map<MomentoFrase, string[]>> {
    if (cacheFrases && cacheFrases.expira > Date.now()) return cacheFrases.data

    const mapa = new Map<MomentoFrase, string[]>()
    try {
        const filas = await prisma.$queryRaw<{ momento: string; frase: string }[]>`
            SELECT momento, frase
            FROM chat_frases
            WHERE activo = true
            ORDER BY orden ASC, id ASC
        `
        for (const f of filas || []) {
            // Un momento que no está en el catálogo es una fila vieja o mal
            // tipeada: se ignora en silencio, como si estuviera apagada.
            if (!esMomentoValido(f.momento)) continue
            const frase = (f.frase || "").trim()
            if (!frase) continue
            const actuales = mapa.get(f.momento) || []
            if (actuales.length >= MAX_FRASES_POR_MOMENTO) continue
            actuales.push(frase)
            mapa.set(f.momento, actuales)
        }
    } catch (err) {
        // Tabla inexistente todavía (no se corrió chat-frases.sql) u otro
        // error: el turno sigue sin letra, igual que antes de esta capa.
        console.warn("[frases] no se pudo leer chat_frases:", (err as any)?.message)
        return mapa
    }

    cacheFrases = { data: mapa, expira: Date.now() + TTL_CACHE_MS }
    return mapa
}

/**
 * El bloque que se le pega a la guía de la herramienta.
 *
 * Se redacta como muestra de registro, no como plantilla: el prompt maestro ya
 * prohíbe copiar frases palabra por palabra, y una letra copiada literal dos
 * veces en la misma charla se la borra el sanitizador. Lo que se pide es que
 * suene como estas, no que sea una de estas.
 */
export async function bloqueLetraDeLaCasa(
    momento: MomentoFrase | null | undefined,
    datos: DatosFrase = {}
): Promise<string> {
    if (!momento || !esMomentoValido(momento)) return ""

    const mapa = await cargarFrases()
    const frases = mapa.get(momento)
    if (!frases || frases.length === 0) return ""

    const lineas = frases
        .map((f) => rellenarFrase(f, datos))
        .filter(Boolean)
        .map((f) => `- "${f}"`)
    if (lineas.length === 0) return ""

    return [
        "",
        "ASÍ LO DECIMOS NOSOTROS (letra de la casa para este momento, cargada por el dueño):",
        ...lineas,
        lineas.length > 1
            ? "Usá UNA, la que mejor entre con lo que viene hablando el cliente, y decila con tu voz. No las encadenes ni las repitas textual."
            : "Decilo con ese registro, adaptado a lo que viene hablando el cliente. No lo copies palabra por palabra."
    ].join("\n")
}

/** ¿Hay cierres cargados? Decide si el bloque del turno suma el renglón. */
export async function bloqueCierresDeLaCasa(): Promise<string> {
    return bloqueLetraDeLaCasa(MOMENTO_TRANSVERSAL, {})
}

/** Invalida el cache (lo usa el panel de admin al guardar cambios). */
export function invalidarCacheFrases(): void {
    cacheFrases = null
}

export { MOMENTOS, MOMENTO_TRANSVERSAL, esMomentoValido, tituloMomento, rellenarFrase } from "./momentos"
export type { MomentoFrase, DefinicionMomento, DatosFrase } from "./momentos"
