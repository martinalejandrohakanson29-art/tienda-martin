// Mensaje de incompatibilidad editable desde la app (2026-09-02)
// ------------------------------------------------------------------
// Hasta hoy el texto de "no es compatible" estaba escrito a mano en 4 nodos del
// workflow. Ahora sale de chat_config.mensaje_incompatibilidad (tabla nueva,
// ver chat-config.sql), editable en /admin/chatwoot/catalogo -> "Mensajes del bot".
// Decision con Martin: texto FIJO, sin la moto ni el motivo tecnico, mismo para
// todos los casos (kit simple, grupo, "no hay kit para esa moto").
//
// Cambios:
//  0. `Buscar Kits Activos` (corre siempre, al frente): +1 columna
//     `mensaje_incompatibilidad` con el valor de chat_config.
//  1. `Preparar Respuesta Compatibilidad` (kit simple): rama incompatible ->
//     texto de config. Rama "Si, es compatible con tu {moto}" queda igual.
//  2. `Preparar Respuesta Compatibilidad (Grupo)`: idem.
//  3. `Preparar Respuesta No Compatible (Kit Confiado)`: reemplazo total.
//  4. `Preparar Respuesta Nada Compatible (Candidatos)`: reemplazo total.
// Fallback hardcodeado por si la config viniera vacia.
//
// Uso: node apply-mensaje-incompat-editable.mjs [--dry]
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta APIKEY_N8N");
const DRY = process.argv.includes("--dry");
const OUT_DIR = new URL("./", import.meta.url);

const FALLBACK = "Lamentablemente este kit no es compatible.";
const CONFIG_EXPR = `($('Buscar Kits Activos').first().json.mensaje_incompatibilidad || '${FALLBACK}')`;

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
  writeFileSync(new URL("./workflow_backup_pre-mensaje-incompat-editable_2026-09-02.json", OUT_DIR), JSON.stringify(wf, null, 0));
  const ROLLBACK = wf.versionId;

  // 0. Buscar Kits Activos: +columna
  const bka = node(wf, "Buscar Kits Activos");
  bka.parameters.query = rep(bka.parameters.query,
    "  ), '[]'::json) AS grupos;",
    "  ), '[]'::json) AS grupos,\n  (SELECT valor FROM chat_config WHERE clave = 'mensaje_incompatibilidad') AS mensaje_incompatibilidad;");

  // 1. Preparar Respuesta Compatibilidad (kit simple)
  const n1 = node(wf, "Preparar Respuesta Compatibilidad");
  n1.parameters.assignments.assignments[0].value =
    `={{ $json.compatible ? ('Sí, el kit es compatible con tu ' + $('Parsear Pregunta Compatibilidad').item.json.modelo_moto + ($json.detalle ? (', ' + $json.detalle) : '') + '.') : ${CONFIG_EXPR} }}`;

  // 2. Preparar Respuesta Compatibilidad (Grupo)
  const n2 = node(wf, "Preparar Respuesta Compatibilidad (Grupo)");
  n2.parameters.assignments.assignments[0].value =
    `={{ $json.compatible ? ('Sí, este producto es compatible con tu ' + $('Parsear Modelo Grupo').item.json.modelo_moto + ($json.detalle ? (', ' + $json.detalle) : '') + '.') : ${CONFIG_EXPR} }}`;

  // 3. Preparar Respuesta No Compatible (Kit Confiado)
  const n3 = node(wf, "Preparar Respuesta No Compatible (Kit Confiado)");
  n3.parameters.assignments.assignments[0].value = `={{ ${CONFIG_EXPR} }}`;

  // 4. Preparar Respuesta Nada Compatible (Candidatos)
  const n4 = node(wf, "Preparar Respuesta Nada Compatible (Candidatos)");
  n4.parameters.assignments.assignments[0].value = `={{ ${CONFIG_EXPR} }}`;

  console.log("\n0 query tail:\n" + bka.parameters.query.slice(-200));
  console.log("\n1:", n1.parameters.assignments.assignments[0].value);
  console.log("\n2:", n2.parameters.assignments.assignments[0].value);
  console.log("\n3:", n3.parameters.assignments.assignments[0].value);
  console.log("\n4:", n4.parameters.assignments.assignments[0].value);
  if (DRY) { console.log("\n[DRY] rollback:", ROLLBACK); return; }

  const sk = ["saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder"];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => sk.includes(k)));
  const raw = JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings });
  let ascii = ""; for (let i = 0; i < raw.length; i++) { const cc = raw.charCodeAt(i); ascii += cc > 0x7f ? "\\u" + cc.toString(16).padStart(4, "0") : raw[i]; }
  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: ascii });
  console.log("PUT ok. nodos:", updated.nodes.length);

  const f = await getFresh(459);
  const ok0 = node(f, "Buscar Kits Activos").parameters.query.includes("mensaje_incompatibilidad");
  const ok1 = node(f, "Preparar Respuesta Compatibilidad").parameters.assignments.assignments[0].value.includes("mensaje_incompatibilidad");
  const ok2 = node(f, "Preparar Respuesta Compatibilidad (Grupo)").parameters.assignments.assignments[0].value.includes("mensaje_incompatibilidad");
  const ok3 = node(f, "Preparar Respuesta No Compatible (Kit Confiado)").parameters.assignments.assignments[0].value.includes("mensaje_incompatibilidad");
  const ok4 = node(f, "Preparar Respuesta Nada Compatible (Candidatos)").parameters.assignments.assignments[0].value.includes("mensaje_incompatibilidad");
  console.log((ok0 && ok1 && ok2 && ok3 && ok4) ? "  OK  aplicado. Rollback: " + ROLLBACK : `  FALLA 0=${ok0} 1=${ok1} 2=${ok2} 3=${ok3} 4=${ok4}. Rollback: ` + ROLLBACK);
}
main().catch((e) => { console.error(e); process.exit(1); });
