// Fix: el resto tras resolver la variante va directo a la maquina de sub-preguntas
// (2026-09-02) -- ya no re-corre el bloque de compat/identificacion
// ---------------------------------------------------------------------------
// Probando el fix anterior (resto-variante-no-reescala) se vio que la rama
// `¿Hay Resto Para Resolver? (Variante)` [true] reinicia TODO el pipeline de
// "entender la conversacion" (Leer Kit Pineado -> Detectar Interes -> Identificar
// Necesidad -> Extraer Pregunta Compatibilidad -> ...) con el texto COMPLETO de
// la rafaga. Con "Recorrido corto es" pegado, `Identificar Necesidad` /
// `Extraer Pregunta Compatibilidad` lo toman como moto/kit y mandan mensajes
// espurios al cliente ("Si, el kit es compatible con tu Recorrido corto",
// "Que marca y modelo es tu moto?"). Aparecio en 3 de 4 rafagas de prueba.
//
// Fix (2 ediciones, 0 nodos nuevos):
//  1. Rewire: `¿Hay Resto Para Resolver? (Variante)` [true]:
//       Leer Kit Pineado  ->  Traer Ultimo Mensaje Nuestro
//     (la "puerta de entrada" a la maquina de sub-preguntas -- ya le entran otras
//      5 ramas). Se saltea compat/identificacion, que no aplica: el kit ya esta
//      resuelto y pineado.
//  2. `Preparar Contexto Sub-preguntas`: como ya no corre el 2do `Parsear Kit
//     Pineado`, el kit_id sale ahora de `Parsear Resolver Variante` (pack_id).
//
// Tradeoff aceptado: el pedazo pegado ya no pasa por `Detectar Interes de Compra`
// (pausa por "lo quiero"). El prompt de `Dividir y Etiquetar` igual manda
// pago/reserva -> "otro" -> escala al equipo.
//
// Uso: node apply-fix-resto-variante-saltea-reloop.mjs [--dry]
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
  writeFileSync(new URL("./workflow_backup_pre-fix-resto-variante-saltea-reloop_2026-09-02.json", OUT_DIR), JSON.stringify(wf, null, 0));
  const ROLLBACK = wf.versionId;

  // --- 1. Rewire ---
  const conn = wf.connections["¿Hay Resto Para Resolver? (Variante)"];
  const t = conn.main[0];
  if (!(t.length === 1 && t[0].node === "Leer Kit Pineado")) throw new Error("rama true inesperada: " + JSON.stringify(t));
  if (!wf.nodes.find((n) => n.name === "Traer Ultimo Mensaje Nuestro")) throw new Error("falta 'Traer Ultimo Mensaje Nuestro'");
  t[0] = { node: "Traer Ultimo Mensaje Nuestro", type: "main", index: 0 };
  console.log("\n1. rewire OK -> ", JSON.stringify(conn.main[0]));

  // --- 2. Preparar Contexto Sub-preguntas: kit_id desde Parsear Resolver Variante ---
  const pc = node(wf, "Preparar Contexto Sub-preguntas");
  pc.parameters.jsCode = rep(pc.parameters.jsCode,
    "  if (k && k.kit_id) { kitId = k.kit_id; kitNombre = k.kit_nombre || null; }\n} catch (e) {}",
    "  if (k && k.kit_id) { kitId = k.kit_id; kitNombre = k.kit_nombre || null; }\n} catch (e) {}\n" +
    "\n" +
    "// 2026-09-02: si venimos del camino \"resto tras resolver la variante\", salteamos el\n" +
    "// 2do Parsear Kit Pineado -- el kit es el pack recien pineado.\n" +
    "if (!kitId) {\n" +
    "  try {\n" +
    "    const pv = $('Parsear Resolver Variante').item.json;\n" +
    "    if (pv && pv.pack_id) { kitId = pv.pack_id; kitNombre = pv.pack_nombre || null; }\n" +
    "  } catch (e) {}\n" +
    "}");
  console.log("\n2. Preparar Contexto (kitId block):");
  console.log(pc.parameters.jsCode.split("let kitRecienConfirmado")[0]);
  if (DRY) { console.log("\n[DRY] rollback:", ROLLBACK); return; }

  const sk = ["saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder"];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => sk.includes(k)));
  const raw = JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings });
  let ascii = ""; for (let i = 0; i < raw.length; i++) { const cc = raw.charCodeAt(i); ascii += cc > 0x7f ? "\\u" + cc.toString(16).padStart(4, "0") : raw[i]; }
  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: ascii });
  console.log("PUT ok. nodos:", updated.nodes.length);

  const f = await getFresh(459);
  const ok1 = JSON.stringify(f.connections["¿Hay Resto Para Resolver? (Variante)"].main[0]) === JSON.stringify([{ node: "Traer Ultimo Mensaje Nuestro", type: "main", index: 0 }]);
  const ok2 = node(f, "Preparar Contexto Sub-preguntas").parameters.jsCode.includes("Parsear Resolver Variante').item.json;\n    if (pv && pv.pack_id)");
  console.log((ok1 && ok2) ? "  OK  aplicado. Rollback: " + ROLLBACK : `  FALLA 1=${ok1} 2=${ok2}. Rollback: ` + ROLLBACK);
}
main().catch((e) => { console.error(e); process.exit(1); });
