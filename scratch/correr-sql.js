// Corre un archivo .sql contra el Postgres del proyecto.
// Uso: node scratch/correr-sql.js n8n-workflows/chat-variantes-sinonimos.sql
require("dotenv").config()
const fs = require("fs")
const { Client } = require("pg")

const file = process.argv[2]
if (!file) {
    console.error("Falta el path del .sql")
    process.exit(1)
}

async function main() {
    const sql = fs.readFileSync(file, "utf8")
    const client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    await client.query(sql)
    console.log(`OK: ${file} aplicado.`)
    await client.end()
}

main().catch((e) => {
    console.error(e.message)
    process.exit(1)
})
