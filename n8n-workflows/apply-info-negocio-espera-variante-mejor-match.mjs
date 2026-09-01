// "Buscar Info Negocio (Esperando Variante)" elige la fila por mejor match, no por fecha (2026-09-01)
// -------------------------------------------------------------------------------------------------
// Mismo bug que ya se arreglo en `Buscar Info Negocio (Envio General)` el 2026-08-31, pero en el
// nodo gemelo del camino "esperando corto/largo". Destapado validando el fix de "consulta pegada
// en espera de variante" (conv de prueba 2411): el cliente pregunto por el envio y el bot le
// mando el FORMULARIO de datos post-venta (info_negocio id 13, "Datos para envio": NOMBRE/DNI/
// DOMICILIO...) en vez de la politica real de envios (id 10). Causa: `rm_score('Datos para
// envio','envios')` matchea (>= 0.5) y el `ORDER BY creado_en DESC` prefiere la fila mas nueva.
//
// Fix: ordenar por mejor match (suma de rm_score en las dos direcciones) antes que por fecha.
// Este nodo usa `{{ $json.tema_sql }}` (dinamico), asi que el fix sirve para cualquier tema.
// Sin tocar datos ni nodos.
//
// Uso: node apply-info-negocio-espera-variante-mejor-match.mjs [--dry]
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta APIKEY_N8N");
const DRY = process.argv.includes("--dry");
const OUT_DIR = new URL("./", import.meta.url);

async function api(path, options = {}) {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${API_URL}${path}${!options.method || options.method === "GET" ? `${sep}_cb=${Date.now()}-${Math.random()}` : ""}`;
  const res = await fetch(url, { ...options, headers: { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json", "Cache-Control": "no-cache", ...(options.headers || {}) } });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) { console.error("ERROR", res.status, body); throw new Error(`API ${path} => ${res.status}`); }
  return body;
}
async function getFresh() {
  for (let i = 0; i < 40; i++) { const wf = await api(`/workflows/${WORKFLOW_ID}`); if (wf.nodes.length >= 445) return wf; console.log(`  cache stale (${wf.nodes.length}), reintento ${i + 1}`); }
  throw new Error("GET siempre devolvio version vieja");
}
const rep = (s, a, b) => { if (!s.includes(a)) throw new Error(`ancla no encontrada: ${a}`); if (s.split(a).length > 2) throw new Error(`ancla ambigua: ${a}`); return s.split(a).join(b); };

async function main() {
  const wf = await getFresh();
  console.log("workflow:", wf.name, "| nodos:", wf.nodes.length, "| versionId:", wf.versionId);
  writeFileSync(new URL("./workflow_backup_pre-info-negocio-espera-variante_2026-09-01.json", OUT_DIR), JSON.stringify(wf, null, 0));
  const ROLLBACK = wf.versionId;

  const node = wf.nodes.find((n) => n.name === "Buscar Info Negocio (Esperando Variante)");
  if (!node) throw new Error('Falta "Buscar Info Negocio (Esperando Variante)"');

  node.parameters.query = rep(node.parameters.query,
    "  WHERE rm_score(tema, '{{ $json.tema_sql }}') >= 0.5 AND rm_score('{{ $json.tema_sql }}', tema) >= 0.5\n  ORDER BY creado_en DESC LIMIT 1",
    "  WHERE rm_score(tema, '{{ $json.tema_sql }}') >= 0.5 AND rm_score('{{ $json.tema_sql }}', tema) >= 0.5\n  ORDER BY rm_score(tema, '{{ $json.tema_sql }}') + rm_score('{{ $json.tema_sql }}', tema) DESC, creado_en DESC LIMIT 1");

  console.log("\nquery nueva:\n" + node.parameters.query);
  if (DRY) { console.log("\n[DRY] rollback:", ROLLBACK); return; }

  const sk = ["saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder"];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => sk.includes(k)));
  const raw = JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings });
  let ascii = ""; for (let i = 0; i < raw.length; i++) { const cc = raw.charCodeAt(i); ascii += cc > 0x7f ? "\\u" + cc.toString(16).padStart(4, "0") : raw[i]; }
  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: ascii });
  console.log("PUT ok. nodos:", updated.nodes.length);

  const f = await getFresh();
  const q = f.nodes.find((n) => n.name === "Buscar Info Negocio (Esperando Variante)").parameters.query;
  console.log(q.includes("+ rm_score('{{ $json.tema_sql }}', tema) DESC, creado_en DESC") ? "  OK  ordena por mejor match. Rollback: " + ROLLBACK : "  FALLA. Rollback: " + ROLLBACK);
}
main().catch((e) => { console.error(e); process.exit(1); });
