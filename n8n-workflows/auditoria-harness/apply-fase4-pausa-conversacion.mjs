// Fase 4: apagado por conversacion puntual (Redis, mismo mecanismo que el
// workflow viejo). El apagado global desde la app ya funciona sin cambios
// (los 3 envios al cliente ya pasan por /api/chatwoot/enviar desde la Fase 2).
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { randomUUID } from "crypto";
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fase4-pausa-conversacion_2026-08-13.json", import.meta.url);

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

const REDIS_CRED = { redis: { id: "ZUlkjSz8R2bmmO2f", name: "Redis account 2" } };

function id() { return randomUUID(); }

const CONV_ID_EXPR = "$('Webhook1').item.json.body.conversation.messages[0].conversation_id";

function buildNodes() {
  const chequearBotPausado = {
    parameters: {
      operation: "get",
      propertyName: "pausado",
      key: `=bot_pausado:{{ ${CONV_ID_EXPR} }}`,
      options: {},
    },
    type: "n8n-nodes-base.redis",
    typeVersion: 1,
    position: [1120, -100],
    id: id(),
    name: "Chequear Bot Pausado",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 1000,
    credentials: REDIS_CRED,
  };

  const botPausado = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [
          {
            id: id(),
            leftValue: "={{ $json.pausado }}",
            rightValue: "",
            operator: { type: "string", operation: "notEmpty", singleValue: true },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [1390, -100],
    id: id(),
    name: "¿Bot Pausado?",
  };

  const finBotPausado = {
    parameters: {},
    type: "n8n-nodes-base.noOp",
    typeVersion: 1,
    position: [1660, -200],
    id: id(),
    name: "Fin - Bot Pausado",
  };

  const esComandoReactivar = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
        conditions: [
          {
            id: id(),
            leftValue: "={{ ($json.body.content || '').trim().toLowerCase() }}",
            rightValue: "/bot on",
            operator: { type: "string", operation: "equals" },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [850, 500],
    id: id(),
    name: "¿Es Comando Reactivar?",
  };

  const reactivarBot = {
    parameters: {
      operation: "delete",
      key: `=bot_pausado:{{ ${CONV_ID_EXPR} }}`,
    },
    type: "n8n-nodes-base.redis",
    typeVersion: 1,
    position: [1120, 620],
    id: id(),
    name: "Reactivar Bot",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 1000,
    credentials: REDIS_CRED,
  };

  const finBotReactivado = {
    parameters: {},
    type: "n8n-nodes-base.noOp",
    typeVersion: 1,
    position: [1390, 620],
    id: id(),
    name: "Fin - Bot Reactivado",
  };

  const marcarBotPausado = {
    parameters: {
      operation: "set",
      key: `=bot_pausado:{{ ${CONV_ID_EXPR} }}`,
      value: "1",
      expire: true,
      ttl: 2592000,
    },
    type: "n8n-nodes-base.redis",
    typeVersion: 1,
    position: [1950, 800],
    id: id(),
    name: "Marcar Bot Pausado",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 1000,
    credentials: REDIS_CRED,
  };

  return { chequearBotPausado, botPausado, finBotPausado, esComandoReactivar, reactivarBot, finBotReactivado, marcarBotPausado };
}

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const tieneTextoNode = wf.nodes.find((n) => n.name === "Tiene Texto");
  if (!tieneTextoNode) throw new Error('No se encontro el nodo "Tiene Texto"');
  const esRespuestaDeMiEquipoNode = wf.nodes.find((n) => n.name === "¿Es Respuesta de Mi Equipo?");
  if (!esRespuestaDeMiEquipoNode) throw new Error('No se encontro el nodo "¿Es Respuesta de Mi Equipo?" (correr Fase 3 primero)');
  const finNoEsEntranteNode = wf.nodes.find((n) => n.name === "Fin - No es Entrante");
  if (!finNoEsEntranteNode) throw new Error('No se encontro el nodo "Fin - No es Entrante"');

  const n = buildNodes();
  const newNodes = [
    n.chequearBotPausado, n.botPausado, n.finBotPausado,
    n.esComandoReactivar, n.reactivarBot, n.finBotReactivado,
    n.marcarBotPausado,
  ];

  const nodes = [...wf.nodes, ...newNodes];
  const connections = JSON.parse(JSON.stringify(wf.connections));

  // --- Rama entrante: chequear pausa antes de "Tiene Texto" ---
  connections["Es mensaje entrante"].main[0] = [{ node: n.chequearBotPausado.name, type: "main", index: 0 }];
  connections[n.chequearBotPausado.name] = { main: [[{ node: n.botPausado.name, type: "main", index: 0 }]] };
  connections[n.botPausado.name] = {
    main: [
      [{ node: n.finBotPausado.name, type: "main", index: 0 }],
      [{ node: tieneTextoNode.name, type: "main", index: 0 }],
    ],
  };

  // --- Rama saliente: comando /bot on antes de "¿Es Respuesta de Mi Equipo?" ---
  connections["Es mensaje entrante"].main[1] = [{ node: n.esComandoReactivar.name, type: "main", index: 0 }];
  connections[n.esComandoReactivar.name] = {
    main: [
      [{ node: n.reactivarBot.name, type: "main", index: 0 }],
      [{ node: esRespuestaDeMiEquipoNode.name, type: "main", index: 0 }],
    ],
  };
  connections[n.reactivarBot.name] = { main: [[{ node: n.finBotReactivado.name, type: "main", index: 0 }]] };

  // --- Cuando el equipo escribe algo que no responde nada pendiente: pausar ---
  connections["¿Hay Pregunta Pendiente?"].main[1] = [{ node: n.marcarBotPausado.name, type: "main", index: 0 }];
  connections[n.marcarBotPausado.name] = { main: [[{ node: finNoEsEntranteNode.name, type: "main", index: 0 }]] };

  const allowedSettingsKeys = [
    "saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
    "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder",
  ];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => allowedSettingsKeys.includes(k)));

  const body = { name: wf.name, nodes, connections, settings };

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: JSON.stringify(body) });
  console.log("Actualizado. Nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const fresh = await api(`/workflows/${WORKFLOW_ID}`);
  console.log("Verificacion GET post-update. Nodos:", fresh.nodes.length, "| activo:", fresh.active);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
