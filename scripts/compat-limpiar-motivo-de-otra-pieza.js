/**
 * MOTIVOS PEGADOS A LA PIEZA EQUIVOCADA (tandas del aprendizaje)
 * --------------------------------------------------------------
 * Cuando el equipo responde una pregunta tecnica desde el panel, el aprendizaje
 * escribe UNA fila por cada pieza del kit y le copia a todas el MISMO `detalle`
 * (la nota del asesor). La nota suele hablar de una sola pieza — y encima con su
 * precio — asi que las otras filas de la tanda quedan con un motivo que no es el
 * suyo. Ese texto es el que el bot le repite al cliente.
 *
 * El 10/09 salio a la luz porque el respaldo de detalle lo prestaba ademas a
 * otros productos (una Gilera Smash recibia el precio de la Tapa CDI al preguntar
 * por el Kit 120). Eso ya se corto en codigo (`mismoProducto` en
 * bot-agente/herramientas/compatibilidad.ts). Este script limpia el dato: las
 * filas donde el motivo habla de OTRA pieza se quedan sin motivo, que es la
 * verdad — nadie cargo uno para ellas. El veredicto (`compatible`) NO se toca.
 *
 * Solo las inequivocas: el texto nombra un producto o un precio que no es el de
 * la fila. Las tandas donde no se sabe a que pieza pertenece el precio
 * (ids 507-511 "cuesta $34.999", 514-516 "Precio: $189.000", 429-430 "es un poco
 * mas caro y se envio un link") quedan para que las decida Martin: borrarlas
 * perderia el dato real de la pieza que si le corresponde.
 *
 * Uso:   node scripts/compat-limpiar-motivo-de-otra-pieza.js            (dry run)
 *        node scripts/compat-limpiar-motivo-de-otra-pieza.js --aplicar  (backup + escribe)
 *
 * Es idempotente: la segunda corrida no encuentra nada para limpiar.
 */
require("dotenv").config()
const { Client } = require("pg")
const APLICAR = process.argv.includes("--aplicar")

/** id de la fila -> por que su motivo no es suyo. */
const LIMPIAR = [
  [428, "art 12 Cilindro 120 largo / 'smash tuning': el texto es de la Tapa CDI (fila 427) y trae su precio ($129.999)"],
  [590, "art 14 Leva 6.40 corta / 'rouser 125': el texto es del Escape Paolucci (fila 589) y trae su precio ($169.000)"],
  [591, "art 15 Leva 6.40 larga / 'rouser 125': idem fila 590"],
  [602, "art 18 Leva de calle 7.80 / 'wave s': el texto describe un kit de cilindro 120 + leva, y el precio viene cortado ('a $129.')"],
]

;(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()
  const q = (s, p) => c.query(s, p)
  const ids = LIMPIAR.map(([id]) => id)

  const r = await q(
    `SELECT ac.id, ac.articulo_id, COALESCE(ca.titulo_comercial, ca.categoria, '') AS pieza,
            ac.modelo_moto, ac.compatible, COALESCE(ac.detalle, '') AS detalle
       FROM chat_articulo_compatibilidad ac
       JOIN chat_articulos ca ON ca.id = ac.articulo_id
      WHERE ac.id = ANY($1) ORDER BY ac.id`,
    [ids]
  )

  console.log(`### filas a limpiar (${r.rows.length} de ${ids.length} pedidas)`)
  for (const f of r.rows) {
    const motivo = LIMPIAR.find(([id]) => id === f.id)[1]
    console.log(`\n  id ${f.id} | art ${f.articulo_id} ${f.pieza} | ${f.modelo_moto} | ${f.compatible ? "SI" : "NO"}`)
    console.log(`     detalle actual: ${f.detalle || "(ya vacio)"}`)
    console.log(`     por que:        ${motivo}`)
  }
  const yaVacias = r.rows.filter((f) => !f.detalle.trim()).length
  if (yaVacias) console.log(`\n  (${yaVacias} ya estaban vacias: nada que hacer con esas)`)
  const faltantes = ids.filter((id) => !r.rows.some((f) => f.id === id))
  if (faltantes.length) console.log(`\n  OJO: no existen las filas ${faltantes.join(", ")} (ya borradas?)`)

  if (!APLICAR) {
    console.log("\n>>> DRY RUN (nada escrito). Correr con --aplicar")
    await c.end()
    return
  }

  const stamp = "20260910"
  await q(`CREATE TABLE IF NOT EXISTS chat_articulo_compatibilidad_bk_${stamp} AS TABLE chat_articulo_compatibilidad`)
  console.log(`\nBACKUP hecho: chat_articulo_compatibilidad_bk_${stamp}`)
  await q("BEGIN")
  const u = await q(`UPDATE chat_articulo_compatibilidad SET detalle = '' WHERE id = ANY($1)`, [ids])
  await q("COMMIT")
  console.log(`>>> APLICADO: ${u.rowCount} filas sin motivo (veredicto intacto)`)
  await c.end()
})().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
