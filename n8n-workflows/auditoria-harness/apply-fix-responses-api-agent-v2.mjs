// Fix post-migracion: los 11 nodos migrados a @n8n/n8n-nodes-langchain.lmChatOpenAi (v1.3) traen
// responsesApiEnabled:true por default, que usa la OpenAI Responses API. El Agent node de esta
// instancia esta en typeVersion 2 y no la soporta -- error real en produccion (conv 1, ejecucion
// 79097, nodo "Validar Continuidad de Tema"): "This model is not supported in 2 version of the
// Agent node." Fix acotado: forzar responsesApiEnabled:false en los 11 nodos migrados (Chat
// Completions API clasica, la que el Agent v2 siempre soporto), sin tocar los nodos Agent.
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

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-responses-api-agent-v2_2026-08-19.json", import.meta.url);

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
    node.parameters.responsesApiEnabled = false;
    tocados++;
    console.log(`- ${node.name}: responsesApiEnabled = false`);
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
    if (n?.parameters?.responsesApiEnabled !== false) {
      ok = false;
      console.log(`ALGO NO CUADRA en "${nombre}": responsesApiEnabled=${n?.parameters?.responsesApiEnabled}`);
    }
  }
  console.log("Verificacion de los 11 nodos:", ok ? "OK" : "REVISAR ARRIBA");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
