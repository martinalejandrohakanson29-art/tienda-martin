/**
 * Limpieza: filas de chatwoot_conversaciones_espejo marcadas bot_pausado=true
 * por error. Causa: registrarMensajeSalienteEnEspejo ponía bot_pausado=true para
 * CUALQUIER mensaje saliente, incluidas las respuestas automáticas del bot (que
 * pasan por /api/chatwoot/enviar). Nada lo revertía -> el switch del panel
 * /admin/chatwoot/chats-vivo mostraba "Bot OFF" en toda charla que el bot haya
 * contestado alguna vez.
 *
 * Reconciliamos cada fila true contra el historial real de Chatwoot con la misma
 * lógica que usa el webhook (calcularBotPausadoDesdeHistorial): gana el evento
 * más reciente entre "/bot off" / "/bot on" (nota privada) y un mensaje público
 * saliente de un agente humano real. null = ninguna señal -> nunca se pausó.
 *
 *   node fix-espejo-bot-pausado-espurio_2026-08-28.mjs          (dry-run)
 *   node fix-espejo-bot-pausado-espurio_2026-08-28.mjs --apply
 */
import "dotenv/config"
import pg from "pg"
import { calcularBotPausadoDesdeHistorial } from "../lib/chatwoot-bot.ts"

const APPLY = process.argv.includes("--apply")
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()

const { rows } = await c.query(
    `SELECT id, nombre FROM chatwoot_conversaciones_espejo WHERE bot_pausado = true ORDER BY ultima_actividad DESC`
)
console.log(`${rows.length} filas con bot_pausado=true a revisar\n`)

let aFalse = 0
let quedanTrue = 0
for (const r of rows) {
    const id = Number(r.id)
    let real
    try {
        real = await calcularBotPausadoDesdeHistorial(1, id)
    } catch (e) {
        console.log(`  ${id} (${r.nombre}): ERROR consultando Chatwoot, se deja como está`)
        continue
    }
    const nuevo = real === true // null o false -> no pausado
    if (nuevo) {
        quedanTrue++
        continue
    }
    aFalse++
    console.log(`  ${id} (${r.nombre}): true -> false  (historial: ${real === null ? "sin señal" : real})`)
    if (APPLY) {
        await c.query(
            `UPDATE chatwoot_conversaciones_espejo SET bot_pausado = false, actualizado_en = NOW() WHERE id = $1`,
            [r.id]
        )
    }
}

await c.end()
console.log(`\n${aFalse} pasan a Bot ON, ${quedanTrue} siguen pausadas (humano intervino).`)
console.log(APPLY ? "Aplicado." : "Dry-run. Correr con --apply.")
