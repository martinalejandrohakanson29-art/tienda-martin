// Fix: la respuesta de compatibilidad salia muy larga -- usaba el nombre
// completo y tecnico del kit ("combo de TAPA CDI + CILINDRO 120 + corona de
// distribucion de regalo") y, en el camino que evalua el campo `detalle` del
// kit (no el de la tabla `compatibilidades`), la IA agregaba una frase de
// justificacion tipo "El modelo Trip aparece en la lista de 110 chinos de
// recorrido corto compatibles." en vez de una simple confirmacion.
// Encontrado revisando la charla real con +5493794779342 (contacto/conv 1957,
// 2026-08-14): pregunto si el kit andaba en su Guerrero Trip 110 y el bot
// contesto con el parrafo completo de arriba.
//
// Dos cambios, acotados:
// 1. "Preparar Respuesta Compatibilidad": deja de usar el nombre completo del
//    kit, ahora dice simplemente "el kit".
// 2. "Evaluar Compatibilidad desde Detalle": el prompt ahora pide que el
//    campo `detalle` sea una aclaracion practica y muy corta (ej. "para
//    recorrido corto") cuando haga falta, nunca una explicacion del motivo
//    ("aparece en la lista de...", "pertenece al grupo de...").
//
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-simplificar-respuesta-compatibilidad_2026-08-14.json", import.meta.url);

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

const OLD_ASSIGNMENT_VALUE = "={{ ($json.compatible ? ('Sí, el ' + $('Parsear Pregunta Compatibilidad').item.json.kit_nombre + ' es compatible con tu ' + $('Parsear Pregunta Compatibilidad').item.json.modelo_moto + '.') : ('No, el ' + $('Parsear Pregunta Compatibilidad').item.json.kit_nombre + ' no es compatible con tu ' + $('Parsear Pregunta Compatibilidad').item.json.modelo_moto + '.')) + ($json.detalle ? (' ' + $json.detalle) : '') }}";
const NEW_ASSIGNMENT_VALUE = "={{ ($json.compatible ? ('Sí, el kit es compatible con tu ' + $('Parsear Pregunta Compatibilidad').item.json.modelo_moto + '.') : ('No, el kit no es compatible con tu ' + $('Parsear Pregunta Compatibilidad').item.json.modelo_moto + '.')) + ($json.detalle ? (', ' + $json.detalle + '.') : '') }}";

const OLD_DETALLE_INSTRUCCION = '- "detalle": si compatible es true o false, una aclaración corta y útil tomada del texto (ej. la variante que corresponde, una pieza que cambia), o string vacío si no hay nada relevante. Si compatible es null, string vacío.';
const NEW_DETALLE_INSTRUCCION = '- "detalle": si compatible es true o false Y hace falta indicar algo practico (ej. una variante puntual como recorrido corto/largo, una pieza que cambia), una aclaración de pocas palabras tomada del texto, en minúscula y sin punto final (ej. "para recorrido corto"), lista para pegarse despues de la confirmación. NUNCA expliques el motivo ni cites categorías (prohibido: "aparece en la lista de...", "pertenece al grupo de...", "según el detalle..."). Si no hace falta aclarar nada, string vacío. Si compatible es null, string vacío.';

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const prepararNode = wf.nodes.find((n) => n.name === "Preparar Respuesta Compatibilidad");
  if (!prepararNode) throw new Error('No se encontro el nodo "Preparar Respuesta Compatibilidad"');
  const asg = prepararNode.parameters?.assignments?.assignments?.[0];
  if (!asg || asg.value !== OLD_ASSIGNMENT_VALUE) {
    throw new Error('El expression de "Preparar Respuesta Compatibilidad" no es el esperado -- puede que ya se haya tocado. Revisar a mano antes de seguir.');
  }
  asg.value = NEW_ASSIGNMENT_VALUE;
  console.log('Expression de "Preparar Respuesta Compatibilidad" actualizado.');

  const evaluarNode = wf.nodes.find((n) => n.name === "Evaluar Compatibilidad desde Detalle");
  if (!evaluarNode) throw new Error('No se encontro el nodo "Evaluar Compatibilidad desde Detalle"');
  const msg = evaluarNode.parameters?.options?.systemMessage;
  if (!msg || !msg.includes(OLD_DETALLE_INSTRUCCION)) {
    throw new Error('El systemMessage de "Evaluar Compatibilidad desde Detalle" no contiene el texto esperado -- puede que ya se haya tocado. Revisar a mano antes de seguir.');
  }
  evaluarNode.parameters.options.systemMessage = msg.replace(OLD_DETALLE_INSTRUCCION, NEW_DETALLE_INSTRUCCION);
  console.log('Prompt de "Evaluar Compatibilidad desde Detalle" actualizado.');

  const allowedSettingsKeys = [
    "saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
    "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder",
  ];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => allowedSettingsKeys.includes(k)));

  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: JSON.stringify(body) });
  console.log("Actualizado. Nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const fresh = await api(`/workflows/${WORKFLOW_ID}`);
  let ok = true;

  const freshPreparar = fresh.nodes.find((n) => n.name === "Preparar Respuesta Compatibilidad");
  const freshAsg = freshPreparar?.parameters?.assignments?.assignments?.[0];
  const prepararOk = freshAsg?.value === NEW_ASSIGNMENT_VALUE;
  console.log('Verificacion "Preparar Respuesta Compatibilidad":', prepararOk ? "OK" : "ALGO NO CUADRA");
  ok = ok && prepararOk;

  const freshEvaluar = fresh.nodes.find((n) => n.name === "Evaluar Compatibilidad desde Detalle");
  const freshMsg = freshEvaluar?.parameters?.options?.systemMessage || "";
  const evaluarOk = freshMsg.includes(NEW_DETALLE_INSTRUCCION) && !freshMsg.includes(OLD_DETALLE_INSTRUCCION);
  console.log('Verificacion "Evaluar Compatibilidad desde Detalle":', evaluarOk ? "OK" : "ALGO NO CUADRA");
  ok = ok && evaluarOk;

  console.log(ok ? "Fix aplicado correctamente en ambos nodos." : "REVISAR A MANO, algo no quedo como se esperaba.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
