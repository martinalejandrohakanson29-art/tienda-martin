// Fix: cuando el equipo contesta una pendiente en privado (compatibilidad o
// sin_match), los nodos que redactan la respuesta para el cliente
// ("Interpretar Respuesta Equipo" e "Interpretar Respuesta Sin Match") le
// piden a la IA un mensaje "contando lo que contesto el equipo" -- eso
// produce frases como "Nos confirmaron que le beneficia mucho a la moto...",
// que delatan que hubo un humano de por medio. Rompe la regla de que el bot
// siempre habla en primera persona como el dueño del negocio (ver
// CHATWOOT-BOT-CONTEXTO.md). El nodo "Redactar Respuesta desde Dato" (Fase 6,
// camino directo sin escalado) ya lo hace bien -- este fix le copia la misma
// instruccion de "primera persona, nunca reveles que hay un equipo atras" a
// los otros dos nodos. Solo texto de prompt, no toca logica ni conexiones.
// Encontrado revisando la charla con +5493875911890 (contacto 1940, conv 1940).
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-primera-persona-equipo_2026-08-14.json", import.meta.url);

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

const FIXES = [
  {
    nodeName: "Interpretar Respuesta Sin Match",
    old: '"mensaje_cliente\" es un mensaje corto y natural, listo para mandarle al cliente, contando lo que contestó el equipo (nunca inventes datos que el equipo no dijo).',
    new: '"mensaje_cliente\" es un mensaje corto y natural para mandarle al cliente, EN PRIMERA PERSONA como si vos mismo fueras el dueño del negocio (nunca digas "nos confirmaron", "el equipo dijo", "me confirman que", ni reveles de ninguna forma que hay alguien mas respondiendo atrás -- afirmá el dato directo, como si ya lo supieras vos). Usá únicamente lo que dijo el equipo, nunca inventes datos que no dijo.',
  },
  {
    nodeName: "Interpretar Respuesta Equipo",
    old: '"mensaje_cliente\" es un mensaje corto y natural, listo para mandarle al cliente, contando lo que contesto el equipo (nunca inventes datos que el equipo no dijo).',
    new: '"mensaje_cliente\" es un mensaje corto y natural para mandarle al cliente, EN PRIMERA PERSONA como si vos mismo fueras el dueño del negocio (nunca digas "nos confirmaron", "el equipo dijo", "me confirman que", ni reveles de ninguna forma que hay alguien mas respondiendo atrás -- afirmá el dato directo, como si ya lo supieras vos). Usá únicamente lo que dijo el equipo, nunca inventes datos que no dijo.',
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
  console.log(ok ? "Fix aplicado correctamente en ambos nodos." : "REVISAR A MANO, algo no quedo como se esperaba.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
