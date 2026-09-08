require("dotenv").config()
const { Client } = require("pg")
const tel = process.argv[2]
const suf = tel.replace(/\D/g,'').slice(-9)
async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()
  const esp = await c.query(`SELECT * FROM chatwoot_conversaciones_espejo WHERE telefono LIKE $1 ORDER BY id DESC LIMIT 5`, ['%'+suf+'%'])
  console.log("ESPEJO:", JSON.stringify(esp.rows, null, 2))
  await c.end()
}
main().catch(e=>{console.error(e.message);process.exit(1)})
