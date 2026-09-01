// Desactivar el reuso difuso de "conocimiento libre (sin_match)".
// -----------------------------------------------------------------------------------------------
// Caso disparador: conv 3109 (+5493815420503, "Benja"). Entro por un anuncio cuya plantilla
// dice "combo 110 a 140 + Codo y carbu" (el kit real es "110 a 120"), no matcheo exacto y cayo
// en el partidor de sub-preguntas como "otro". El nodo `Buscar en Conocimiento Libre (Sin Match)`
// comparo el texto por parecido difuso (rm_score >= 0.75) contra las respuestas viejas del equipo
// y matcheo (score 0.857) la fila 190: un cliente distinto habia pedido un "cubre amortiguador"
// para su "Motomel Blitz 2013". El bot le mando a Benja esa respuesta -- una moto y una pieza que
// nunca nombro. Ejecucion n8n #92533.
//
// Auditoria de la tabla: de 169 filas categoria 'sin_match', ~51 son precios sueltos, ~30 son
// respuestas de compatibilidad (si/no atadas a una moto puntual), ~8 son preguntas de una palabra
// ("?", "110", "Te queda") y el resto depende del hilo de esa conversacion. Solo ~14 son datos
// generales reutilizables, y esos 14 ya estan en `info_negocio`. La premisa misma -- matchear un
// mensaje libre contra respuestas viejas y mandarlo casi tal cual -- es "adivinar", lo contrario
// del principio del aliviador (match aproximado = derivar). No hay umbral que lo arregle.
//
// Decision (Martin, 2026-09-01): apagar el reuso + archivar la tabla.
//   1. `Buscar en Conocimiento Libre (Sin Match)`: la query pasa a devolver SIEMPRE respuesta NULL
//      (una fila, para no romper la referencia `$('...').item` de `Consolidar Dato Resuelto`).
//      Todo lo que no matchea por otro lado escala al equipo, como el resto del partidor.
//   2. `Guardar en Conocimiento Libre (Sin Match)`: sigue insertando (para no romper el flujo
//      aguas abajo -- `Marcar Pendiente Sin Match Respondida` depende de que el nodo emita item),
//      pero con categoria 'sin_match_archivado', que nadie lee. Deja de alimentar el pool.
//   3. Las 169 filas existentes se archivan aparte con `archivar-conocimiento-libre-sinmatch.mjs`.
//
// El circuito de la Fase 7 (nota del equipo -> respuesta al cliente con voz del bot -> marcar
// respondida) NO se toca: lo unico que se corta es el reuso proactivo de esas respuestas.
//
// Sin nodos nuevos, sin rewiring: solo 2 ediciones de SQL.
//
// Uso:
//   node apply-desactivar-reuso-conocimiento-libre-sinmatch.mjs --dry
//   node apply-desactivar-reuso-conocimiento-libre-sinmatch.mjs
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.APIKEY_N8N || process.env.API_KEY_N8N || process.env.N8N_KEY;
if (!API_KEY) throw new Error("Falta APIKEY_N8N en el entorno");
const DRY = process.argv.includes("--dry");
const OUT_DIR = new URL("./", import.meta.url);

