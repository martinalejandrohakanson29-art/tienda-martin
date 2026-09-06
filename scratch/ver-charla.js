// Vuelca la conversacion viva del simulador. node scratch/ver-charla.js [session_id]
require("dotenv").config()
const { Client } = require("pg")
const sessionId = process.argv[2] || "sesion-activa"

async function main() {
    const c = new Client({ connectionString: process.env.DATABASE_URL })
    await c.connect()
    const { rows } = await c.query(
        `SELECT id, mensaje_usuario, respuesta_bot, herramientas, escalado_humano, latencia_ms, tokens, created_at
         FROM bot_simulador_conversaciones WHERE session_id=$1 ORDER BY created_at ASC`, [sessionId])
    console.log(`\n=== Sesion "${sessionId}" - ${rows.length} turnos ===\n`)
    for (const r of rows) {
        console.log(`#${r.id}  ${new Date(r.created_at).toLocaleString("es-AR")}  (${r.latencia_ms}ms, ${r.tokens?.total ?? "?"} tok)`)
        console.log(`  CLIENTE: ${r.mensaje_usuario}`)
        for (const t of (Array.isArray(r.herramientas) ? r.herramientas : [])) {
            console.log(`  TOOL -> ${t.nombre}(${JSON.stringify(t.argumentos)})`)
            const m = t.resultado?.mensaje_para_agente
            if (m) console.log(`         DB: ${String(m).replace(/\n/g, " ").slice(0, 240)}`)
        }
        if (r.escalado_humano) console.log(`  >>> ESCALADO A HUMANO (silencio)`)
        console.log(`  BOT: ${r.respuesta_bot ?? "(silencio)"}`)
        console.log("")
    }
    const est = await c.query(`SELECT * FROM chat_conversacion_estado WHERE clave=$1`, [sessionId]).catch(() => null)
    if (est && est.rows[0]) console.log("ESTADO PERSISTIDO:", est.rows[0])
    await c.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
