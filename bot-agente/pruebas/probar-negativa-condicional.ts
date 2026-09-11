/**
 * Pruebas de la negativa condicional: "no le entra" no siempre es "nunca le va".
 *
 * No pega contra ninguna API ni contra la base: son puras.
 *
 *   npx tsx bot-agente/pruebas/probar-negativa-condicional.ts
 *
 * Contexto: conv 3874 (Wave NF). La fila decía "hay que alesar los cárteres",
 * el cliente contestó "Si ya se ya lo tengo a agrandado los carter todo" y el
 * bot le repitió la misma negativa al día siguiente.
 *
 * Lo que estas pruebas cuidan además del caso: que la regla NO esté atada a los
 * cárteres. Los casos de "kit futuro" usan condiciones que no existen hoy en el
 * catálogo (cambiar la leva, rectificar la tapa) y tienen que funcionar igual,
 * porque el "qué hay que hacerle" sale del detalle de la fila y no de una lista
 * nuestra.
 */
import { condicionSuperada, esNegativaCondicional } from "../nucleo/negativa-condicional"

const CARTER = "Para que entre hay que hacerle modificaciones al motor (alesar los cárteres) — no es un cambio directo de fábrica."
const LEVA = "No le entra de fábrica: hay que cambiar la leva por una de mayor alzada."
const TAPA = "Hay que rectificar la tapa de cilindro para que asiente."
const ABSOLUTA = "No es compatible: el motor de esa moto es de otro diseño."

interface Caso {
    titulo: string
    ok: boolean
}

const casos: Caso[] = [
    // ── ¿La fila describe una condición superable? ────────────────────────────
    { titulo: "detalle con trabajo de taller = condicional", ok: esNegativaCondicional(CARTER) === true },
    { titulo: "otra condición (leva) también es condicional", ok: esNegativaCondicional(LEVA) === true },
    { titulo: "negativa estructural NO es condicional", ok: esNegativaCondicional(ABSOLUTA) === false },
    { titulo: "sin detalle cargado no hay condición que cumplir", ok: esNegativaCondicional("") === false },

    // ── El caso real, tal como lo escribió el cliente ─────────────────────────
    {
        titulo: "conv 3874: 'ya lo tengo a agrandado los carter todo' → hecho",
        ok: condicionSuperada("Si ya se ya lo tengo a agrandado los carter todo, ya esta todo modificado", CARTER)?.tipo === "hecho",
    },
    {
        titulo: "mismo caso escrito con el verbo de la ficha ('ya lo tengo alesado')",
        ok: condicionSuperada("ya lo tengo alesado", CARTER)?.tipo === "hecho",
    },

    // ── Generaliza a condiciones que hoy no existen en el catálogo ────────────
    {
        titulo: "kit futuro: ficha pide cambiar la leva y el cliente ya la cambió",
        ok: condicionSuperada("ya le cambie la leva por una de competicion", LEVA)?.tipo === "hecho",
    },
    {
        titulo: "kit futuro: ficha pide rectificar la tapa y el cliente la va a mandar",
        ok: condicionSuperada("si le hago rectificar la tapa me sirve?", TAPA)?.tipo === "previsto",
    },

    // ── Lo que NO tiene que disparar ──────────────────────────────────────────
    {
        titulo: "un 'ya lo tengo' de otra cosa no toca la compatibilidad",
        ok: condicionSuperada("ya lo tengo el dinero, cuando me lo mandan?", CARTER) === null,
    },
    {
        titulo: "nombrar la pieza sin decir que está hecho no alcanza",
        ok: condicionSuperada("y el carter se rompe?", CARTER) === null,
    },
    {
        titulo: "negativa estructural: aunque diga que modificó todo, no aplica",
        ok: condicionSuperada("ya tengo todo el motor modificado", ABSOLUTA) === null,
    },
    {
        titulo: "mensaje vacío",
        ok: condicionSuperada("", CARTER) === null,
    },
]

let fallaron = 0
for (const c of casos) {
    console.log(`${c.ok ? "OK  " : "FALLA"}  ${c.titulo}`)
    if (!c.ok) fallaron++
}
console.log(`\n${casos.length - fallaron}/${casos.length} OK`)
process.exit(fallaron === 0 ? 0 : 1)
