// Sube el TTL del pin de kit en Redis (`kit_pineado:{telefono}`) de 12hs
// (43200s) a 96hs (345600s) en los dos nodos que lo escriben: "Marcar Kit
// Pineado" (cuando se confirma el kit por primera vez) y "Refrescar Kit
// Pineado" (cuando se sigue hablando del mismo kit ya pineado).
//
// Motivo, encontrado revisando dos casos reales el mismo dia (2026-08-16/17):
// 1. Caso conv 1970 (+5493624812003): el cliente escribio la plantilla del
//    Kit 8, 27hs despues escribio "Ah un 110" -- el pin ya habia vencido
//    (12hs) y el mensaje, sin contexto de que kit, no se pudo resolver ni
//    siquiera desde el `detalle` del kit -- escalo a sin_match.
// 2. Investigando ESE caso aparecio un dato mas fino: el pin se graba en el
//    mismo instante en que se PROCESA el mensaje (nodo "Marcar Kit Pineado"),
//    no cuando el cliente efectivamente lo RECIBE -- si en ese momento el
//    bot esta apagado (horario automatico / boton manual), el saludo del kit
//    queda en `respuestas_pendientes` (ver app/api/chatwoot/enviar/route.ts,
//    lib/chatwoot-cola.ts) y se le entrega recien cuando abre el local. En el
//    caso real conv 1970 eso le "robo" ~2hs de las 12 antes de que el
//    cliente supiera siquiera de que kit se hablaba.
//
// Arreglar esto "bien" (que el TTL cuente desde el despacho real, no desde
// el procesamiento) requeriria que la app Next.js tambien pueda tocar este
// mismo Redis -- hoy no tiene cliente de Redis ni las credenciales (viven
// solo del lado de n8n). Decision explicita con Martin: en vez de sumar esa
// infraestructura nueva, un TTL fijo generoso (96hs) le gana de sobra a
// cualquier cierre real (el peor caso, sabado tarde a lunes manana, son
// ~40hs) y deja varios dias de charla real despues de que el cliente ve el
// mensaje, sin ser tan largo como para que "un numero de cilindrada" quede
// pineado semanas y se mezcle con una conversacion nueva y distinta del
// mismo cliente.
//
// Solo cambia el valor de `ttl` en dos nodos Redis existentes -- no toca
// logica ni conexiones ni agrega nodos.
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-ttl-kit-pineado-96hs_2026-08-17.json", import.meta.url);

const OLD_TTL = 43200; // 12hs
const NEW_TTL = 345600; // 96hs
const NODE_NAMES = ["Marcar Kit Pineado", "Refrescar Kit Pineado"];

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

  for (const name of NODE_NAMES) {
    const node = wf.nodes.find((n) => n.name === name);
    if (!node) throw new Error(`No se encontro el nodo "${name}"`);
    if (node.parameters.ttl !== OLD_TTL) {
      throw new Error(`El TTL de "${name}" no es ${OLD_TTL} (es ${node.parameters.ttl}) -- puede que ya se haya tocado. Revisar a mano antes de seguir.`);
    }
    node.parameters.ttl = NEW_TTL;
    console.log(`TTL de "${name}" actualizado a ${NEW_TTL} (96hs).`);
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
  for (const name of NODE_NAMES) {
    const freshNode = fresh.nodes.find((n) => n.name === name);
    const nodeOk = freshNode?.parameters.ttl === NEW_TTL;
    console.log(`Verificacion "${name}":`, nodeOk ? "OK" : "ALGO NO CUADRA");
    ok = ok && nodeOk;
  }
  console.log(ok ? "Fix aplicado correctamente en los dos nodos." : "REVISAR A MANO, algo no quedo como se esperaba.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
