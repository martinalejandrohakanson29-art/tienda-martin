// Agrega una categoria nueva "cierre" al partidor de sub-preguntas (Fase 6)
// para comentarios/afirmaciones del cliente que no piden nada ni necesitan
// un dato del negocio -- hoy caen igual en "otro", no encuentran dato, y
// escalan al equipo con una nota que asume (mal) que hubo una pregunta.
//
// Encontrado auditando en vivo dos conversaciones reales el mismo dia
// (+5493513792356 conv 2104: "A la tarde me llego"; +5493516222737 conv
// 2108: "Bueno hermano tengo que dejarte una seña Para que melo guardes").
// Charlado con Martin: en vez de tocar la nota de escalado (fix mas chico,
// pendiente), la idea es cortar antes -- si es un comentario de cierre sin
// nada para resolver, contestar directo con un cierre corto y no escalar
// nada. A proposito NO incluye intenciones de pago/reserva/retiro (esas
// siguen escalando como "otro", porque ahi si puede hacer falta una accion
// nuestra) -- limite confirmado explicitamente con Martin.
//
// Dos cambios, ambos reusan el pipeline existente sin agregar nodos:
// 1. "Dividir y Etiquetar Sub-preguntas" (agente IA): se agrega "cierre" a
//    la lista cerrada de categorias, con la definicion y la exclusion de
//    intenciones de pago/reserva.
// 2. "Consolidar Dato Resuelto" (Code node): rama nueva para categoria
//    "cierre" que usa un texto fijo ("Dale, cualquier cosa nos escribis.")
//    sin buscar nada -- sigue el mismo camino de redaccion/envio de siempre,
//    nunca escala.
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-feat-categoria-cierre_2026-08-18.json", import.meta.url);

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

  // --- Cambio 1: "Dividir y Etiquetar Sub-preguntas" ---
  const splitNode = wf.nodes.find((n) => n.name === "Dividir y Etiquetar Sub-preguntas");
  if (!splitNode) throw new Error('No se encontro el nodo "Dividir y Etiquetar Sub-preguntas"');

  let prompt = splitNode.parameters.text ?? splitNode.parameters.options.systemMessage;
  let sys = splitNode.parameters.options.systemMessage;

  sys = replaceOnce(
    sys,
    `Analiza el mensaje del cliente y dividilo en las preguntas o pedidos distintos que contiene (puede ser uno solo). Para cada uno, asigná una categoría de esta lista cerrada: "precio", "envio", "negocio", "otro".`,
    `Analiza el mensaje del cliente y dividilo en las partes distintas que contiene (puede ser una sola, o ninguna si es solo un comentario de cierre sin nada para resolver -- ver la categoría "cierre" abajo). Para cada parte, asigná una categoría de esta lista cerrada: "precio", "envio", "negocio", "cierre", "otro".`,
    "intro"
  );

  sys = replaceOnce(
    sys,
    `- "negocio": pregunta sobre el negocio en general -- ubicación, horarios, medios de pago, garantía.\n- "otro": cualquier otra cosa, incluida cualquier pregunta sobre un producto o repuesto específico que no sea el kit ya identificado en la charla.`,
    `- "negocio": pregunta sobre el negocio en general -- ubicación, horarios, medios de pago, garantía.\n- "cierre": comentario o afirmación del cliente que NO pide nada ni necesita un dato del negocio para responder -- típicamente sobre algo que el cliente mismo va a hacer o ya pasó, sin ninguna acción pendiente de nuestro lado (ej. "me llegó", "la semana que viene les aviso", "más tarde veo", "dale", "genial", "gracias", "ok perfecto"). OJO: si el comentario expresa una intención que sí necesita una respuesta o acción nuestra (ej. "te dejo una seña", "quiero reservarlo", "paso a buscarlo mañana", cualquier cosa sobre pagar/reservar/retirar), eso NO es "cierre" -- va como "otro".\n- "otro": cualquier otra cosa, incluida cualquier pregunta sobre un producto o repuesto específico que no sea el kit ya identificado en la charla.`,
    "bullet cierre"
  );

  sys = replaceOnce(
    sys,
    `Ante la duda entre una categoría y "otro", usá "otro" -- nunca inventes ni asumas.`,
    `Ante la duda entre una categoría y "otro", usá "otro" -- nunca inventes ni asumas. "cierre" en particular usalo solo si estás realmente seguro de que no hace falta ninguna respuesta con datos -- ante cualquier duda, "otro".`,
    "ante la duda"
  );

  sys = replaceOnce(
    sys,
    `{"partes": [{"texto": "...", "categoria": "precio|envio|negocio|otro"}]}`,
    `{"partes": [{"texto": "...", "categoria": "precio|envio|negocio|cierre|otro"}]}`,
    "formato json"
  );

  splitNode.parameters.options.systemMessage = sys;
  console.log('Prompt de "Dividir y Etiquetar Sub-preguntas" actualizado (categoria "cierre" agregada).');

  // --- Cambio 2: "Consolidar Dato Resuelto" ---
  const consolidarNode = wf.nodes.find((n) => n.name === "Consolidar Dato Resuelto");
  if (!consolidarNode) throw new Error('No se encontro el nodo "Consolidar Dato Resuelto"');

  const oldCode = `} else if (categoria === 'negocio') {
  const r = $('Buscar Info Negocio (Negocio)').item.json;
  if (r && r.respuesta != null) dato = r.respuesta;
} else {`;
  const newCode = `} else if (categoria === 'negocio') {
  const r = $('Buscar Info Negocio (Negocio)').item.json;
  if (r && r.respuesta != null) dato = r.respuesta;
} else if (categoria === 'cierre') {
  dato = 'Dale, cualquier cosa nos escribís.';
} else {`;

  consolidarNode.parameters.jsCode = replaceOnce(consolidarNode.parameters.jsCode, oldCode, newCode, "rama cierre en Consolidar Dato Resuelto");
  console.log('Code de "Consolidar Dato Resuelto" actualizado (rama "cierre" agregada).');

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
  const freshConsolidar = fresh.nodes.find((n) => n.name === "Consolidar Dato Resuelto");
  const ok1 = freshSplit?.parameters.options.systemMessage.includes('"cierre"');
  const ok2 = freshConsolidar?.parameters.jsCode.includes("categoria === 'cierre'");
  console.log('Verificacion "Dividir y Etiquetar Sub-preguntas":', ok1 ? "OK" : "ALGO NO CUADRA");
  console.log('Verificacion "Consolidar Dato Resuelto":', ok2 ? "OK" : "ALGO NO CUADRA");
  console.log(ok1 && ok2 ? "Fix aplicado correctamente en los dos nodos." : "REVISAR A MANO, algo no quedo como se esperaba.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
