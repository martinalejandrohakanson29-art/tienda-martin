require("dotenv").config()
const { Client } = require("pg")
const conv = process.argv[2]
async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()
  const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='bot_agente_turnos_reales' ORDER BY ordinal_position`)
  console.log("COLS:", cols.rows.map(r=>r.column_name).join(", "))
  const { rows } = await c.query(`SELECT * FROM bot_agente_turnos_reales WHERE conversation_id=$1 ORDER BY id ASC`, [conv])
  console.log("TURNOS:", rows.length)
  for (const r of rows) console.log(JSON.stringify(r, null, 2))
  await c.end()
}
main().catch(e=>{console.error(e.message);process.exit(1)})
