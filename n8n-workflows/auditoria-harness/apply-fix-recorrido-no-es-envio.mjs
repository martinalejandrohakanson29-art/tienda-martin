// "Dividir y Etiquetar Sub-preguntas" (Fase 6) clasifica cualquier mencion a
// "recorrido" como categoria "envio" -- probablemente por asociacion semantica
// con "ruta/trayecto de entrega". Pero en este negocio "recorrido" casi
// siempre es el recorrido del piston del motor (corto/largo, un dato tecnico
// del kit), no tiene nada que ver con envios.
//
// Encontrado revisando en vivo la conv 2120 (+5492302395815): el cliente,
// justo despues de que el bot le dijera que el kit no es compatible con su
// moto, escribio "La verdad con el recorrido / Me mataste" (un comentario sin
// pedir nada, probablemente sobre lo confuso del precio corto/largo). El
// partidor lo etiqueto "envio" y el bot le contesto la politica de envios --
// una respuesta totalmente fuera de tema, justo despues de la mala noticia de
// la compatibilidad.
//
// Fix acotado: se aclara en el bullet de "envio" que tiene que haber mencion
// explicita a entrega/mandar/llegar a algun lado, y que "recorrido" del motor
// nunca cuenta -- un comentario asi sin pedido concreto va a "cierre" u
// "otro". Solo texto de prompt, no toca logica ni conexiones.
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-recorrido-no-es-envio_2026-08-18.json", import.meta.url);

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

  const splitNode = wf.nodes.find((n) => n.name === "Dividir y Etiquetar Sub-preguntas");
  if (!splitNode) throw new Error('No se encontro el nodo "Dividir y Etiquetar Sub-preguntas"');

  let sys = splitNode.parameters.options.systemMessage;

  sys = replaceOnce(
    sys,
    `- "envio": pregunta sobre si hacen envíos, a dónde, cómo, o cuánto tarda.`,
    `- "envio": pregunta sobre si hacen envíos, a dónde, cómo, o cuánto tarda -- tiene que mencionar explícitamente entrega/mandar/llegar a algún lado. OJO: "recorrido" en este negocio es casi siempre el recorrido del pistón del motor (corto/largo, un dato técnico del kit) y NUNCA cuenta como pregunta de envío -- un comentario sobre "el recorrido" sin pedir nada de entrega no es "envio" (va como "cierre" si no pide nada, u "otro" si hay una pregunta técnica real detrás).`,
    "bullet envio"
  );

  splitNode.parameters.options.systemMessage = sys;
  console.log('Prompt de "Dividir y Etiquetar Sub-preguntas" actualizado (aclaracion recorrido != envio).');

  const allowedSettingsKeys = [
    "saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
    "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder",
  ];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => allowedSettingsKeys.includes(k)));

  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: JSON.stringify(body) });
  console.log("Actualizado. Nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const fresh = await api(`/workflows/${WORKFLOW_ID}`);
  const freshSplit = fresh.nodes.find((n) => n.name === "Dividir y Etiquetar Sub-preguntas");
  const ok = freshSplit?.parameters.options.systemMessage.includes('NUNCA cuenta como pregunta de envío');
  console.log('Verificacion "Dividir y Etiquetar Sub-preguntas":', ok ? "OK" : "ALGO NO CUADRA");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
