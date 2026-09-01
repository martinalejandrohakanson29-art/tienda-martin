import pg from 'pg';
import { readFileSync } from 'fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const url = env.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL=')).slice('DATABASE_URL='.length).replace(/^"|"$/g, "");

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  const modelo = 'motomel blitz';
  console.log("Querying with modelo:", modelo);

  const testQ = await client.query(`
    WITH combo AS (
      SELECT compatible, detalle, creado_en, 'combo' as fuente, id, modelo_moto
      FROM chat_combo_compatibilidad
      WHERE grupo_id = 2
        AND rm_modelo_ok(modelo_moto, $1)
      ORDER BY creado_en DESC
    ),
    articulo AS (
      SELECT cac.compatible, cac.detalle, cac.creado_en, 'articulo' as fuente, cac.id, cac.modelo_moto
      FROM chat_articulo_compatibilidad cac
      WHERE articulo_id = ANY(
        SELECT DISTINCT cpa.articulo_id FROM chat_pack_articulos cpa JOIN chat_packs p ON p.id = cpa.pack_id WHERE p.grupo_id = 2
      )
        AND rm_modelo_ok(cac.modelo_moto, $1)
      ORDER BY cac.creado_en DESC
    )
    SELECT * FROM combo
    UNION ALL
    SELECT * FROM articulo
  `, [modelo]);

  console.table(testQ.rows);

} catch (err) {
  console.error("Error:", err);
} finally {
  await client.end();
}
