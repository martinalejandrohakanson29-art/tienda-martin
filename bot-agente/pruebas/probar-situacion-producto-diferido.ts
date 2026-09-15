/**
 * Guardrail de las situaciones `producto_diferido_*`: una regla que manda a
 * escalar en silencio deja de aplicarse cuando el producto ya se cargó en el
 * catálogo. No pega contra la base ni contra ninguna API: son puras.
 *
 *   npx tsx bot-agente/pruebas/probar-situacion-producto-diferido.ts
 *
 * Contexto (conv 4229, 15/09): el Kit 220 estaba completo en el catálogo desde
 * el 08/09 y la situación `producto_diferido_kit_220`, del 07/09, seguía viva.
 * El cliente preguntó el precio a la noche y a la mañana el bot lo derivó en
 * silencio en vez de contestarle.
 */
import { disparadorYaEnCatalogo } from "../situaciones"
import { normalizarTexto } from "../nucleo/texto"

// Nombres tal como salen del catálogo real (packs + piezas sueltas con alias).
const CATALOGO = [
    "kit 120 para 110 recorrido corto",
    "kit 120 para 110 recorrido largo",
    "combo escape pwr + leva 6.40 corta",
    "kit 170 varillero + leva",
    "kit dakar 200 economico",
    "kit dakar 220",
    "escape solo",
    "paolucci solo",
    "cilindro solo"
].map((n) => normalizarTexto(n))

interface Caso { titulo: string; ok: boolean }

const casos: Caso[] = [
    // ── El Kit 220 SÍ está cargado: la regla vieja no debe aplicarse ──────────
    { titulo: "'kit 220' se reconoce en el catalogo", ok: disparadorYaEnCatalogo("kit 220", CATALOGO) === true },
    { titulo: "'220cc' se reconoce (el cc no estorba)", ok: disparadorYaEnCatalogo("220cc", CATALOGO) === true },
    { titulo: "'kit dakar 220' se reconoce", ok: disparadorYaEnCatalogo("kit dakar 220", CATALOGO) === true },

    // ── El escape DM curvo NO está cargado: la regla tiene que seguir viva ────
    { titulo: "'escape dm' NO es el escape pwr", ok: disparadorYaEnCatalogo("escape dm", CATALOGO) === false },
    { titulo: "'escape dm curvo' no esta cargado", ok: disparadorYaEnCatalogo("escape dm curvo", CATALOGO) === false },
    { titulo: "'escape curvo' no esta cargado", ok: disparadorYaEnCatalogo("escape curvo", CATALOGO) === false },
    // El 110 lo comparte con el Kit 120 para 110, y no son el mismo producto.
    { titulo: "'escape competicion 110' no matchea por el numero suelto", ok: disparadorYaEnCatalogo("escape competicion 110", CATALOGO) === false },

    // ── Un numero no se confunde con otro parecido ────────────────────────────
    { titulo: "'kit 210' (inexistente) no matchea al 220", ok: disparadorYaEnCatalogo("kit 210", CATALOGO) === false },
    { titulo: "'kit 20' no matchea al 200 ni al 220", ok: disparadorYaEnCatalogo("kit 20", CATALOGO) === false },

    // ── Un disparador que es puro relleno no habilita nada ────────────────────
    { titulo: "'el kit' solo no alcanza para darlo por cargado", ok: disparadorYaEnCatalogo("el kit", CATALOGO) === false },
    { titulo: "catalogo vacio nunca da por cargado", ok: disparadorYaEnCatalogo("kit 220", []) === false }
]

let fallaron = 0
for (const c of casos) {
    console.log(`${c.ok ? "OK  " : "FAIL"}  ${c.titulo}`)
    if (!c.ok) fallaron++
}
console.log(`\n${casos.length - fallaron}/${casos.length} pruebas OK`)
process.exit(fallaron === 0 ? 0 : 1)