async function api(path, options = {}) {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${API_URL}${path}${options.method && options.method !== "GET" ? "" : `${sep}_cb=${Date.now()}-${Math.random()}`}`;
  const res = await fetch(url, {
    ...options,
    headers: { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json", "Cache-Control": "no-cache", ...(options.headers || {}) },
  });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) { console.error("ERROR", res.status, JSON.stringify(body, null, 2)); throw new Error(`API ${path} => ${res.status}`); }
  return body;
}

async function getFresh() {
  for (let i = 0; i < 40; i++) {
    const wf = await api(`/workflows/${WORKFLOW_ID}`);
    if (wf.nodes && wf.nodes.length >= 455) return wf;
    console.log(`  (GET devolvio ${wf.nodes && wf.nodes.length} nodos - cache stale, reintento ${i + 1})`);
  }
  throw new Error("el GET siempre devolvio una version vieja del workflow");
}

const QUERY_BUSCAR_NUEVA =
  "-- DESACTIVADO 2026-09-01 (ver n8n-workflows/CHATWOOT-BOT-CONTEXTO.md, conv 3109 +5493815420503).\n" +
  "-- El reuso difuso de respuestas del equipo mandaba adivinanzas atadas al contexto de otra\n" +
  "-- conversacion. El nodo queda cableado para no romper referencias, pero nunca devuelve dato:\n" +
  "-- todo lo que no se resuelve por otro lado escala al equipo.\n" +
  "SELECT NULL::text AS respuesta;";

const QUERY_GUARDAR_VIEJA =
  "INSERT INTO conocimiento_libre (categoria, clave, pregunta, respuesta, fuente)\n" +
  "SELECT 'sin_match', '', '{{ $json.pregunta_original_sql }}', '{{ $json.mensaje_cliente_sql }}', 'equipo'\n" +
  "WHERE length(trim('{{ $json.mensaje_cliente_sql }}')) > 0;";

const QUERY_GUARDAR_NUEVA =
  "-- DESACTIVADO 2026-09-01: se archiva en categoria 'sin_match_archivado' (nadie la lee) para\n" +
  "-- no alimentar mas el pool de reuso difuso, sin romper el flujo aguas abajo.\n" +
  "INSERT INTO conocimiento_libre (categoria, clave, pregunta, respuesta, fuente)\n" +
  "SELECT 'sin_match_archivado', '', '{{ $json.pregunta_original_sql }}', '{{ $json.mensaje_cliente_sql }}', 'equipo'\n" +
  "WHERE length(trim('{{ $json.mensaje_cliente_sql }}')) > 0;";

async function main() {
  const wf = await getFresh();
  console.log("workflow:", wf.name, "| nodos:", wf.nodes.length, "| versionId:", wf.versionId, "| updatedAt:", wf.updatedAt);
  writeFileSync(new URL("./workflow_backup_pre-desactivar-reuso-conocimiento-libre_2026-09-01.json", OUT_DIR), JSON.stringify(wf, null, 0));
  const ROLLBACK = wf.versionId;

  const N = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
  const buscar = N["Buscar en Conocimiento Libre (Sin Match)"];
  const guardar = N["Guardar en Conocimiento Libre (Sin Match)"];
  if (!buscar) throw new Error('Falta el nodo "Buscar en Conocimiento Libre (Sin Match)"');
  if (!guardar) throw new Error('Falta el nodo "Guardar en Conocimiento Libre (Sin Match)"');

  if (!buscar.parameters.query.includes("rm_score(clave || ' ' || pregunta")) {
    console.log("  (aviso) `Buscar...` ya no tiene la query esperada -- puede estar ya aplicado");
  }
  if (guardar.parameters.query.trim() !== QUERY_GUARDAR_VIEJA.trim() && !guardar.parameters.query.includes("sin_match_archivado")) {
    console.log("  (aviso) `Guardar...` no coincide exacto con la query esperada:");
    console.log(JSON.stringify(guardar.parameters.query));
  }

  buscar.parameters.query = QUERY_BUSCAR_NUEVA;
  guardar.parameters.query = QUERY_GUARDAR_NUEVA;

  const sk = ["saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder"];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => sk.includes(k)));
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  if (DRY) {
    console.log("\n[DRY] Buscar... nueva query:\n" + QUERY_BUSCAR_NUEVA);
    console.log("\n[DRY] Guardar... nueva query:\n" + QUERY_GUARDAR_NUEVA);
    console.log("\n[DRY] rollback versionId:", ROLLBACK);
    return;
  }

  const raw = JSON.stringify(body);
  let ascii = ""; for (let i = 0; i < raw.length; i++) { const cc = raw.charCodeAt(i); ascii += cc > 0x7f ? "\\u" + cc.toString(16).padStart(4, "0") : raw[i]; }
  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: ascii });
  console.log("PUT ok. nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const f = await getFresh();
  const fN = Object.fromEntries(f.nodes.map((n) => [n.name, n]));
  const checks = [
    ["Buscar... devuelve NULL siempre", fN["Buscar en Conocimiento Libre (Sin Match)"].parameters.query.includes("SELECT NULL::text AS respuesta")],
    ["Buscar... ya no usa rm_score", !fN["Buscar en Conocimiento Libre (Sin Match)"].parameters.query.includes("rm_score(clave")],
    ["Guardar... escribe sin_match_archivado", fN["Guardar en Conocimiento Libre (Sin Match)"].parameters.query.includes("'sin_match_archivado'")],
    ["Guardar... ya no escribe 'sin_match'", !/SELECT 'sin_match',/.test(fN["Guardar en Conocimiento Libre (Sin Match)"].parameters.query)],
  ];
  let ok = true;
  for (const [l, v] of checks) { console.log(v ? "  OK  " : "  FALLA", l); if (!v) ok = false; }
  console.log(ok ? "\nAplicado. Rollback: restore version " + ROLLBACK : "\nREVISAR. Rollback: restore version " + ROLLBACK);
  console.log("Falta: correr `node n8n-workflows/archivar-conocimiento-libre-sinmatch.mjs` para archivar las 169 filas.");
}

main().catch((e) => { console.error(e); process.exit(1); });
