// Archiva las filas `conocimiento_libre` categoria 'sin_match' -> 'sin_match_archivado'.
// Nadie las lee mas (el nodo `Buscar en Conocimiento Libre (Sin Match)` quedo desactivado, ver
// apply-desactivar-reuso-conocimiento-libre-sinmatch.mjs). Se conserva la data por si hace falta
// mirarla. Antes de tocar nada vuelca todo a un .json en esta carpeta.
//
// Uso:
//   node n8n-workflows/archivar-conocimiento-libre-sinmatch.mjs --dry
//   node n8n-workflows/archivar-conocimiento-libre-sinmatch.mjs
import pg from "pg";
import { readFileSync, writeFileSync } from "fs";

const DRY = process.argv.includes("--dry");
const url = readFileSync(new URL("../.env", import.meta.url), "utf8")
  .split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="))
  .slice("DATABASE_URL=".length).replace(/^"|"$/g, "");

const c = new pg.Client({ connectionString: url });
await c.connect();
try {
  const { rows } = await c.query(
    "SELECT * FROM conocimiento_libre WHERE categoria = 'sin_match' ORDER BY id"
  );
  console.log("filas 'sin_match':", rows.length);
  const dump = new URL(`./conocimiento-libre-sinmatch-archivado_2026-09-01.json`, import.meta.url);
  writeFileSync(dump, JSON.stringify(rows, null, 1));
  console.log("volcado a", dump.pathname.split("/").pop());

  if (DRY) { console.log("[DRY] no se toco la tabla"); }
  else {
    const r = await c.query(
      "UPDATE conocimiento_libre SET categoria = 'sin_match_archivado' WHERE categoria = 'sin_match'"
    );
    console.log("archivadas:", r.rowCount);
    const check = await c.query(
      "SELECT categoria, count(*)::int n FROM conocimiento_libre GROUP BY categoria ORDER BY categoria"
    );
    console.table(check.rows);
  }
} finally {
  await c.end();
}
