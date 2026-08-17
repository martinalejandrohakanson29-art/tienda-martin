// Segunda parte del fix de "Extraer Pregunta Compatibilidad" -- ver
// apply-fix-modelo-moto-cilindrada-generica.mjs (mismo dia, aplicado primero).
// Validando el primer fix con la conversacion de prueba (conv 1, Kit 8
// pineado, mensaje "Vienen listos para instalar en un motor 110" -- el mismo
// texto real del caso conv 2007) aparecio una regresion: con modelo_moto
// vacio, "¿Es Compatibilidad Con Modelo?" toma la rama FALSE y el mensaje va
// al partidor de sub-preguntas (Fase 6) -- pero el nodo tambien dejaba
// resto_mensaje vacio (regla vieja: "si el mensaje completo es solamente
// sobre la compatibilidad, dejalo vacio"), asi que el partidor no tenia nada
// que procesar (`partes: []`) y el mensaje desaparecia sin dejar rastro, ni
// en preguntas_tecnicas_pendientes ni en preguntas_sin_match_pendientes.
// Confirmado con la ejecucion real 76677 y consultando ambas tablas para
// conversation_id 1: nada nuevo se creo.
// Es exactamente el patron de bug ya documentado como grave en
// CHATWOOT-BOT-CONTEXTO.md (fix "respuesta con solo el modelo de moto, sin
// forma de pregunta", 2026-08-14): mejor escalar en silencio que perder el
// mensaje del todo.
// Fix acotado: cuando modelo_moto queda vacio especificamente por ser SOLO
// cilindrada/tipo de motor generico, resto_mensaje ya NO se vacia -- queda
// igual al mensaje completo, para que el partidor de sub-preguntas lo pueda
// tomar (cae en categoria "otro", que desde el fix del 14/8 ya mira primero
// el `detalle` del kit pineado antes de escalar -- en el caso real del Kit 8
// eso alcanza para autocontestar "es para 110 chinos de recorrido corto",
// y si no alcanza, escala visible a preguntas_sin_match_pendientes en vez de
// perderse). Sigue siendo solo texto de prompt, no toca logica ni conexiones
// -- la resolucion real la hace el pipeline que ya existe.
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-modelo-moto-cilindrada-generica-2_2026-08-16.json", import.meta.url);

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

const OLD =
  'resto_mensaje: copiá el mensaje del cliente TAL CUAL lo escribio, pero sacando UNICAMENTE la frase/oracion puntual que pregunta por la compatibilidad -- dejá el resto del texto sin modificar, palabra por palabra, no resumas ni reformules ni agregues nada. Si es_compatibilidad es false, o si el mensaje completo es solamente sobre la compatibilidad y no queda nada mas, dejalo como string vacio "". Nunca inventes contenido que el cliente no escribio.';

const NEW =
  'resto_mensaje: copiá el mensaje del cliente TAL CUAL lo escribio, pero sacando UNICAMENTE la frase/oracion puntual que pregunta por la compatibilidad -- dejá el resto del texto sin modificar, palabra por palabra, no resumas ni reformules ni agregues nada. Si es_compatibilidad es false, o si el mensaje completo es solamente sobre la compatibilidad y no queda nada mas, dejalo como string vacio "". EXCEPCION: si modelo_moto quedo vacio especificamente porque el cliente solo menciono cilindrada/tipo de motor generico (sin marca ni modelo puntual, ver regla de modelo_moto arriba), NO vacies resto_mensaje -- dejalo igual al mensaje completo tal cual lo escribio el cliente, para que esa pregunta se pueda seguir resolviendo por otro camino en vez de perderse. Nunca inventes contenido que el cliente no escribio.';

const NODE_NAME = "Extraer Pregunta Compatibilidad";

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const node = wf.nodes.find((n) => n.name === NODE_NAME);
  if (!node) throw new Error(`No se encontro el nodo "${NODE_NAME}"`);
  const msg = node.parameters.options?.systemMessage;
  if (!msg || !msg.includes(OLD)) {
    throw new Error(`El systemMessage de "${NODE_NAME}" no contiene el texto esperado -- puede que ya se haya tocado. Revisar a mano antes de seguir.`);
  }
  node.parameters.options.systemMessage = msg.replace(OLD, NEW);
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
  const ok = freshMsg.includes(NEW) && !freshMsg.includes(OLD);
  console.log(`Verificacion "${NODE_NAME}":`, ok ? "OK" : "ALGO NO CUADRA");
  console.log(ok ? "Fix aplicado correctamente." : "REVISAR A MANO, algo no quedo como se esperaba.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
