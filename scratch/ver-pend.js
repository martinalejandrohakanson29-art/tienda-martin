require("dotenv").config()
const { Client } = require("pg")
async function main(){
 const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect()
 for (const t of ['preguntas_tecnicas_pendientes','preguntas_precio_pendientes','preguntas_negocio_pendientes','preguntas_sin_match_pendientes']){
   const r=await c.query(`SELECT * FROM ${t} WHERE conversation_id=3599`).catch(e=>({rows:['ERR '+e.message]}))
   console.log(t, JSON.stringify(r.rows,null,1))
 }
 const m=await c.query(`SELECT motivo_escalado, count(*) FROM bot_agente_turnos_reales WHERE escalado_humano GROUP BY 1 ORDER BY 2 DESC`)
 console.table(m.rows)
 await c.end()
}
main().catch(e=>{console.error(e.message);process.exit(1)})
