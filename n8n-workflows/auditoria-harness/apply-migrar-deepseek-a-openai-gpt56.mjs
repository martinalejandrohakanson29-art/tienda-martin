// Migra los 11 nodos "DeepSeek Chat Model - *" (todos @n8n/n8n-nodes-langchain.lmChatDeepSeek,
// deepseek-v4-flash) a @n8n/n8n-nodes-langchain.lmChatOpenAi con la familia GPT-5.6:
//
// - 7 nodos de clasificacion/extraccion -> gpt-5.6-luna (mas barato que Haiku en ambas puntas,
//   sin razon para no migrarlos ya dado que ya hay credencial OpenAI disponible en n8n).
// - 4 nodos de mayor riesgo (evaluacion de compatibilidad + redaccion cara al cliente)
//   -> gpt-5.6-terra (mejor instruction-following, es donde un error se nota o se paga caro).
//
// Reusa la credencial OpenAI ya cargada en n8n (openAiApi, id XjYyT7i3oP95CavU, "OpenAi account"),
// la misma que usa el nodo "Transcribir Audio" para Whisper. No se tocan nombres de nodo ni
// conexiones -- solo type, typeVersion, parameters.model y credentials de cada nodo LLM, para
// minimizar el blast radius sobre el resto del grafo.
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const OPENAI_CREDENTIALS = { openAiApi: { id: "XjYyT7i3oP95CavU", name: "OpenAi account" } };

const LUNA = "gpt-5.6-luna";
const TERRA = "gpt-5.6-terra";

const MIGRACION = {
  "DeepSeek Chat Model - Compatibilidad": LUNA,
  "DeepSeek Chat Model - Interpretacion": LUNA,
  "DeepSeek Chat Model - Split Sub-preguntas": LUNA,
  "DeepSeek Chat Model - Tema Negocio": LUNA,
  "DeepSeek Chat Model - Interpretacion Sin Match": LUNA,
  "DeepSeek Chat Model - Continuidad de Tema": LUNA,
  "DeepSeek Chat Model - Identificar Necesidad": LUNA,
  "DeepSeek Chat Model - Detalle Compatibilidad": TERRA,
  "DeepSeek Chat Model - Redaccion": TERRA,
  "DeepSeek Chat Model - Detalle Otro": TERRA,
  "DeepSeek Chat Model - Repregunta Modelo": TERRA,
};

const BACKUP_PATH = new URL("./workflow_backup_pre-migrar-deepseek-a-openai-gpt56_2026-08-19.json", import.meta.url);

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

  const nombresEsperados = Object.keys(MIGRACION);
  const faltantes = nombresEsperados.filter((n) => !wf.nodes.some((node) => node.name === n));
  if (faltantes.length) {
    throw new Error(`No se encontraron estos nodos (¿ya se migraron o cambiaron de nombre?): ${faltantes.join(", ")}`);
  }

  let migrados = 0;
  for (const node of wf.nodes) {
    const modelo = MIGRACION[node.name];
    if (!modelo) continue;

    if (node.type !== "@n8n/n8n-nodes-langchain.lmChatDeepSeek") {
      throw new Error(`"${node.name}" no tiene el type esperado (lmChatDeepSeek) -- revisar a mano.`);
    }

    node.type = "@n8n/n8n-nodes-langchain.lmChatOpenAi";
    node.typeVersion = 1.3;
    node.parameters.model = { __rl: true, mode: "id", value: modelo };
    node.credentials = OPENAI_CREDENTIALS;
    migrados++;
    console.log(`- ${node.name} -> ${modelo}`);
  }

  console.log(`Migrados ${migrados}/${nombresEsperados.length} nodos.`);

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
  for (const [nombre, modelo] of Object.entries(MIGRACION)) {
    const n = fresh.nodes.find((x) => x.name === nombre);
    const tipoOk = n?.type === "@n8n/n8n-nodes-langchain.lmChatOpenAi";
    const modeloOk = n?.parameters?.model?.value === modelo;
    const credOk = n?.credentials?.openAiApi?.id === OPENAI_CREDENTIALS.openAiApi.id;
    if (!tipoOk || !modeloOk || !credOk) {
      ok = false;
      console.log(`ALGO NO CUADRA en "${nombre}": tipo=${n?.type} modelo=${n?.parameters?.model?.value} cred=${n?.credentials?.openAiApi?.id}`);
    }
  }
  console.log("Verificacion de los 11 nodos:", ok ? "OK" : "REVISAR ARRIBA");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
