// Evita que "Identificar Necesidad" clasifique reacciones cortas a mitad de
// charla ("genial", "dale", "gracias") como "saludo" -- lo que dispara
// "Enviar Saludo Generico" y le manda al cliente un "Hola bro! En que te
// podemos ayudar?" como si el bot se hubiera olvidado de toda la charla.
//
// Encontrado probando en produccion (conv 1, telefono sintetico
// +5493500011122) el caso paralelo a la conv real 2104 (+5493513792356):
// ahi el cliente dijo "A la tarde me llego" despues de que el bot le
// resolviera una pregunta sobre cubiertas -- eso cae en "Dividir y Etiquetar
// Sub-preguntas" (bug distinto, nota interna enganiosa, sin tocar todavia).
// Pero reproduciendo la misma secuencia con "genial" en vez de esa frase,
// "Identificar Necesidad" lo clasifico "tipo: saludo" (su definicion es
// "interes generico sin pedido concreto", y una reaccion corta encaja ahi
// aunque la charla ya este en curso) y el bot le reenvio al cliente real el
// saludo generico de nuevo -- rompiendo la regla ya arreglada el 2026-08-14
// ("Fix saludo a mitad de charla") en los otros 3 nodos de IA del workflow.
// "Identificar Necesidad" se creo despues (17/8) y nunca heredo esa regla.
//
// Fix acotado: se agrega al bullet "saludo" del prompt la aclaracion de que
// solo aplica si es el primer mensaje real de la charla (historial vacio o
// sin ningun "Nosotros:" todavia) -- con charla ya en curso, una reaccion
// corta sin pedido nuevo pasa a "ninguno" (sigue el camino normal del
// partidor de sub-preguntas, que en el peor caso escala en silencio, nunca
// le manda nada raro al cliente). Solo texto de prompt, no toca logica ni
// conexiones ni el resto de los bullets.
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-saludo-identificar-necesidad_2026-08-18.json", import.meta.url);

const NODE_NAME = "Identificar Necesidad";

const OLD_BULLET = `- "saludo": interés genérico sin pedido concreto (ej. "quiero mas informacion", "me interesa", un mensaje de un clic en un anuncio que no menciona ningún producto puntual, aunque tenga palabras sueltas de metadata como "Enlace:"). kit_id: null, candidatos: [], mensaje: "".`;

const NEW_BULLET = `- "saludo": interés genérico sin pedido concreto (ej. "quiero mas informacion", "me interesa", un mensaje de un clic en un anuncio que no menciona ningún producto puntual, aunque tenga palabras sueltas de metadata como "Enlace:"). Esto SOLO aplica si es el primer mensaje real de la charla (el historial está vacío o no tiene ningún "Nosotros:" todavía) -- si la charla ya está en curso (ya hay mensajes nuestros en el historial), una reacción corta del cliente sin pedido nuevo (ej. "genial", "dale", "gracias", "buenísimo", "ok") NUNCA es "saludo", es "ninguno" -- no hay que volver a saludar a mitad de charla. kit_id: null, candidatos: [], mensaje: "".`;

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

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const node = wf.nodes.find((n) => n.name === NODE_NAME);
  if (!node) throw new Error(`No se encontro el nodo "${NODE_NAME}"`);

  const current = node.parameters.options.systemMessage;
  if (!current.includes(OLD_BULLET)) {
    throw new Error(`El bullet "saludo" de "${NODE_NAME}" no coincide con lo esperado -- puede que ya se haya tocado. Revisar a mano antes de seguir.`);
  }
  node.parameters.options.systemMessage = current.replace(OLD_BULLET, NEW_BULLET);
  console.log(`Prompt de "${NODE_NAME}" actualizado (bullet "saludo").`);

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
  const ok = freshNode?.parameters.options.systemMessage.includes(NEW_BULLET);
  console.log(`Verificacion "${NODE_NAME}":`, ok ? "OK" : "ALGO NO CUADRA");
  console.log(ok ? "Fix aplicado correctamente." : "REVISAR A MANO, algo no quedo como se esperaba.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
