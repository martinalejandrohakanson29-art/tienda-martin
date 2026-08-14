// Fix: la rama "precio" de "Consolidar Dato Resuelto" (Fase 6) le pegaba el
// campo `detalle` completo del kit atras del precio, sin que el cliente lo
// haya pedido. `detalle` es la ficha tecnica/compatibilidad, pensada para
// otras preguntas -- no para "cuanto sale". Encontrado revisando la charla
// con +5493547624346 (contacto 1946): pregunto "el precio" y el bot mando un
// parrafo entero con specs tecnicas, y en el caso del Kit 8 el detalle
// llevaba escrito "indica al cliente que confirme..." -> el redactor de IA
// lo respeto al pie de la letra y termino preguntandole al cliente, algo que
// rompe la regla de "nunca re-preguntar, escalar en su lugar".
// Fix acotado: la rama "precio" usa unicamente `r.precio`, igual que las
// otras tres ramas (envio/negocio/otro) ya usan un solo campo cada una.
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-precio-sin-detalle_2026-08-14.json", import.meta.url);

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

const OLD_LINE = "if (r && r.precio != null) dato = 'Precio: ' + r.precio + (r.detalle ? ('. Detalle: ' + r.detalle) : '');";
const NEW_LINE = "if (r && r.precio != null) dato = 'Precio: ' + r.precio;";

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const node = wf.nodes.find((n) => n.name === "Consolidar Dato Resuelto");
  if (!node) throw new Error('No se encontro el nodo "Consolidar Dato Resuelto"');

  const code = node.parameters.jsCode;
  if (!code.includes(OLD_LINE)) {
    throw new Error("El jsCode no contiene la linea esperada -- puede que ya se haya tocado este nodo. Revisar a mano antes de seguir.");
  }
  node.parameters.jsCode = code.replace(OLD_LINE, NEW_LINE);

  const allowedSettingsKeys = [
    "saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
    "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder",
  ];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => allowedSettingsKeys.includes(k)));

  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: JSON.stringify(body) });
  console.log("Actualizado. Nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const fresh = await api(`/workflows/${WORKFLOW_ID}`);
  const freshNode = fresh.nodes.find((n) => n.name === "Consolidar Dato Resuelto");
  const ok = freshNode && freshNode.parameters.jsCode.includes(NEW_LINE) && !freshNode.parameters.jsCode.includes(OLD_LINE);
  console.log("Verificacion GET post-update:", ok ? "OK, el fix quedo aplicado" : "ALGO NO CUADRA, revisar a mano");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
