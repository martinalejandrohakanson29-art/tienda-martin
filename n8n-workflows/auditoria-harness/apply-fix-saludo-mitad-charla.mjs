// Fix: tres nodos de IA que redactan respuestas para el cliente a mitad de
// una charla ya arrancada (nunca son el primer mensaje de la conversacion)
// arrancaban a veces con "¡Hola!" -- DeepSeek lo agrega por costumbre propia,
// nada en el prompt se lo pide ni se lo prohibe. Se ve raro/robotico saludar
// de nuevo cuando ya se viene hablando.
// Nodos afectados: "Redactar Respuesta desde Dato" (Fase 6, camino directo),
// "Interpretar Respuesta Sin Match" (Fase 7) e "Interpretar Respuesta Equipo"
// (Fase 3, compatibilidad) -- mismo patron de prompt en los tres.
// Encontrado revisando la charla real con +5492604824863 (2026-08-14): el
// cliente confirmo "SII si es recorrido corto" y el bot conteso sobre envios
// arrancando con "¡Hola! Si, tenemos envio gratis..."; despues, tras escalar
// "Yo soy de san Rafael Mendoza" y el equipo contestar, el bot le mando
// "¡Hola! Te contamos que realizamos envios a todo el pais..." -- info
// correcta, pero saludando de nuevo en medio de la charla.
// Solo texto de prompt, no toca logica ni conexiones.
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-saludo-mitad-charla_2026-08-14.json", import.meta.url);

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

const NO_SALUDO = " No saludes (nada de \"¡Hola!\" ni similares) -- esta charla ya está en curso, arrancá directo con la respuesta.";

const FIXES = [
  {
    nodeName: "Redactar Respuesta desde Dato",
    old: 'Si hay un dato real, respondé solamente el mensaje final en texto plano, sin JSON, sin comillas, sin explicaciones.',
    new: 'Si hay un dato real, respondé solamente el mensaje final en texto plano, sin JSON, sin comillas, sin explicaciones.' + NO_SALUDO,
  },
  {
    nodeName: "Interpretar Respuesta Sin Match",
    old: '"baja" SOLO si la respuesta del equipo es realmente ambigua, no tiene relación con el tema, o no aporta ningún dato concreto (ej. "después lo veo", "ok", "dale", "ahora le contesto") — en ese caso no hace falta completar bien mensaje_cliente.',
    new: '"baja" SOLO si la respuesta del equipo es realmente ambigua, no tiene relación con el tema, o no aporta ningún dato concreto (ej. "después lo veo", "ok", "dale", "ahora le contesto") — en ese caso no hace falta completar bien mensaje_cliente.' + NO_SALUDO,
  },
  {
    nodeName: "Interpretar Respuesta Equipo",
    old: '"confianza": "alta" SOLO si quedo claro a que pregunta responde Y si es compatible o no. Cualquier otra situacion (ambiguo, no es realmente una respuesta tecnica, etc.) es "baja" — en ese caso no hace falta completar bien los demas campos.',
    new: '"confianza": "alta" SOLO si quedo claro a que pregunta responde Y si es compatible o no. Cualquier otra situacion (ambiguo, no es realmente una respuesta tecnica, etc.) es "baja" — en ese caso no hace falta completar bien los demas campos.' + NO_SALUDO,
  },
];

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  for (const fix of FIXES) {
    const node = wf.nodes.find((n) => n.name === fix.nodeName);
    if (!node) throw new Error(`No se encontro el nodo "${fix.nodeName}"`);
    const msg = node.parameters.options?.systemMessage;
    if (!msg || !msg.includes(fix.old)) {
      throw new Error(`El systemMessage de "${fix.nodeName}" no contiene el texto esperado -- puede que ya se haya tocado. Revisar a mano antes de seguir.`);
    }
    node.parameters.options.systemMessage = msg.replace(fix.old, fix.new);
    console.log(`Prompt de "${fix.nodeName}" actualizado.`);
  }

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
  for (const fix of FIXES) {
    const freshNode = fresh.nodes.find((n) => n.name === fix.nodeName);
    const msg = freshNode?.parameters.options?.systemMessage || "";
    const nodeOk = msg.includes(fix.new) && !msg.includes(fix.old);
    console.log(`Verificacion "${fix.nodeName}":`, nodeOk ? "OK" : "ALGO NO CUADRA");
    ok = ok && nodeOk;
  }
  console.log(ok ? "Fix aplicado correctamente en los tres nodos." : "REVISAR A MANO, algo no quedo como se esperaba.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
