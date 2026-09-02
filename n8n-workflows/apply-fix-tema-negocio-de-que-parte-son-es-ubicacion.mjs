// Fix: "De que parte son?" / "de donde son?" ahora se clasifica ubicacion (2026-09-02)
// ---------------------------------------------------------------------------
// Al validar el fix resto-variante (conv 3223) se vio que `Extraer Tema Negocio
// (Sub-pregunta)` clasifica "De que parte son ?" como "otro" en vez de
// "ubicacion" -> no encuentra dato -> escala una pregunta que el bot SI sabe
// (la direccion). Frase ambigua ("de que parte" = de que zona / que pieza),
// el LLM zigzaguea. Fix: una linea explicita en el systemMessage.
//
// Cambio: 1 nodo, 1 edicion de texto. `Extraer Tema Negocio (Sub-pregunta)`.
//
// Uso: node apply-fix-tema-negocio-de-que-parte-son-es-ubicacion.mjs [--dry]
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
async function getFresh(min) {
  for (let i = 0; i < 40; i++) { const wf = await api(`/workflows/${WORKFLOW_ID}`); if (wf.nodes.length >= min) return wf; console.log(`  cache stale (${wf.nodes.length}), reintento ${i + 1}`); }
  throw new Error("GET siempre devolvio version vieja");
}
const rep = (s, a, b) => { if (!s.includes(a)) throw new Error(`ancla no encontrada:\n${a}`); if (s.split(a).length > 2) throw new Error(`ancla ambigua: ${a}`); return s.split(a).join(b); };
const node = (wf, name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`Falta nodo "${name}"`); return n; };

async function main() {
  const wf = await getFresh(459);
  console.log("workflow:", wf.name, "| nodos:", wf.nodes.length, "| versionId:", wf.versionId);
  writeFileSync(new URL("./workflow_backup_pre-fix-tema-negocio-de-que-parte_2026-09-02.json", OUT_DIR), JSON.stringify(wf, null, 0));
  const ROLLBACK = wf.versionId;

  const n = node(wf, "Extraer Tema Negocio (Sub-pregunta)");
  n.parameters.options.systemMessage = rep(n.parameters.options.systemMessage,
    'Usa "otro" si es sobre el negocio pero no encaja en los anteriores.',
    '"ubicacion" cubre cualquier forma de preguntar donde queda el local o de que ciudad/zona/parte/lugar es el negocio, aunque no diga la palabra "ubicacion" ni "direccion" (ej. "donde estan", "de donde son", "de que parte son", "de que parte sos", "en que ciudad estan", "donde quedan", "tienen local fisico", "son de Cordoba?"). Usa "otro" si es sobre el negocio pero no encaja en los anteriores.');

  console.log("\n--- systemMessage nuevo ---\n" + n.parameters.options.systemMessage);
  if (DRY) { console.log("\n[DRY] rollback:", ROLLBACK); return; }

  const sk = ["saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder"];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => sk.includes(k)));
  const raw = JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings });
  let ascii = ""; for (let i = 0; i < raw.length; i++) { const cc = raw.charCodeAt(i); ascii += cc > 0x7f ? "\\u" + cc.toString(16).padStart(4, "0") : raw[i]; }
  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: ascii });
  console.log("PUT ok. nodos:", updated.nodes.length);

  const f = await getFresh(459);
  const ok = node(f, "Extraer Tema Negocio (Sub-pregunta)").parameters.options.systemMessage.includes("de que parte son");
  console.log(ok ? "  OK  aplicado. Rollback: " + ROLLBACK : "  FALLA. Rollback: " + ROLLBACK);
}
main().catch((e) => { console.error(e); process.exit(1); });
