// "Buscar Info Negocio (Envio General)" elige la fila correcta (2026-08-31)
// -------------------------------------------------------------------
// Destapado validando el fix "envio no se descarta" (conv de prueba 2411,
// "mandan a misiones?"): el nodo servía la fila `info_negocio` tema
// "Datos para envío" (id 13, el formulario de datos post-venta: NOMBRE/DNI/
// DOMICILIO...) en vez de "envios" (id 10, la política real de envíos).
// Causa: `rm_score('Datos para envío','envios')` da 1.0/0.5 (>= 0.5, matchea),
// y el `ORDER BY creado_en DESC` la prefería por ser más nueva.
//
// Fix: ordenar por mejor match de rm_score (suma de las dos direcciones) antes
// que por fecha. "envios" da 2.0, "Datos para envío" da 1.5 -> gana "envios".
// Sin tocar datos (la fila 13 se sigue usando donde se la pida por tema).
// Es el único nodo que consulta info_negocio con 'envios' hardcodeado; sirve
// tanto a la máquina de sub-preguntas genérica como a la rama de grupo.
//
// Uso: node apply-envio-general-elige-fila-envios.mjs [--dry]
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
  for (let i = 0; i < 40; i++) { const wf = await api(`/workflows/${WORKFLOW_ID}`); if (wf.nodes.length >= 400) return wf; console.log(`  cache stale (${wf.nodes.length}), reintento ${i + 1}`); }
  throw new Error("GET siempre devolvió versión vieja");
}
const rep = (s, a, b) => { if (!s.includes(a)) throw new Error(`ancla no encontrada: ${a}`); if (s.split(a).length > 2) throw new Error(`ancla ambigua: ${a}`); return s.split(a).join(b); };

async function main() {
  const wf = await getFresh();
  console.log("workflow:", wf.name, "| nodos:", wf.nodes.length, "| versionId:", wf.versionId);
  writeFileSync(new URL("./workflow_backup_pre-envio-general-fila_2026-08-31.json", OUT_DIR), JSON.stringify(wf, null, 0));

  const node = wf.nodes.find((n) => n.name === "Buscar Info Negocio (Envio General)");
  if (!node) throw new Error('Falta "Buscar Info Negocio (Envio General)"');

  node.parameters.query = rep(node.parameters.query,
    "  WHERE rm_score(tema, 'envios') >= 0.5 AND rm_score('envios', tema) >= 0.5\n  ORDER BY creado_en DESC LIMIT 1",
    "  WHERE rm_score(tema, 'envios') >= 0.5 AND rm_score('envios', tema) >= 0.5\n  ORDER BY rm_score(tema, 'envios') + rm_score('envios', tema) DESC, creado_en DESC LIMIT 1");

  console.log("\nquery nueva:\n" + node.parameters.query);
  if (DRY) return;

  const sk = ["saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder"];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => sk.includes(k)));
  const raw = JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings });
  let ascii = ""; for (let i = 0; i < raw.length; i++) { const cc = raw.charCodeAt(i); ascii += cc > 0x7f ? "\\u" + cc.toString(16).padStart(4, "0") : raw[i]; }
  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: ascii });
  console.log("PUT ok. nodos:", updated.nodes.length);

  const f = await getFresh();
  const q = f.nodes.find((n) => n.name === "Buscar Info Negocio (Envio General)").parameters.query;
  console.log(q.includes("rm_score(tema, 'envios') + rm_score('envios', tema) DESC") ? "  OK  ordena por mejor match" : "  FALLA");
}
main().catch((e) => { console.error(e); process.exit(1); });
