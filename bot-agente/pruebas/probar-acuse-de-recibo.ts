/**
 * Pruebas del acuse de recibo: el cliente dice "bueno" / "D1" / "sale meta" a
 * un pedido nuestro y el bot se calla en vez de improvisar.
 *
 * No pegan contra ninguna API ni contra la base: son puras.
 *
 *   npx tsx bot-agente/pruebas/probar-acuse-de-recibo.ts
 *
 * Contexto (convs 4172 y 4206, 14-15/09): por no conocer una palabra de jerga
 * el bot contestó "No te entendí el D1 😅" y, en la otra, repitió el sermón de
 * que sin la medida no hay precio.
 *
 * Lo que cuidan además del caso: que el silencio NO se coma un turno útil. Si
 * el bot ofreció algo con respuesta sí/no, o el cliente manda un dato, una
 * pregunta o un pedido, el turno sigue vivo.
 */
import {
    debeCallarPorAcuseDeRecibo,
    elBotDejoUnPedidoPendiente,
    esAsentimientoPelado
} from "../nucleo/acuse-de-recibo"

// Mensajes reales del bot en las dos conversaciones.
const PEDIDO_4172 =
    "Tranqui, que sea original no te define la medida. Se saca midiendo: desarmás la tapa y medís la leva de punta a punta. 69mm es la corta y 74mm la larga.\n\nFijate eso y me decís, y te cierro la variante justa."
const PEDIDO_4206 =
    "Claro, no hay drama. Es el unico dato que falta y sale de la leva: la corta mide 69mm y la larga 74mm, se mide el ancho de la leva.\n\nCuando la tengas medida me decis y te paso el precio final del combo."
const OFERTA = "Te lo reservo y te paso el link de pago?"
const CON_PRECIO = "Listo, entonces va recorrido corto para tu Smash: $175.000 con envío gratis a todo el país."

interface Caso {
    titulo: string
    ok: boolean
}

const casos: Caso[] = [
    // ── ¿El mensaje del cliente es puro asentimiento? ─────────────────────────
    { titulo: "'Bueno' es asentimiento", ok: esAsentimientoPelado("Bueno") === true },
    { titulo: "'D1' es asentimiento (jerga de 'dale')", ok: esAsentimientoPelado("D1") === true },
    { titulo: "la ráfaga 'Bueno' + 'D1' es asentimiento", ok: esAsentimientoPelado("Bueno\nD1") === true },
    { titulo: "'Sale meta' es asentimiento", ok: esAsentimientoPelado("Sale meta") === true },
    { titulo: "'de10' es asentimiento", ok: esAsentimientoPelado("de10") === true },
    { titulo: "'dale mañana lo mido y te aviso' es asentimiento", ok: esAsentimientoPelado("dale mañana lo mido y te aviso") === true },
    { titulo: "'Ok gracias' es asentimiento", ok: esAsentimientoPelado("Ok gracias") === true },
    { titulo: "'dale' con emoji es asentimiento", ok: esAsentimientoPelado("dale 👍") === true },
    { titulo: "una medida NO es asentimiento", ok: esAsentimientoPelado("bueno es de 69") === false },
    { titulo: "una moto NO es asentimiento", ok: esAsentimientoPelado("dale es una gilera smash") === false },
    { titulo: "una pregunta NO es asentimiento", ok: esAsentimientoPelado("dale y el envio?") === false },
    { titulo: "un pedido NO es asentimiento", ok: esAsentimientoPelado("dale mandame el link") === false },
    { titulo: "'lo quiero comprar' NO es asentimiento", ok: esAsentimientoPelado("dale lo quiero comprar") === false },
    { titulo: "vacío no es asentimiento", ok: esAsentimientoPelado("") === false },

    // ── ¿El bot dejó un pedido abierto del lado del cliente? ──────────────────
    { titulo: "'Fijate eso y me decís' es pedido pendiente", ok: elBotDejoUnPedidoPendiente(PEDIDO_4172) === true },
    { titulo: "'Cuando la tengas medida me decis' es pedido pendiente", ok: elBotDejoUnPedidoPendiente(PEDIDO_4206) === true },
    { titulo: "una oferta sí/no NO es pedido pendiente", ok: elBotDejoUnPedidoPendiente(OFERTA) === false },
    { titulo: "un precio pelado NO es pedido pendiente", ok: elBotDejoUnPedidoPendiente(CON_PRECIO) === false },

    // ── Decisión completa ────────────────────────────────────────────────────
    {
        titulo: "conv 4172: 'Bueno'+'D1' sobre el pedido de medir -> silencio",
        ok: debeCallarPorAcuseDeRecibo("Bueno\nD1", PEDIDO_4172, true) === true
    },
    {
        titulo: "conv 4206: 'Sale meta' sobre el pedido de medir -> silencio",
        ok: debeCallarPorAcuseDeRecibo("Sale meta", PEDIDO_4206, true) === true
    },
    {
        titulo: "'dale' a una oferta sí/no -> se contesta",
        ok: debeCallarPorAcuseDeRecibo("dale", OFERTA, true) === false
    },
    {
        titulo: "'dale' después de un precio -> se contesta",
        ok: debeCallarPorAcuseDeRecibo("dale", CON_PRECIO, true) === false
    },
    {
        titulo: "la medida que pedimos -> se contesta",
        ok: debeCallarPorAcuseDeRecibo("es de 74", PEDIDO_4206, true) === false
    },
    {
        titulo: "primer mensaje de la charla -> nunca se calla",
        ok: debeCallarPorAcuseDeRecibo("hola dale", PEDIDO_4206, false) === false
    }
]

let fallaron = 0
for (const c of casos) {
    console.log(`${c.ok ? "OK  " : "FALLA"}  ${c.titulo}`)
    if (!c.ok) fallaron++
}
console.log(`\n${casos.length - fallaron}/${casos.length} OK`)
process.exit(fallaron === 0 ? 0 : 1)
