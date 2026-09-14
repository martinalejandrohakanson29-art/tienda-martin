/**
 * Pruebas del pedido de alternativa despues de un "no le va".
 *
 * Puras: no pegan contra la base ni contra ninguna API.
 *
 *   npx tsx bot-agente/pruebas/probar-alternativa-tras-negativa.ts
 *
 * Caso real: conv 4186 (14/09, Honda Wave NF 100). Tras la negativa del Combo
 * Tapa CDI + Cilindro 120 el cliente escribio "Ahhhhh q lastima / Y algo para
 * esa no tenes ??" y el bot le devolvio un menu de categorias inventado.
 */
import { pideAlternativaTrasNegativa } from "../nucleo/alternativa-tras-negativa"

const NEG = { moto: "Honda Wave NF 100", kit: "Combo Tapa CDI + Cilindro 120" }

interface Caso {
    titulo: string
    ok: boolean
}

const casos: Caso[] = [
    // ── El caso real y sus variantes de mostrador ─────────────────────────────
    {
        titulo: "conv 4186: 'Ahhhhh q lastima / Y algo para esa no tenes ??'",
        ok: pideAlternativaTrasNegativa("Ahhhhh q lastima\nY algo para esa no tenes ??", NEG) === true,
    },
    {
        titulo: "'no tenes nada para esa?'",
        ok: pideAlternativaTrasNegativa("no tenes nada para esa?", NEG) === true,
    },
    {
        titulo: "'y que le puedo poner entonces?'",
        ok: pideAlternativaTrasNegativa("y que le puedo poner entonces?", NEG) === true,
    },
    {
        titulo: "'que me recomendas para la wave?'",
        ok: pideAlternativaTrasNegativa("que me recomendas para la wave?", NEG) === true,
    },
    {
        titulo: "'tenes algun kit que le vaya?'",
        ok: pideAlternativaTrasNegativa("tenes algun kit que le vaya?", NEG) === true,
    },
    {
        titulo: "'que kit le va a la honda wave?' (misma marca)",
        ok: pideAlternativaTrasNegativa("que kit le va a la honda wave?", NEG) === true,
    },

    // ── Frenos: cuando NO hay que cortar el turno ─────────────────────────────
    {
        titulo: "sin negativa vigente no aplica",
        ok: pideAlternativaTrasNegativa("y algo para esa no tenes ??", null) === false,
    },
    {
        titulo: "cambio de moto: otra marca sigue el flujo normal",
        ok: pideAlternativaTrasNegativa("y para una gilera smash tenes algo?", NEG) === false,
    },
    {
        titulo: "en la misma rafaga pregunta el envio: eso se contesta igual",
        ok: pideAlternativaTrasNegativa("y algo para esa tenes? hacen envio a salta?", NEG) === false,
    },
    {
        titulo: "pregunta el precio junto: no se corta el turno",
        ok: pideAlternativaTrasNegativa("algo para esa? cuanto sale?", NEG) === false,
    },
    {
        titulo: "nombra un kit concreto: lo resuelve la compat, no se corta",
        ok: pideAlternativaTrasNegativa("y el kit 170 que tenes le va?", NEG) === false,
    },
    {
        titulo: "'que cilindro 120 tenes' tampoco corta el turno",
        ok: pideAlternativaTrasNegativa("que cilindro 120 tenes para esa?", NEG) === false,
    },
    {
        titulo: "la condicion superada (ya aleso) no es pedido de alternativa",
        ok: pideAlternativaTrasNegativa("Si ya se ya lo tengo a agrandado los carter todo", NEG) === false,
    },
    {
        titulo: "cierre social pelado",
        ok: pideAlternativaTrasNegativa("Ahhhhh q lastima", NEG) === false,
    },
    {
        titulo: "insistencia sin contenido",
        ok: pideAlternativaTrasNegativa("??", NEG) === false,
    },
    {
        titulo: "mensaje vacio",
        ok: pideAlternativaTrasNegativa("", NEG) === false,
    },
]

let fallaron = 0
for (const c of casos) {
    console.log(`${c.ok ? "OK  " : "FALLA"}  ${c.titulo}`)
    if (!c.ok) fallaron++
}
console.log(`\n${casos.length - fallaron}/${casos.length} OK`)
process.exit(fallaron === 0 ? 0 : 1)
