// Segundo fix post-migracion: con responsesApiEnabled:false ya solucionado el error de version del
// Agent node, la ejecucion real (conv 1, ejecucion 79101, nodo "Validar Continuidad de Tema") tiro
// "Bad request - please check your parameters" en las 3 reintentos. Causa mas probable: gpt-5.6-*
// es un modelo de razonamiento (matchea el regex ^gpt-5.* que gatilla "Reasoning Effort" en el
// propio schema del nodo) y esta familia de modelos de OpenAI no acepta "temperature" distinto del
// default -- los 11 nodos migrados heredaron temperature:0 de la config vieja de DeepSeek, que
// gpt-5.6 rechaza. Fix acotado: sacar "temperature" de parameters.options en los 11 nodos, dejar
// timeout/maxRetries como estaban.
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const NODOS = [
  "DeepSeek Chat Model - Compatibilidad",
  "DeepSeek Chat Model - Interpretacion",
  "DeepSeek Chat Model - Split Sub-preguntas",
  "DeepSeek Chat Model - Tema Negocio",
  "DeepSeek Chat Model - Redaccion",
  "DeepSeek Chat Model - Interpretacion Sin Match",
  "DeepSeek Chat Model - Continuidad de Tema",
  "DeepSeek Chat Model - Detalle Compatibilidad",
  "DeepSeek Chat Model - Detalle Otro",
  "DeepSeek Chat Model - Identificar Necesidad",
  "DeepSeek Chat Model - Repregunta Modelo",
];

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-temperature-gpt56-reasoning_2026-08-19.json", import.meta.url);

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

  let tocados = 0;
  for (const node of wf.nodes) {
    if (!NODOS.includes(node.name)) continue;
    if (node.type !== "@n8n/n8n-nodes-langchain.lmChatOpenAi") {
      throw new Error(`"${node.name}" no tiene el type esperado (lmChatOpenAi) -- revisar a mano.`);
    }
    if (node.parameters.options && "temperature" in node.parameters.options) {
      delete node.parameters.options.temperature;
    }
    tocados++;
    console.log(`- ${node.name}: options ahora`, JSON.stringify(node.parameters.options));
  }
  if (tocados !== NODOS.length) throw new Error(`Solo se tocaron ${tocados}/${NODOS.length} nodos esperados.`);

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
  for (const nombre of NODOS) {
    const n = fresh.nodes.find((x) => x.name === nombre);
    if (n?.parameters?.options && "temperature" in n.parameters.options) {
      ok = false;
      console.log(`ALGO NO CUADRA en "${nombre}": todavia tiene temperature=${n.parameters.options.temperature}`);
    }
  }
  console.log("Verificacion de los 11 nodos:", ok ? "OK" : "REVISAR ARRIBA");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
