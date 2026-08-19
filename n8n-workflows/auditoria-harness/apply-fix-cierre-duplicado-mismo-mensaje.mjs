// "Armar Mensajes" (Fase 6) junta todos los pedazos resueltos de una rafaga en
// mensaje1/mensaje2 sin deduplicar texto identico. Si el partidor de
// sub-preguntas separa una rafaga larga en varios pedazos y dos (o mas) caen
// en la misma categoria "cierre" -- que siempre resuelve al mismo texto fijo
// "Dale, cualquier cosa nos escribis." -- cada pedazo se resuelve por
// separado y terminan pegados uno atras del otro en el mismo mensaje.
//
// Encontrado revisando en vivo la conv 2160 (+5493644131890, ejecucion
// 78868): un audio largo transcripto ("Si, si, meta, meta, dale, dale...
// cualquier cosa te escribo, o sea, que se pueda hacer en dos cuotas...")
// se partio en 4 pedazos, 2 de ellos "cierre". El cliente recibio
// "Dale, cualquier cosa nos escribis.\n\nDale, cualquier cosa nos escribis."
// pegado en un solo mensaje (msg 13820).
//
// Fix acotado: en "Armar Mensajes", antes de juntar los pedazos resueltos en
// mensaje1/mensaje2 (ya ordenados por prioridad de categoria), se descartan
// los que tengan el mismo texto exacto que uno anterior -- se queda con la
// primera aparicion. No toca clasificacion ni ningun prompt de IA, solo el
// paso final de armado de mensajes.
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-cierre-duplicado-mismo-mensaje_2026-08-19.json", import.meta.url);

async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    console.error("ERROR", res.status, JSON.stringify(body, null, 2));
    throw new Error(`API ${path} devolvio ${res.status}`);
  }
  return body;
}

function replaceOnce(text, oldStr, newStr, label) {
  if (!text.includes(oldStr)) {
    throw new Error(`No se encontro el texto esperado para "${label}" -- puede que ya se haya tocado. Revisar a mano antes de seguir.`);
  }
  return text.replace(oldStr, newStr);
}

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const armarNode = wf.nodes.find((n) => n.name === "Armar Mensajes");
  if (!armarNode) throw new Error('No se encontro el nodo "Armar Mensajes"');

  let code = armarNode.parameters.jsCode;

  code = replaceOnce(
    code,
    `const resueltas = piezas.filter((p) => p.resuelto && p.mensaje)
  .sort((a, b) => (prioridad[a.categoria] ?? 9) - (prioridad[b.categoria] ?? 9));`,
    `const vistos = new Set();
const resueltas = piezas.filter((p) => p.resuelto && p.mensaje)
  .sort((a, b) => (prioridad[a.categoria] ?? 9) - (prioridad[b.categoria] ?? 9))
  .filter((p) => {
    if (vistos.has(p.mensaje)) return false;
    vistos.add(p.mensaje);
    return true;
  });`,
    "dedup resueltas"
  );

  armarNode.parameters.jsCode = code;
  console.log('Nodo "Armar Mensajes" actualizado (dedup de mensajes identicos antes de armar mensaje1/mensaje2).');

  const allowedSettingsKeys = [
    "saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
    "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder",
  ];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => allowedSettingsKeys.includes(k)));

  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: JSON.stringify(body) });
  console.log("Actualizado. Nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const fresh = await api(`/workflows/${WORKFLOW_ID}`);
  const freshArmar = fresh.nodes.find((n) => n.name === "Armar Mensajes");
  const ok = freshArmar?.parameters.jsCode.includes("if (vistos.has(p.mensaje)) return false;");
  console.log('Verificacion "Armar Mensajes":', ok ? "OK" : "ALGO NO CUADRA");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
