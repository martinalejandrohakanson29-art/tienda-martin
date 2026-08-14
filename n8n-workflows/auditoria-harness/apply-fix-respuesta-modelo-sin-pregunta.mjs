// Fix: cuando hay un kit pineado y el cliente responde a "¿para qué moto lo
// estás buscando?" nombrando directamente el modelo (sin fraseo de pregunta,
// ej. "Tengo una Zanella due 110" / "2025"), el nodo "Extraer Pregunta
// Compatibilidad" marcaba es_compatibilidad=false porque su instrucción exigía
// una pregunta explícita ("¿anda en...?"). Con es_compatibilidad=false, el
// mensaje caía en el partidor de sub-preguntas (Fase 6), que tampoco encuentra
// ninguna "pregunta o pedido" en una simple afirmación -> devuelve partes: []
// -> Separar Pedazos no tiene nada que iterar -> el mensaje se pierde por
// completo, sin respuesta al cliente y sin quedar registrado en ninguna tabla
// de pendientes. Encontrado revisando la charla real con +5493815116333
// (contacto/conv 1965, 2026-08-14): el cliente contestó "Tengo una Zanella
// due 110" + "2025" al saludo del Kit 1 y no recibió nada.
//
// Como todos los mensajes de bienvenida de los kits terminan preguntando
// "¿para qué moto lo estás buscando?", la respuesta más común y esperada NO
// viene en forma de pregunta -- es simplemente el cliente nombrando su moto.
// Fix acotado: se amplía la instrucción de "Extraer Pregunta Compatibilidad"
// para que es_compatibilidad sea true también cuando el cliente simplemente
// menciona/afirma un modelo de moto puntual (respondiendo a esa pregunta),
// no solo cuando lo pregunta explícitamente. Solo texto de prompt, no toca
// lógica ni conexiones -- reutiliza el mismo camino que ya existe
// (compatibilidades -> detalle del kit -> escalado silencioso si no hay dato).
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-respuesta-modelo-sin-pregunta_2026-08-14.json", import.meta.url);

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

const NODE_NAME = "Extraer Pregunta Compatibilidad";
const OLD_TEXT = "es_compatibilidad debe ser true SOLO si la pregunta es explicitamente sobre si el kit anda/sirve/entra/es compatible con una moto puntual. Cualquier otra cosa (precio, envio, saludo, agradecimiento, u otro tema) es false.";
const NEW_TEXT = "es_compatibilidad debe ser true si la pregunta es explicitamente sobre si el kit anda/sirve/entra/es compatible con una moto puntual, O si el cliente simplemente menciona/afirma un modelo de moto puntual como respuesta (sin forma de pregunta) -- nuestros mensajes de kit siempre terminan preguntando \"¿para qué moto lo estás buscando?\", así que la gran mayoría de las respuestas del cliente son solo el modelo de la moto, sin signos de pregunta, y eso también cuenta como pregunta de compatibilidad. Cualquier otra cosa (precio, envio, saludo, agradecimiento, u otro tema sin ningún modelo de moto mencionado) es false.";

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const node = wf.nodes.find((n) => n.name === NODE_NAME);
  if (!node) throw new Error(`No se encontro el nodo "${NODE_NAME}"`);
  const msg = node.parameters.options?.systemMessage;
  if (!msg || !msg.includes(OLD_TEXT)) {
    throw new Error(`El systemMessage de "${NODE_NAME}" no contiene el texto esperado -- puede que ya se haya tocado. Revisar a mano antes de seguir.`);
  }
  node.parameters.options.systemMessage = msg.replace(OLD_TEXT, NEW_TEXT);
  console.log(`Prompt de "${NODE_NAME}" actualizado.`);

  const allowedSettingsKeys = [
    "saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
    "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder",
  ];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => allowedSettingsKeys.includes(k)));

  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: JSON.stringify(body) });
  console.log("Actualizado. Nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const fresh = await api(`/workflows/${WORKFLOW_ID}`);
  const freshNode = fresh.nodes.find((n) => n.name === NODE_NAME);
  const freshMsg = freshNode?.parameters.options?.systemMessage || "";
  const ok = freshMsg.includes(NEW_TEXT) && !freshMsg.includes(OLD_TEXT);
  console.log(`Verificacion "${NODE_NAME}":`, ok ? "OK" : "ALGO NO CUADRA - revisar a mano");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
