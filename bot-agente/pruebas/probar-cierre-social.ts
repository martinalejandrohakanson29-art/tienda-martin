/**
 * Pruebas del cierre social: el bot deja de tener la última palabra.
 *
 * No pega contra ninguna API ni contra la base: son puras.
 *
 *   npx tsx bot-agente/pruebas/probar-cierre-social.ts
 *
 * Contexto (11/09): convs 3988, 3960 y 3985. El cliente agradecía, el bot
 * contestaba, el cliente devolvía "dale mil gracias buen finde", el bot
 * contestaba otra vez, el cliente mandaba tres emojis y el bot contestaba una
 * tercera vez.
 *
 * Lo que estas pruebas cuidan además del caso: que el corte NO se dispare
 * mientras la charla siga viva. Un "dale" después de un precio, de una pregunta
 * del bot o de un dato sigue mereciendo respuesta — el silencio depende de que
 * el bot YA se haya despedido con un mensaje pelado.
 */
import {
    debeCallarPorCierreSocial,
    esCierreSocialDelCliente,
    esDespedidaDelBot,
    esSoloEmojiOReaccion,
    pareceNoTeEntendi
} from "../nucleo/cierre-social"

const DESPEDIDA = "Dale hermano, cualquier cosa que necesites me escribis. Abrazo!"
const DESPEDIDA_2 = "Dale bro, cualquier cosa me escribis."
const CON_PRECIO = "Listo, entonces va recorrido corto para tu Smash: $175.000 con envío gratis a todo el país."
const CON_PREGUNTA = "Para pasarte el precio final decime: sabés si tu Smash es recorrido corto o largo?"
const CON_DATO = "La tapa viene completa y lista para colocar, con válvulas y leva incluida."

interface Caso {
    titulo: string
    ok: boolean
}

const casos: Caso[] = [
    // ── ¿El mensaje del cliente es puro trámite social? ───────────────────────
    { titulo: "'Dale muchas gracias' es cierre social", ok: esCierreSocialDelCliente("Dale muchas gracias") === true },
    { titulo: "'Dale mil gracias buen finde' es cierre social", ok: esCierreSocialDelCliente("Dale mil gracias buen finde") === true },
    { titulo: "'De una' es cierre social", ok: esCierreSocialDelCliente("De una") === true },
    { titulo: "'Dale perfecto' es cierre social", ok: esCierreSocialDelCliente("Dale perfecto") === true },
    { titulo: "'estamos en contacto' es cierre social", ok: esCierreSocialDelCliente("dale estamos en contacto") === true },
    { titulo: "'Daledale buenisimo muchas gracias' es cierre social", ok: esCierreSocialDelCliente("buenisimo muchas gracias") === true },
    { titulo: "una pregunta corta NO es cierre", ok: esCierreSocialDelCliente("dale y el envio?") === false },
    { titulo: "un dato NO es cierre", ok: esCierreSocialDelCliente("Recorrido corto es") === false },
    { titulo: "una moto NO es cierre", ok: esCierreSocialDelCliente("Gilera smash") === false },
    { titulo: "un número NO es cierre", ok: esCierreSocialDelCliente("dale 2") === false },
    { titulo: "'lo quiero comprar' NO es cierre", ok: esCierreSocialDelCliente("dale lo quiero comprar") === false },
    { titulo: "un texto largo NO es cierre aunque abra con gracias", ok: esCierreSocialDelCliente("gracias, igual queria saber si le va a la zanella zb 110 del 2019") === false },

    // ── Emojis y reacciones ──────────────────────────────────────────────────
    { titulo: "'💪🏼💪🏼💪🏼' es reacción pelada", ok: esSoloEmojiOReaccion("💪🏼💪🏼💪🏼") === true },
    { titulo: "'👍' es reacción pelada", ok: esSoloEmojiOReaccion("👍") === true },
    { titulo: "emoji + texto NO es reacción pelada", ok: esSoloEmojiOReaccion("👍 y el envio?") === false },
    { titulo: "texto vacío no cuenta como reacción", ok: esSoloEmojiOReaccion("") === false },

    // ── ¿El bot ya se había despedido? ───────────────────────────────────────
    { titulo: "despedida pelada del bot", ok: esDespedidaDelBot(DESPEDIDA) === true },
    { titulo: "otra despedida pelada", ok: esDespedidaDelBot(DESPEDIDA_2) === true },
    { titulo: "'De una! Cualquier duda me avisas.' es despedida", ok: esDespedidaDelBot("De una! Cualquier duda me avisas.") === true },
    { titulo: "un mensaje con precio NO es despedida", ok: esDespedidaDelBot(CON_PRECIO) === false },
    { titulo: "un mensaje con pregunta NO es despedida", ok: esDespedidaDelBot(CON_PREGUNTA) === false },
    { titulo: "un dato técnico NO es despedida", ok: esDespedidaDelBot(CON_DATO) === false },

    // ── La decisión completa, tal como la ve el motor ─────────────────────────
    {
        titulo: "conv 3988: 'Dale mil gracias buen finde' tras la despedida → silencio",
        ok: debeCallarPorCierreSocial("Dale mil gracias buen finde", DESPEDIDA, true) === true
    },
    {
        titulo: "conv 3988: los 💪🏼 del final → silencio",
        ok: debeCallarPorCierreSocial("💪🏼💪🏼💪🏼", "De una! Buen finde para vos tambien.", true) === true
    },
    {
        titulo: "conv 3960: 'De una' tras 'cualquier cosa me escribis' → silencio",
        ok: debeCallarPorCierreSocial("De una", DESPEDIDA_2, true) === true
    },
    {
        titulo: "el PRIMER gracias (después de un precio) sí se contesta",
        ok: debeCallarPorCierreSocial("Dale muchas gracias", CON_PRECIO, true) === false
    },
    {
        titulo: "un 'dale' después de una pregunta del bot sí se contesta",
        ok: debeCallarPorCierreSocial("Dale", CON_PREGUNTA, true) === false
    },
    {
        titulo: "una consulta nueva después de la despedida se contesta igual",
        ok: debeCallarPorCierreSocial("le va a la wave 110?", DESPEDIDA, true) === false
    },
    {
        titulo: "primer mensaje de la charla nunca se calla",
        ok: debeCallarPorCierreSocial("hola gracias", undefined, false) === false
    },

    // ── El "no te entendí" sobre una charla ya despedida ──────────────────────
    { titulo: "'Perdón, no te entendí. Me lo repetís?'", ok: pareceNoTeEntendi("Perdón, no te entendí. Me lo repetís?") === true },
    { titulo: "'no entendimos, que necesitas?'", ok: pareceNoTeEntendi("Hola bro. no entendimos, que necesitas?") === true },
    { titulo: "una respuesta normal no es un 'no te entendí'", ok: pareceNoTeEntendi(CON_DATO) === false }
]

let fallaron = 0
for (const c of casos) {
    console.log(`${c.ok ? "OK  " : "FALLA"}  ${c.titulo}`)
    if (!c.ok) fallaron++
}
console.log(`\n${casos.length - fallaron}/${casos.length} OK`)
process.exit(fallaron === 0 ? 0 : 1)
