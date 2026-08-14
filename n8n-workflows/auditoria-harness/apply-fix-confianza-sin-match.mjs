// Fix: "Interpretar Respuesta Sin Match" calificaba confianza "baja" incluso
// cuando el equipo daba una respuesta clara, si el mensaje original del
// cliente no estaba redactado como pregunta explicita (caso real: cliente
// dice "tengo un gilera smash, si no me equivoco es recorrido corto", el
// equipo contesta "le va bien a ese modelo" -> la IA marco confianza baja y
// el bot no le mando nada al cliente ni guardo el dato). Se aclara en el
// prompt que el mensaje del cliente es una consulta implicita aunque no
// tenga forma de pregunta, y que "alta" aplica en cuanto el equipo da un
// dato concreto sobre el tema, no solo cuando contesta una pregunta formal.
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-confianza-sin-match_2026-08-13.json", import.meta.url);

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

const NUEVO_SYSTEM_MESSAGE =
  "Sos parte de un sistema que ayuda a un equipo de venta de repuestos de moto a responder preguntas que no supieron ubicar automaticamente. Te paso el mensaje original del cliente (la \"pregunta pendiente\") y la respuesta que acaba de escribir un miembro del equipo, en lenguaje natural y libre.\n\n" +
  "Ojo: el mensaje del cliente muchas veces NO esta redactado como pregunta explicita (ej. \"tengo una tal moto, no se si es compatible\", o directamente cuenta su modelo sin signo de pregunta) — igual es una consulta implicita sobre ese producto o modelo, tratala como tal.\n\n" +
  "Respondé UNICAMENTE con un JSON valido, sin texto adicional, con este formato exacto:\n" +
  "{\"mensaje_cliente\": \"...\", \"confianza\": \"alta\" o \"baja\"}\n\n" +
  "- \"mensaje_cliente\" es un mensaje corto y natural, listo para mandarle al cliente, contando lo que contestó el equipo (nunca inventes datos que el equipo no dijo).\n" +
  "- \"confianza\": \"alta\" si la respuesta del equipo da información concreta y usable sobre el tema del mensaje del cliente (por ejemplo confirma o descarta que ande/sirva/sea compatible, da un dato técnico, aclara la duda), aunque el mensaje del cliente no haya sido una pregunta formal. \"baja\" SOLO si la respuesta del equipo es realmente ambigua, no tiene relación con el tema, o no aporta ningún dato concreto (ej. \"después lo veo\", \"ok\", \"dale\", \"ahora le contesto\") — en ese caso no hace falta completar bien mensaje_cliente.";

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const node = wf.nodes.find((n) => n.name === "Interpretar Respuesta Sin Match");
  if (!node) throw new Error('No se encontro el nodo "Interpretar Respuesta Sin Match"');

  const anterior = node.parameters.options.systemMessage;
  if (anterior === NUEVO_SYSTEM_MESSAGE) {
    console.log("El prompt ya esta actualizado, no hay nada que hacer.");
    return;
  }
  node.parameters.options.systemMessage = NUEVO_SYSTEM_MESSAGE;

  const allowedSettingsKeys = [
    "saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
    "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder",
  ];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => allowedSettingsKeys.includes(k)));

  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: JSON.stringify(body) });
  console.log("Actualizado. Nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const fresh = await api(`/workflows/${WORKFLOW_ID}`);
  const freshNode = fresh.nodes.find((n) => n.name === "Interpretar Respuesta Sin Match");
  console.log("Verificacion GET post-update. Prompt coincide:", freshNode.parameters.options.systemMessage === NUEVO_SYSTEM_MESSAGE);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
