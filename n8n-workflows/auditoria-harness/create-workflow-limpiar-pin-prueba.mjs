// Crea un workflow chico en n8n, "Utilidad - Limpiar Pin de Prueba", que la app llama por
// webhook para borrar claves de Redis (kit_pineado / bot_pausado) desde el boton "Borrar
// historial de un numero" en /admin/chatwoot/prueba.
//
// Por que existe: la app (Next.js) no puede conectarse directo al Redis del bot -- ese Redis
// tiene un firewall/allowlist de IP que solo deja pasar al servidor donde corre n8n (confirmado
// el 2026-08-18 probando con AUTH crudo por TCP desde otro origen: WRONGPASS aunque la
// contrasena es correcta). En vez de pelear con el firewall, se aprovecha que n8n YA tiene la
// credencial "Redis account 2" funcionando: este workflow expone un webhook chico y privado que
// hace el borrado ahi, y la app le pega un POST en vez de conectarse ella misma a Redis.
//
// Aplicado como workflow NUEVO (no toca "Respuestas chatwoot 2.0").
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const REDIS_CREDENTIAL = { id: "ZUlkjSz8R2bmmO2f", name: "Redis account 2" };

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

const nodes = [
  {
    id: "webhook-1", name: "Webhook", type: "n8n-nodes-base.webhook", typeVersion: 2.1,
    position: [0, 0],
    parameters: { httpMethod: "POST", path: "limpiar-pin-prueba", responseMode: "responseNode", options: {} },
    webhookId: "b3e0a1d4-6f2a-4a3e-9a5c-1f2e9c8b7a11",
  },
  {
    id: "token-if", name: "¿Token Correcto?", type: "n8n-nodes-base.if", typeVersion: 2.2,
    position: [220, 0],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
        conditions: [{
          id: "cond-token",
          leftValue: "={{ $json.query.token }}",
          rightValue: "={{ $env.CHATWOOT_WEBHOOK_TOKEN }}",
          operator: { type: "string", operation: "equals" },
        }],
        combinator: "and",
      },
      options: {},
    },
  },
  {
    id: "no-auth", name: "Responder No Autorizado", type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.1,
    position: [440, 150],
    parameters: {
      respondWith: "json",
      responseBody: '={{ { "error": "No autorizado" } }}',
      options: { responseCode: 401 },
    },
  },
  {
    id: "preparar-claves", name: "Preparar Claves", type: "n8n-nodes-base.code", typeVersion: 2,
    position: [440, -100],
    parameters: {
      jsCode: "const body = $json.body || {};\nconst telefono = (body.telefono || '').toString().trim();\nconst ids = Array.isArray(body.conversationIds) ? body.conversationIds : [];\nconst items = [];\nif (telefono) items.push({ json: { key: `kit_pineado:${telefono}` } });\nfor (const id of ids) items.push({ json: { key: `bot_pausado:${id}` } });\nreturn items;\n",
    },
  },
  {
    id: "borrar-clave", name: "Borrar Clave", type: "n8n-nodes-base.redis", typeVersion: 1,
    position: [660, -100],
    parameters: { operation: "delete", key: "={{ $json.key }}" },
    credentials: { redis: REDIS_CREDENTIAL },
    retryOnFail: true, maxTries: 2, waitBetweenTries: 1000,
    alwaysOutputData: true,
  },
  {
    id: "responder-resultado", name: "Responder Resultado", type: "n8n-nodes-base.code", typeVersion: 2,
    position: [880, -100],
    parameters: {
      jsCode: "return [{ json: { success: true, clavesBorradas: $input.all().length } }];\n",
    },
  },
  {
    id: "responder-ok", name: "Responder OK", type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.1,
    position: [1100, -100],
    parameters: { respondWith: "json", responseBody: "={{ $json }}", options: {} },
  },
];

const connections = {
  "Webhook": { main: [[{ node: "¿Token Correcto?", type: "main", index: 0 }]] },
  "¿Token Correcto?": {
    main: [
      [{ node: "Preparar Claves", type: "main", index: 0 }],
      [{ node: "Responder No Autorizado", type: "main", index: 0 }],
    ],
  },
  "Preparar Claves": { main: [[{ node: "Borrar Clave", type: "main", index: 0 }]] },
  "Borrar Clave": { main: [[{ node: "Responder Resultado", type: "main", index: 0 }]] },
  "Responder Resultado": { main: [[{ node: "Responder OK", type: "main", index: 0 }]] },
};

async function main() {
  const body = {
    name: "Utilidad - Limpiar Pin de Prueba",
    nodes,
    connections,
    settings: { executionOrder: "v1" },
  };

  const created = await api("/workflows", { method: "POST", body: JSON.stringify(body) });
  console.log("Workflow creado. id:", created.id, "| activo:", created.active);
  writeFileSync(new URL("./workflow_id_limpiar-pin-prueba.txt", import.meta.url), created.id);

  const activated = await api(`/workflows/${created.id}/activate`, { method: "POST" });
  console.log("Activado:", activated.active);

  console.log(`Webhook URL: https://n8n.revolucionmotos.tech/webhook/limpiar-pin-prueba?token=<CHATWOOT_WEBHOOK_TOKEN>`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
