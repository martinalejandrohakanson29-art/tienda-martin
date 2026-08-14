// Refuerzo del fix "primera persona al redactar respuesta del equipo"
// (apply-fix-primera-persona-equipo.mjs, 2026-08-14 10:32): ese fix ya le
// prohibia a la IA decir "nos confirmaron"/"el equipo dijo", pero la conv 1940
// (+5493875911890) volvio a filtrar la misma frase mas tarde el mismo dia
// (ejecucion 74880, 13:04) -- "Nos confirmaron que le beneficia mucho a la
// moto: mejora el rendimiento, la potencia, el torque y la velocidad final."
// La prohibicion sola no le alcanzo a DeepSeek (temperature 0) para evitar su
// propia frase habitual. Este fix agrega un ejemplo concreto (mal -> bien,
// usando ese caso real) a los mismos dos nodos, para reforzar por
// demostracion ademas de por regla. Solo texto de prompt, no toca logica ni
// conexiones. A pedido explicito de Martin: solo reforzar el prompt, sin
// agregar una red de seguridad deterministica aparte.
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-ejemplo-primera-persona_2026-08-14.json", import.meta.url);

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

const SHARED_OLD = '"mensaje_cliente\" es un mensaje corto y natural para mandarle al cliente, EN PRIMERA PERSONA como si vos mismo fueras el dueño del negocio (nunca digas "nos confirmaron", "el equipo dijo", "me confirman que", ni reveles de ninguna forma que hay alguien mas respondiendo atrás -- afirmá el dato directo, como si ya lo supieras vos). Usá únicamente lo que dijo el equipo, nunca inventes datos que no dijo.';

const FIXES = [
  {
    nodeName: "Interpretar Respuesta Sin Match",
    old: SHARED_OLD,
    new: SHARED_OLD + ' Ejemplo real de lo que NO hay que hacer: el equipo escribió "mejora mucho el rendimiento, la potencia, el torque, la velocidad final" y la IA respondió mal con "Nos confirmaron que le beneficia mucho a la moto: mejora el rendimiento, la potencia, el torque y la velocidad final." (delata que hay alguien atrás). La version correcta para ese mismo caso era: "Sí, le mejora mucho el rendimiento: potencia, torque y velocidad final." (vos lo afirmás directo, como si ya lo supieras).',
  },
  {
    nodeName: "Interpretar Respuesta Equipo",
    old: SHARED_OLD,
    new: SHARED_OLD + ' Ejemplo de lo que NO hay que hacer: el equipo escribió "le va bien, solo hay que cambiar el carburador" y la IA respondió mal con "Nos confirmaron que es compatible, el equipo dice que hay que cambiar el carburador." (delata que hay alguien atrás). La version correcta para ese mismo caso era: "Sí, es compatible. Solo hay que cambiar el carburador." (vos lo afirmás directo, sin mencionar a nadie más).',
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
    const nodeOk = msg.includes(fix.new);
    console.log(`Verificacion "${fix.nodeName}":`, nodeOk ? "OK" : "ALGO NO CUADRA");
    ok = ok && nodeOk;
  }
  console.log(ok ? "Fix aplicado correctamente en ambos nodos." : "REVISAR A MANO, algo no quedo como se esperaba.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
