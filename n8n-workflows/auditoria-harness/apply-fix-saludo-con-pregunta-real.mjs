// "Identificar Necesidad" clasifica cualquier mensaje que arranca con "Hola" y
// no menciona ningun kit como tipo "saludo" -- incluso cuando el mensaje trae
// una pregunta real y concreta de negocio (que el propio prompt, en su bullet
// de "ninguno", ya dice que deberia cubrir: "producto, precio, compatibilidad,
// envio, negocio").
//
// Encontrado revisando en vivo la conv 2151 (+5492954878893, contacto Lucca):
// primer mensaje de la charla, sin kit pineado: "Hola de donde son" + "?" en
// la misma rafaga. Identificar Necesidad devolvio tipo "saludo" y el bot
// contesto el saludo generico fijo ("Hola bro! En que te podemos ayudar?") en
// vez de responder de donde son -- dato que ya esta cargado en info_negocio
// (tema "ubicacion") y se contesta solo por el camino de "ninguno" ->
// Preparar Contexto Sub-preguntas -> Fase 6, categoria "negocio". La respuesta
// generica encima quedo en cola y salio 82 minutos despues, sin que el cliente
// haya recibido nunca una respuesta real.
//
// Fix acotado: se aclara el bullet de "saludo" para que una pregunta concreta
// y respondible (aunque el mensaje arranque con "Hola" y sea el primer
// mensaje de la charla) NUNCA sea "saludo" -- es "ninguno", con el ejemplo
// real como caso mal->bien. Solo texto de prompt, no toca logica ni
// conexiones. Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-saludo-con-pregunta-real_2026-08-19.json", import.meta.url);

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

  const node = wf.nodes.find((n) => n.name === "Identificar Necesidad");
  if (!node) throw new Error('No se encontro el nodo "Identificar Necesidad"');

  let sys = node.parameters.options.systemMessage;

  sys = replaceOnce(
    sys,
    `- "saludo": interés genérico sin pedido concreto (ej. "quiero mas informacion", "me interesa", un mensaje de un clic en un anuncio que no menciona ningún producto puntual, aunque tenga palabras sueltas de metadata como "Enlace:"). Esto SOLO aplica si es el primer mensaje real de la charla (el historial está vacío o no tiene ningún "Nosotros:" todavía) -- si la charla ya está en curso (ya hay mensajes nuestros en el historial), una reacción corta del cliente sin pedido nuevo (ej. "genial", "dale", "gracias", "buenísimo", "ok") NUNCA es "saludo", es "ninguno" -- no hay que volver a saludar a mitad de charla. kit_id: null, candidatos: [], mensaje: "".`,
    `- "saludo": interés genérico sin pedido concreto (ej. "quiero mas informacion", "me interesa", un mensaje de un clic en un anuncio que no menciona ningún producto puntual, aunque tenga palabras sueltas de metadata como "Enlace:"). Esto SOLO aplica si es el primer mensaje real de la charla (el historial está vacío o no tiene ningún "Nosotros:" todavía) -- si la charla ya está en curso (ya hay mensajes nuestros en el historial), una reacción corta del cliente sin pedido nuevo (ej. "genial", "dale", "gracias", "buenísimo", "ok") NUNCA es "saludo", es "ninguno" -- no hay que volver a saludar a mitad de charla. kit_id: null, candidatos: [], mensaje: "". OJO: si el mensaje, aunque arranque con "Hola" y sea el primer mensaje de la charla, trae ADEMÁS una pregunta concreta y respondible (de negocio, precio, envío, compatibilidad, lo que sea -- no hace falta que mencione un kit), NUNCA es "saludo" -- es "ninguno", porque hay algo puntual que contestar. Ejemplo real: "Hola de donde son" NO es "saludo" (pregunta la ubicación, un dato de negocio) -- es "ninguno". Solo es "saludo" cuando, sacando el saludo en sí, no queda ninguna pregunta ni pedido real.`,
    "bullet saludo"
  );

  node.parameters.options.systemMessage = sys;
  console.log('Prompt de "Identificar Necesidad" actualizado (saludo con pregunta real -> ninguno).');

  const allowedSettingsKeys = [
    "saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
    "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder",
  ];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => allowedSettingsKeys.includes(k)));

  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: JSON.stringify(body) });
  console.log("Actualizado. Nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const fresh = await api(`/workflows/${WORKFLOW_ID}`);
  const freshNode = fresh.nodes.find((n) => n.name === "Identificar Necesidad");
  const ok = freshNode?.parameters.options.systemMessage.includes('Ejemplo real: "Hola de donde son"');
  console.log('Verificacion "Identificar Necesidad":', ok ? "OK" : "ALGO NO CUADRA");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
