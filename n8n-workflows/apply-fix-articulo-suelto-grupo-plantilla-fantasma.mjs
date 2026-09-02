// Grupo esperando la moto: la plantilla del anuncio ya no se re-lee como consulta de pieza suelta (2026-09-02)
// -----------------------------------------------------------------------------------------------------------
// Caso real conv 3144 (+5492226443553). Rafaga: plantilla "COMBO TAPA CDI 125 + CILINDRO 120" + "A un motomel 110".
// PUT 1 clasifico bien: unica parte = `moto` (partes:[], ruteo_moto:true) -> extractor de modelo. El bot mando 3
// mensajes: (1) bienvenida OK, (2) "compatible + corto/largo?" OK, (3) "La tapa viene completa y lista para
// colocar..." -- SOBRABA.
//
// Causa (2 nodos encadenados):
//  1. `Extraer Modelo Grupo` recibia `$('Unir Mensajes').texto_completo` (toda la rafaga, incluida la linea de la
//     plantilla del anuncio) en vez del resto ya aislado ("A un motomel 110"). Sacaba "motomel 110" y devolvia
//     como `resto_mensaje` la propia linea de la plantilla: "Quiero mas informacion SOBRE EL COMBO TAPA CDI 125...".
//  2. `Responder Articulo Suelto (Grupo - Con Modelo)` corria sobre ese sobrante, leia "TAPA CDI" como un pedido
//     de la tapa suelta y devolvia resuelto:true + texto libre de la ficha. `Parsear Articulo Suelto` solo valida
//     cuando hay `articulo_ids` -> paso sin control.
//
// Fix (3 ediciones de texto, sin nodos ni rewiring):
//  A. `Extraer Modelo Grupo`.text -> usa `Preparar Contexto Sub-preguntas`.texto_para_dividir (el resto sin la
//     plantilla, ya computado por PUT 1), fallback a texto_completo.
//  B. `Responder Articulo Suelto (Grupo - Con Modelo)`.text -> saca el fallback `|| texto_completo`: si el
//     extractor de modelo se comio todo el mensaje, no hay nada que preguntar.
//  C. `Parsear Articulo Suelto (Grupo - Con Modelo)`.jsCode -> (c1) guarda: si el texto del cliente que llega a
//     esta rama esta vacio/en blanco, resuelto=false directo; (c2) saca el mismo fallback `|| texto_completo`
//     de la linea `textoCliente`.
//
// Uso: node apply-fix-articulo-suelto-grupo-plantilla-fantasma.mjs [--dry]
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

async function main() {
  const wf = await getFresh();
  console.log("workflow:", wf.name, "| nodos:", wf.nodes.length, "| versionId:", wf.versionId);
  writeFileSync(new URL("./workflow_backup_pre-articulo-suelto-plantilla-fantasma_2026-09-02.json", OUT_DIR), JSON.stringify(wf, null, 0));
  const ROLLBACK = wf.versionId;

  // --- A. Extraer Modelo Grupo ---
  const extractor = wf.nodes.find((n) => n.name === "Extraer Modelo Grupo");
  if (!extractor) throw new Error('Falta "Extraer Modelo Grupo"');
  extractor.parameters.text = rep(extractor.parameters.text,
    "=Mensaje del cliente: {{ $('Unir Mensajes').item.json.texto_completo }}",
    "=Mensaje del cliente: {{ $('Preparar Contexto Sub-preguntas').item.json.texto_para_dividir || $('Unir Mensajes').item.json.texto_completo }}");

  // --- B. Responder Articulo Suelto (Grupo - Con Modelo) ---
  const resp = wf.nodes.find((n) => n.name === "Responder Articulo Suelto (Grupo - Con Modelo)");
  if (!resp) throw new Error('Falta "Responder Articulo Suelto (Grupo - Con Modelo)"');
  resp.parameters.text = rep(resp.parameters.text,
    "=Mensaje del cliente: {{ $('Parsear Modelo Grupo').item.json.resto_mensaje || $('Unir Mensajes').item.json.texto_completo }}",
    "=Mensaje del cliente: {{ $('Parsear Modelo Grupo').item.json.resto_mensaje }}");

  // --- C. Parsear Articulo Suelto (Grupo - Con Modelo) ---
  const parse = wf.nodes.find((n) => n.name === "Parsear Articulo Suelto (Grupo - Con Modelo)");
  if (!parse) throw new Error('Falta "Parsear Articulo Suelto (Grupo - Con Modelo)"');
  // c1: guarda por texto vacio, justo antes del parseo del output
  parse.parameters.jsCode = rep(parse.parameters.jsCode,
    "let resuelto = false, articuloIds = [], dato = '';\ntry {\n  const raw = ($json.output || '{}').toString().trim();",
    "let resuelto = false, articuloIds = [], dato = '';\n// 2026-09-02 (conv 3144): si el extractor de modelo consumio todo el mensaje, no hay consulta suelta que responder.\nconst _textoCli = ($('Parsear Modelo Grupo').item.json.resto_mensaje || '').toString().trim();\nif (!_textoCli) { return { json: { resuelto: false, dato: '' } }; }\ntry {\n  const raw = ($json.output || '{}').toString().trim();");
  // c2: saca el fallback a texto_completo en la linea de desambiguacion
  parse.parameters.jsCode = rep(parse.parameters.jsCode,
    "const textoCliente = normalizar(($('Parsear Modelo Grupo').item.json.resto_mensaje || $('Unir Mensajes').item.json.texto_completo) || '');",
    "const textoCliente = normalizar($('Parsear Modelo Grupo').item.json.resto_mensaje || '');");

  console.log("\n--- A. Extraer Modelo Grupo.text ---\n" + extractor.parameters.text);
  console.log("\n--- B. Responder Articulo Suelto.text ---\n" + resp.parameters.text);
  console.log("\n--- C. Parsear Articulo Suelto.jsCode (head) ---\n" + parse.parameters.jsCode.split("\n").slice(0, 14).join("\n"));
  if (DRY) { console.log("\n[DRY] rollback:", ROLLBACK); return; }

  const sk = ["saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder"];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => sk.includes(k)));
  const raw = JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings });
  let ascii = ""; for (let i = 0; i < raw.length; i++) { const cc = raw.charCodeAt(i); ascii += cc > 0x7f ? "\\u" + cc.toString(16).padStart(4, "0") : raw[i]; }
  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: ascii });
  console.log("PUT ok. nodos:", updated.nodes.length);

  const f = await getFresh();
  const a = f.nodes.find((n) => n.name === "Extraer Modelo Grupo").parameters.text;
  const b = f.nodes.find((n) => n.name === "Responder Articulo Suelto (Grupo - Con Modelo)").parameters.text;
  const c = f.nodes.find((n) => n.name === "Parsear Articulo Suelto (Grupo - Con Modelo)").parameters.jsCode;
  const okA = a.includes("texto_para_dividir");
  const okB = !b.includes("|| $('Unir Mensajes').item.json.texto_completo");
  const okC = c.includes("if (!_textoCli)") && !c.includes("resto_mensaje || $('Unir Mensajes').item.json.texto_completo) || ''");
  console.log((okA && okB && okC) ? "  OK  las 3 ediciones aplicadas. Rollback: " + ROLLBACK : `  FALLA A=${okA} B=${okB} C=${okC}. Rollback: ` + ROLLBACK);
}
main().catch((e) => { console.error(e); process.exit(1); });
