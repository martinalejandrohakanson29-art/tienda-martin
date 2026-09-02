// "Extraer Tema Negocio (Esperando Variante)" tampoco re-lee la plantilla del anuncio (2026-09-02)
// ----------------------------------------------------------------------------------------------
// Continuacion del fix `apply-fix-articulo-suelto-grupo-plantilla-fantasma.mjs` (conv 3144). Al
// dejar de resolver el "articulo suelto fantasma", quedo destapado un SEGUNDO clasificador en
// paralelo -- `Extraer Tema Negocio (Esperando Variante)` -- que corre sobre
// `$('Unir Mensajes').texto_completo` (TODA la rafaga, incluida la linea de la plantilla del
// anuncio). Con "plantilla + a un motomel 110" lo clasificaba `otro` y, como el gate
// `¿Ya Resuelto Como Articulo Suelto (Con Modelo)?` ahora da false, escalaba una NOTA al equipo
// citando la plantilla como "algo que no supimos ubicar". Cambiamos un mensaje espurio al
// cliente por una nota espuria al equipo.
//
// Fix (mismo criterio que Fix A): este clasificador y su escalado usan el resto ya aislado
// (`Parsear Modelo Grupo`.resto_mensaje), no la rafaga completa.
//  D1. `Extraer Tema Negocio (Esperando Variante)`.text -> resto_mensaje (fallback texto_completo).
//  D2. `Parsear Tema Negocio (Esperando Variante)`.jsCode -> si el resto quedo vacio/en blanco,
//      clasificacion = 'nada' directo (no escala, no responde).
//  D3. `Preparar Nota Escalado Negocio (Esperando Variante)` y `Registrar Pendiente Negocio
//      (Esperando Variante)` -> citan el resto real, no la plantilla.
//
// Uso: node apply-fix-tema-negocio-espera-variante-sin-plantilla.mjs [--dry]
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
  for (let i = 0; i < 40; i++) { const wf = await api(`/workflows/${WORKFLOW_ID}`); if (wf.nodes.length >= 459) return wf; console.log(`  cache stale (${wf.nodes.length}), reintento ${i + 1}`); }
  throw new Error("GET siempre devolvio version vieja");
}
const rep = (s, a, b) => { if (!s.includes(a)) throw new Error(`ancla no encontrada: ${a}`); if (s.split(a).length > 2) throw new Error(`ancla ambigua: ${a}`); return s.split(a).join(b); };

const RESTO = "($('Parsear Modelo Grupo').item.json.resto_mensaje || '')";

async function main() {
  const wf = await getFresh();
  console.log("workflow:", wf.name, "| nodos:", wf.nodes.length, "| versionId:", wf.versionId);
  writeFileSync(new URL("./workflow_backup_pre-tema-negocio-espera-variante-sin-plantilla_2026-09-02.json", OUT_DIR), JSON.stringify(wf, null, 0));
  const ROLLBACK = wf.versionId;

  // D1
  const extra = wf.nodes.find((n) => n.name === "Extraer Tema Negocio (Esperando Variante)");
  if (!extra) throw new Error('Falta "Extraer Tema Negocio (Esperando Variante)"');
  extra.parameters.text = rep(extra.parameters.text,
    "=Mensaje del cliente: {{ $('Unir Mensajes').first().json.texto_completo }}",
    "=Mensaje del cliente: {{ $('Parsear Modelo Grupo').item.json.resto_mensaje || $('Unir Mensajes').first().json.texto_completo }}");

  // D2
  const parse = wf.nodes.find((n) => n.name === "Parsear Tema Negocio (Esperando Variante)");
  if (!parse) throw new Error('Falta "Parsear Tema Negocio (Esperando Variante)"');
  parse.parameters.jsCode = rep(parse.parameters.jsCode,
    "let clasificacion = 'nada';\nlet tema = 'otro';\ntry {",
    "let clasificacion = 'nada';\nlet tema = 'otro';\n// 2026-09-02 (conv 3144): si el extractor de modelo consumio todo el resto, no hay nada que clasificar ni escalar.\nconst _restoCli = " + RESTO + ".toString().trim();\nif (!_restoCli) {\n  return { json: { es_precio: false, precio_texto: '', es_negocio: false, es_otro: false, tema_sql: 'otro' } };\n}\ntry {");

  // D3
  const nota = wf.nodes.find((n) => n.name === "Preparar Nota Escalado Negocio (Esperando Variante)");
  if (!nota) throw new Error('Falta "Preparar Nota Escalado Negocio (Esperando Variante)"');
  nota.parameters.assignments.assignments[0].value = rep(nota.parameters.assignments.assignments[0].value,
    'es corto o largo: "{{ $(\'Unir Mensajes\').first().json.texto_completo }}".',
    'es corto o largo: "{{ $(\'Parsear Modelo Grupo\').item.json.resto_mensaje || $(\'Unir Mensajes\').first().json.texto_completo }}".');

  const reg = wf.nodes.find((n) => n.name === "Registrar Pendiente Negocio (Esperando Variante)");
  if (!reg) throw new Error('Falta "Registrar Pendiente Negocio (Esperando Variante)"');
  reg.parameters.query = rep(reg.parameters.query,
    "VALUES ({{ $('Webhook1').first().json.body.conversation.messages[0].conversation_id }}, '{{ $('Unir Mensajes').first().json.texto_completo.replace(/'/g, \"''\") }}');",
    "VALUES ({{ $('Webhook1').first().json.body.conversation.messages[0].conversation_id }}, '{{ ($('Parsear Modelo Grupo').item.json.resto_mensaje || $('Unir Mensajes').first().json.texto_completo).replace(/'/g, \"''\") }}');");

  console.log("\nD1:", extra.parameters.text);
  console.log("\nD2 head:\n" + parse.parameters.jsCode.split("\n").slice(0, 8).join("\n"));
  console.log("\nD3 nota:", nota.parameters.assignments.assignments[0].value.slice(0, 200), "...");
  console.log("\nD3 insert:", reg.parameters.query);
  if (DRY) { console.log("\n[DRY] rollback:", ROLLBACK); return; }

  const sk = ["saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder"];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => sk.includes(k)));
  const raw = JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings });
  let ascii = ""; for (let i = 0; i < raw.length; i++) { const cc = raw.charCodeAt(i); ascii += cc > 0x7f ? "\\u" + cc.toString(16).padStart(4, "0") : raw[i]; }
  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: ascii });
  console.log("PUT ok. nodos:", updated.nodes.length);

  const f = await getFresh();
  const okD1 = f.nodes.find((n) => n.name === "Extraer Tema Negocio (Esperando Variante)").parameters.text.includes("Parsear Modelo Grupo");
  const okD2 = f.nodes.find((n) => n.name === "Parsear Tema Negocio (Esperando Variante)").parameters.jsCode.includes("_restoCli");
  const okD3a = f.nodes.find((n) => n.name === "Preparar Nota Escalado Negocio (Esperando Variante)").parameters.assignments.assignments[0].value.includes("Parsear Modelo Grupo");
  const okD3b = f.nodes.find((n) => n.name === "Registrar Pendiente Negocio (Esperando Variante)").parameters.query.includes("Parsear Modelo Grupo");
  console.log((okD1 && okD2 && okD3a && okD3b) ? "  OK  Fix D aplicado. Rollback: " + ROLLBACK : `  FALLA D1=${okD1} D2=${okD2} D3a=${okD3a} D3b=${okD3b}. Rollback: ` + ROLLBACK);
}
main().catch((e) => { console.error(e); process.exit(1); });
