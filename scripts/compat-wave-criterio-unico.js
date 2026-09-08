/**
 * CRITERIO UNICO DE COMPATIBILIDAD DE LA HONDA WAVE (cilindro 120 / tapa CDI)
 * ---------------------------------------------------------------------------
 * La Wave NO es compatible, y el motivo es el alesado de carteres. Antes
 * convivian tres redacciones del mismo criterio y filas contradictorias (SI y
 * NO para la misma moto y el mismo articulo), repartidas en tres tablas:
 * `chat_articulo_compatibilidad`, `chat_combo_compatibilidad` y la legacy
 * `compatibilidades`. Un cliente recibia "no es compatible" pelado, o "si es
 * compatible", segun cual fila ganara el puntaje (conv 3660, 08/09).
 *
 * NO toca el Escape Paolucci ni las Levas 6.40: esos son NO compatibles por su
 * propio motivo, que no es el alesado.
 *
 * Uso:   node scripts/compat-wave-criterio-unico.js            (dry run)
 *        node scripts/compat-wave-criterio-unico.js --aplicar  (backup + escribe)
 *
 * Es idempotente: correrlo dos veces no cambia nada la segunda vez.
 */
require("dotenv").config()
const { Client } = require("pg")
const APLICAR = process.argv.includes("--aplicar")
const TXT = "Para que entre hay que hacerle modificaciones al motor (alesar los cárteres) — no es un cambio directo de fábrica."
// Articulos donde el alesado de carteres es el motivo real (cilindro / tapa CDI).
// El 17 (Cilindro 170) por la misma razon que el 120: tampoco entra directo.
const ART_ALESADO = [7, 12, 16, 17]
const RX_WAVE = "(wave|wawe|weiv)"

;(async()=>{
 const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect()
 const q=(s,p)=>c.query(s,p)
 const show=(t,rows)=>{ console.log(`\n### ${t} (${rows.length})`); for(const x of rows) console.log("   "+Object.values(x).map(v=>v===null?"(null)":String(v)).join(" | ")) }

 if (APLICAR) {
   const stamp = "20260908b"
   for (const t of ["chat_articulo_compatibilidad","chat_combo_compatibilidad","compatibilidades"]) {
     await q(`CREATE TABLE IF NOT EXISTS ${t}_bk_${stamp} AS TABLE ${t}`)
   }
   console.log(`BACKUP hecho: *_bk_${stamp}`)
   await q("BEGIN")
 }

 // 1) Cilindro 120 corto/largo + Tapa CDI, cualquier grafia de Wave -> NO + texto unico
 let r=await q(`SELECT id, articulo_id, modelo_moto, compatible, COALESCE(detalle,'') detalle
   FROM chat_articulo_compatibilidad WHERE articulo_id = ANY($1) AND modelo_moto ~* $2
   AND (compatible = true OR COALESCE(detalle,'') <> $3) ORDER BY id`, [ART_ALESADO, RX_WAVE, TXT])
 show("1) articulos de alesado -> NO + texto unico", r.rows)
 if (APLICAR) await q(`UPDATE chat_articulo_compatibilidad SET compatible=false, detalle=$3
   WHERE articulo_id = ANY($1) AND modelo_moto ~* $2`, [ART_ALESADO, RX_WAVE, TXT])

 // 2) Carburador/Codo/Filtro: el motivo del alesado no les corresponde, se limpia (siguen compatibles)
 r=await q(`SELECT id, articulo_id, modelo_moto, compatible, detalle FROM chat_articulo_compatibilidad
   WHERE id = ANY($1)`, [[596,597,598]])
 show("2) piezas perifericas: quitar el motivo mal pegado (siguen SI)", r.rows)
 if (APLICAR) await q(`UPDATE chat_articulo_compatibilidad SET detalle='' WHERE id = ANY($1)`, [[596,597,598]])

 // 3) Duplicados por grafia del cliente: "wawe Nf" ya lo cubre el resolvedor
 r=await q(`SELECT id, articulo_id, modelo_moto, compatible FROM chat_articulo_compatibilidad
   WHERE modelo_moto ~* '(wawe|weiv)' ORDER BY id`)
 show("3) filas con la grafia del cliente -> borrar (duplican 'wave nf')", r.rows)
 if (APLICAR) await q(`DELETE FROM chat_articulo_compatibilidad WHERE modelo_moto ~* '(wawe|weiv)'`)

 // 4) Combos que llevan cilindro/tapa (grupos 1,3,4). El grupo 2 (Escape+Leva) tiene su propio motivo.
 r=await q(`SELECT id, grupo_id, modelo_moto, compatible, COALESCE(detalle,'') detalle
   FROM chat_combo_compatibilidad WHERE grupo_id = ANY($1) AND modelo_moto ~* $2
   AND (compatible = true OR COALESCE(detalle,'') <> $3) ORDER BY id`, [[1,3,4], RX_WAVE, TXT])
 show("4) combos con cilindro/tapa -> NO + texto unico", r.rows)
 if (APLICAR) await q(`UPDATE chat_combo_compatibilidad SET compatible=false, detalle=$3
   WHERE grupo_id = ANY($1) AND modelo_moto ~* $2`, [[1,3,4], RX_WAVE, TXT])

 // 5) Legacy: kits de cilindro con el motivo vacio (91 = Escape Dm Curvo, motivo propio, NO se toca)
 r=await q(`SELECT id, kit, modelo_moto, compatible, COALESCE(detalle,'') detalle FROM compatibilidades
   WHERE modelo_moto ~* $1 AND id <> 91 AND (compatible = true OR COALESCE(detalle,'') <> $2) ORDER BY id`, [RX_WAVE, TXT])
 show("5) legacy compatibilidades -> NO + texto unico (91 escape: intacta)", r.rows)
 if (APLICAR) await q(`UPDATE compatibilidades SET compatible=false, detalle=$2
   WHERE modelo_moto ~* $1 AND id <> 91`, [RX_WAVE, TXT])

 if (APLICAR) { await q("COMMIT"); console.log("\n>>> APLICADO") } else console.log("\n>>> DRY RUN (nada escrito). Correr con --aplicar")
 await c.end()
})().catch(e=>{console.error(e.message);process.exit(1)})
