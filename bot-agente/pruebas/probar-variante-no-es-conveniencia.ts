/**
 * Pruebas del léxico de la variante: no se elige por conveniencia.
 *
 * No pega contra ninguna API ni contra la base: son puras.
 *
 *   npx tsx bot-agente/pruebas/probar-variante-no-es-conveniencia.ts
 *
 * Contexto (conv 4453, 17/09): el cliente entró por el anuncio del combo 110 a
 * 120, contestó "Sii" a la ficha y el bot le ofreció "decime que moto tenes asi
 * te confirmo cual de las dos variantes te conviene". La variante no es un
 * negocio ni un gusto: la define el motor que ya tiene la moto, así que lo que
 * se define es cuál LE ENTRA.
 *
 * Lo que estas pruebas cuidan además del caso: que un "te conviene" sobre
 * cualquier otra cosa (el envío, pagar en efectivo, llevar el combo completo)
 * quede intacto. La regla es del eje de variante, no de la palabra.
 */
import {
    corregirJergaVariante,
    corregirVarianteNoEsConveniencia,
    sanitizarMensajeSalida
} from "../guardrails/sanitizador"

interface Caso {
    titulo: string
    ok: boolean
}

const casos: Caso[] = [
    // ── El caso real ─────────────────────────────────────────────────────────
    {
        titulo: "conv 4453: 'cual de las dos variantes te conviene' -> te corresponde",
        ok:
            corregirVarianteNoEsConveniencia(
                "Dale! Decime que moto tenes asi te confirmo cual de las dos variantes te conviene."
            ) === "Dale! Decime que moto tenes asi te confirmo cual de las dos variantes te corresponde."
    },
    {
        titulo: "'cual de las dos te conviene' sin nombrar la variante",
        ok:
            corregirVarianteNoEsConveniencia("Decime que moto tenes y te digo cual de las dos te conviene") ===
            "Decime que moto tenes y te digo cual de las dos te corresponde"
    },
    {
        titulo: "'cual le conviene' (tercera persona)",
        ok:
            corregirVarianteNoEsConveniencia("Con la moto te confirmo cual recorrido le conviene") ===
            "Con la moto te confirmo cual recorrido le corresponde"
    },
    {
        titulo: "'la leva que te va mejor'",
        ok:
            corregirVarianteNoEsConveniencia("Asi te digo la leva que te va mejor") ===
            "Asi te digo la leva que te corresponde"
    },
    {
        titulo: "'cual te sirve mas' sobre el recorrido",
        ok:
            corregirVarianteNoEsConveniencia("Con ese dato vemos cual recorrido te sirve mas") ===
            "Con ese dato vemos cual recorrido te corresponde"
    },
    {
        titulo: "'cual es el mejor para tu moto'",
        ok:
            corregirVarianteNoEsConveniencia("Decime la moto y te digo cual es el mejor para tu moto, corto o largo") ===
            "Decime la moto y te digo cuál corresponde a tu moto, corto o largo"
    },
    {
        titulo: "'conviene mas' sin pronombre",
        ok:
            corregirVarianteNoEsConveniencia("Segun la moto vemos que recorrido conviene mas") ===
            "Segun la moto vemos que recorrido corresponde"
    },
    {
        titulo: "el 'te conviene' de otra oración de la misma línea no se toca",
        ok:
            corregirVarianteNoEsConveniencia(
                "Te confirmo cual recorrido te conviene. Pagando en efectivo te conviene mas."
            ) === "Te confirmo cual recorrido te corresponde. Pagando en efectivo te conviene mas."
    },

    // ── Lo que NO se toca: el "conviene" de siempre ──────────────────────────
    {
        titulo: "el envío por Andreani no es una variante",
        ok:
            corregirVarianteNoEsConveniencia("Si sos de Chaco te conviene el envio a domicilio") ===
            "Si sos de Chaco te conviene el envio a domicilio"
    },
    {
        titulo: "llevar el combo completo sí puede convenir (es plata)",
        ok:
            corregirVarianteNoEsConveniencia("Te conviene el combo completo antes que las piezas por separado") ===
            "Te conviene el combo completo antes que las piezas por separado"
    },
    {
        titulo: "un mensaje sin la palabra vuelve igual",
        ok: corregirVarianteNoEsConveniencia("Recorrido corto: $99.000") === "Recorrido corto: $99.000"
    },
    // ── "Variante" es palabra nuestra: del otro lado son "opciones" ──────────
    {
        titulo: "'las dos variantes' -> 'las dos opciones'",
        ok:
            corregirJergaVariante("Decime la moto y te confirmo cual de las dos variantes te corresponde") ===
            "Decime la moto y te confirmo cual de las dos opciones te corresponde"
    },
    {
        titulo: "singular con su artículo (las dos palabras son femeninas)",
        ok:
            corregirJergaVariante("La variante que te corresponde es la corta") ===
            "La opción que te corresponde es la corta"
    },
    {
        titulo: "arranque de oración en mayúscula",
        ok: corregirJergaVariante("Variante corta: $99.000") === "Opción corta: $99.000"
    },
    {
        titulo: "no toca palabras que la contienen",
        ok: corregirJergaVariante("es invariante al modelo") === "es invariante al modelo"
    },
    {
        titulo: "la ficha con sus saltos de renglón queda intacta",
        ok:
            corregirVarianteNoEsConveniencia("Tenes 2 opciones:\n👉🏼 Recorrido corto: $99.000\n👉🏼 Recorrido largo: $115.000") ===
            "Tenes 2 opciones:\n👉🏼 Recorrido corto: $99.000\n👉🏼 Recorrido largo: $115.000"
    },

    // ── El mensaje real, por el sanitizador entero ───────────────────────────
    {
        titulo: "sanitizador completo: el mensaje de la conv 4453 sale corregido y sin jerga",
        ok:
            sanitizarMensajeSalida(
                "Dale! Decime que moto tenes asi te confirmo cual de las dos variantes te conviene."
            ).textoLimpio === "Dale! Decime que moto tenes asi te confirmo cual de las dos opciones te corresponde."
    }
]

let fallos = 0
for (const c of casos) {
    console.log(`${c.ok ? "✅" : "❌"} ${c.titulo}`)
    if (!c.ok) fallos++
}
console.log(`\n${casos.length - fallos}/${casos.length} OK`)
process.exit(fallos === 0 ? 0 : 1)
