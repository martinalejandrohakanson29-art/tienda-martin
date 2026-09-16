/**
 * Pruebas de la letra de la casa: el relleno de placeholders y el catálogo de
 * momentos. No pegan contra la base ni contra ninguna API: son puras.
 *
 *   npx tsx bot-agente/pruebas/probar-frases.ts
 *
 * Contexto (16/09): el bot redactaba bien pero con tics propios — todas las
 * confirmaciones de compatibilidad salían como "el kit te va bien", porque esa
 * frase venía dictada en la guía de `resolver_variante` y el modelo la copiaba.
 * Ahora la redacción de cada momento se carga en `chat_frases` y la guía de la
 * herramienta solo pasa el hecho seco ("COMPATIBLE con X").
 *
 * Lo que estas pruebas cuidan, además del relleno: que una frase a la que le
 * falta el dato se lea ENTERA. La letra se le da al modelo como muestra de
 * registro, así que "va perfecto para tu" (con la moto cortada) le enseña a
 * escribir mal. Se cae el artículo junto con el placeholder, o no se cae nada.
 */
import { rellenarFrase, esMomentoValido, MOMENTOS, tituloMomento } from "../frases/momentos"

const TODO = { moto: "Gilera Smash 110", kit: "Combo 110 a 120 corto", precio: "$99.990" }

interface Caso {
    titulo: string
    ok: boolean
}

const casos: Caso[] = [
    // ── Relleno con todos los datos ──────────────────────────────────────────
    {
        titulo: "la moto entra en la frase",
        ok: rellenarFrase("Este kit va perfecto para tu {moto}", TODO) === "Este kit va perfecto para tu Gilera Smash 110"
    },
    {
        titulo: "kit y precio juntos",
        ok:
            rellenarFrase("El {kit} te sale {precio} con envío gratis", TODO) ===
            "El Combo 110 a 120 corto te sale $99.990 con envío gratis"
    },
    {
        titulo: "el mismo placeholder dos veces",
        ok: rellenarFrase("A la {moto} le va, y a la {moto} le sobra", TODO) === "A la Gilera Smash 110 le va, y a la Gilera Smash 110 le sobra"
    },
    {
        titulo: "una frase sin placeholders sale igual",
        ok: rellenarFrase("Cualquier cosa avisanos y coordinamos", TODO) === "Cualquier cosa avisanos y coordinamos"
    },

    // ── Falta el dato: la frase tiene que seguir leyéndose entera ────────────
    {
        titulo: "sin moto se cae 'para tu' con el placeholder",
        ok: rellenarFrase("Este kit va perfecto para tu {moto}", {}) === "Este kit va perfecto"
    },
    {
        titulo: "sin moto se cae 'a la' con el placeholder",
        ok: rellenarFrase("A la {moto} le entra directo", {}) === "Le entra directo"
    },
    {
        titulo: "sin kit se cae 'el' con el placeholder",
        ok: rellenarFrase("El {kit} te sale {precio}", { precio: "$99.990" }) === "Te sale $99.990"
    },
    {
        titulo: "una frase que arrancaba en minúscula no se capitaliza de prepo",
        ok: rellenarFrase("le va bien a la {moto}", {}) === "le va bien"
    },
    {
        titulo: "sin precio no queda 'te sale' colgando de una llave",
        ok: !rellenarFrase("El {kit} te sale {precio}", { kit: "Kit 120" }).includes("{")
    },
    {
        titulo: "sin ningún dato no sobrevive ninguna llave",
        ok: !rellenarFrase("El {kit} va perfecto para tu {moto} y sale {precio}", {}).includes("{")
    },
    {
        titulo: "un dato vacío cuenta como faltante",
        ok: rellenarFrase("Va perfecto para tu {moto}", { moto: "   " }) === "Va perfecto"
    },
    {
        titulo: "no quedan espacios dobles ni espacio antes del punto",
        ok: (() => {
            const r = rellenarFrase("Mirá, el {kit} es el indicado para tu {moto}.", {})
            return !r.includes("  ") && !r.includes(" .")
        })()
    },

    // ── El catálogo de momentos es una lista cerrada ─────────────────────────
    { titulo: "compat_confirmada es un momento válido", ok: esMomentoValido("compat_confirmada") === true },
    { titulo: "cierre es un momento válido", ok: esMomentoValido("cierre") === true },
    { titulo: "un momento inventado no es válido", ok: esMomentoValido("compat_confirmadas") === false },
    { titulo: "vacío no es un momento", ok: esMomentoValido("") === false },
    { titulo: "null no es un momento", ok: esMomentoValido(null) === false },
    {
        titulo: "todos los momentos del catálogo se validan a sí mismos",
        ok: MOMENTOS.every((m) => esMomentoValido(m.momento))
    },
    {
        titulo: "ningún momento está duplicado",
        ok: new Set(MOMENTOS.map((m) => m.momento)).size === MOMENTOS.length
    },
    {
        titulo: "todos tienen título, cuándo y ejemplo para el panel",
        ok: MOMENTOS.every((m) => m.titulo.trim() && m.cuando.trim() && m.ejemplo.trim())
    },
    {
        titulo: "los placeholders declarados por momento son los que sabemos rellenar",
        ok: MOMENTOS.every((m) => m.placeholders.every((p) => ["{moto}", "{kit}", "{precio}"].includes(p)))
    },
    {
        titulo: "el ejemplo de cada momento solo usa placeholders que ese momento declara",
        ok: MOMENTOS.every((m) => {
            const usados = m.ejemplo.match(/\{[a-z]+\}/g) || []
            return usados.every((u) => m.placeholders.includes(u))
        })
    },
    { titulo: "tituloMomento devuelve el título del catálogo", ok: tituloMomento("cierre") === "Cierre del mensaje" },
    { titulo: "tituloMomento de uno desconocido devuelve la clave", ok: tituloMomento("nada") === "nada" }
]

let fallaron = 0
for (const c of casos) {
    console.log(`${c.ok ? "OK  " : "FALLA"}  ${c.titulo}`)
    if (!c.ok) fallaron++
}
console.log(`\n${casos.length - fallaron}/${casos.length} OK`)
process.exit(fallaron === 0 ? 0 : 1)
