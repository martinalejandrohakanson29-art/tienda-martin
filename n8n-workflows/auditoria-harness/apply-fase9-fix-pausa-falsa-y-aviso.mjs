// Fase 9: dos arreglos chicos sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg),
// encontrados al revisar la charla con +5493492569184 (contacto 1887):
//
// 1) Pausa falsa: "Es Respuesta de Mi Equipo?" hace fan-out en paralelo a dos
//    chequeos de pendientes -- "Buscar Preguntas Pendientes" (solo mira
//    preguntas_tecnicas_pendientes) y "Buscar Pendiente Sin Match" (solo mira
//    preguntas_sin_match_pendientes). Si la nota privada del equipo responde
//    una pendiente "sin_match" (precio/envio/negocio/otro), la rama tecnica no
//    encuentra nada en SU tabla y lo interpreta como "el equipo esta chateando
//    espontaneamente" -> dispara "Marcar Bot Pausado" (30 dias) aunque la otra
//    rama SI resolvio algo. Fix: antes de pausar, chequear tambien
//    preguntas_sin_match_pendientes -- si hay algo pendiente ahi, no pausar
//    (la otra rama ya se esta haciendo cargo).
//
// 2) Aviso invisible: cuando la conversacion SI esta pausada (Redis
//    bot_pausado:{conv}) y el cliente escribe, el bot no hace nada y no queda
//    ningun rastro mas alla del mensaje sin leer en el propio Chatwoot. Fix:
//    dejar una nota privada avisando que llego un mensaje durante la pausa,
//    citando el contenido, y recordando el comando /bot on.
//
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { randomUUID } from "crypto";
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fase9-fix-pausa-falsa-y-aviso_2026-08-13.json", import.meta.url);

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

const POSTGRES_CRED = { postgres: { id: "65YYZNhTfBBheEpo", name: "Postgres account" } };

function id() { return randomUUID(); }

const CONV_ID_EXPR = "$('Webhook1').item.json.body.conversation.messages[0].conversation_id";

function buildNodes() {
  const chequearSinMatchAntesDePausar = {
    parameters: {
      operation: "executeQuery",
      query: `SELECT COUNT(*)::int AS cantidad\nFROM preguntas_sin_match_pendientes\nWHERE conversation_id = {{ ${CONV_ID_EXPR} }} AND estado = 'pendiente';`,
      options: {},
    },
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [1950, 650],
    id: id(),
    name: "Chequear Sin Match Antes de Pausar",
    alwaysOutputData: true,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    credentials: POSTGRES_CRED,
  };

  const haySinMatchPendienteTambien = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [
          {
            id: id(),
            leftValue: "={{ $json.cantidad }}",
            rightValue: 0,
            operator: { type: "number", operation: "gt" },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [1950, 750],
    id: id(),
    name: "¿Hay Sin Match Pendiente Tambien?",
  };

  const armarNotaBotPausado = {
    parameters: {
      assignments: {
        assignments: [
          {
            id: id(),
            name: "motivo",
            value: "=El cliente escribió mientras esta conversación está en pausa manual (el bot no le respondió): \"{{ $('Webhook1').item.json.body.content }}\"\n\nPara que el bot vuelva a responder automático acá, escribí: /bot on",
            type: "string",
          },
        ],
      },
      includeOtherFields: false,
      options: {},
    },
    type: "n8n-nodes-base.set",
    typeVersion: 3.4,
    position: [1660, -100],
    id: id(),
    name: "Armar Nota Bot Pausado",
  };

  const enviarNotaBotPausado = {
    parameters: {
      method: "POST",
      url: "={{ $('Config Chatwoot').item.json.chatwoot_api }}/accounts/{{ $('Webhook1').item.json.body.account.id }}/conversations/{{ $('Webhook1').item.json.body.conversation.messages[0].conversation_id }}/messages",
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: "api_access_token", value: "={{ $('Config Chatwoot').item.json.chatwoot_token }}" },
          { name: "Content-Type", value: "application/json" },
        ],
      },
      sendBody: true,
      specifyBody: "json",
      jsonBody: "={{ JSON.stringify({ content: $json.motivo, message_type: 'outgoing', private: true }) }}",
      options: { timeout: 20000 },
    },
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [1930, -100],
    id: id(),
    name: "Enviar Nota Bot Pausado",
  };

  return { chequearSinMatchAntesDePausar, haySinMatchPendienteTambien, armarNotaBotPausado, enviarNotaBotPausado };
}

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const hayPreguntaPendienteNode = wf.nodes.find((n) => n.name === "¿Hay Pregunta Pendiente?");
  if (!hayPreguntaPendienteNode) throw new Error('No se encontro el nodo "¿Hay Pregunta Pendiente?"');
  const marcarBotPausadoNode = wf.nodes.find((n) => n.name === "Marcar Bot Pausado");
  if (!marcarBotPausadoNode) throw new Error('No se encontro el nodo "Marcar Bot Pausado" (correr Fase 4 primero)');
  const finNoEsEntranteNode = wf.nodes.find((n) => n.name === "Fin - No es Entrante");
  if (!finNoEsEntranteNode) throw new Error('No se encontro el nodo "Fin - No es Entrante"');
  const botPausadoNode = wf.nodes.find((n) => n.name === "¿Bot Pausado?");
  if (!botPausadoNode) throw new Error('No se encontro el nodo "¿Bot Pausado?"');
  const finBotPausadoNode = wf.nodes.find((n) => n.name === "Fin - Bot Pausado");
  if (!finBotPausadoNode) throw new Error('No se encontro el nodo "Fin - Bot Pausado"');

  const n = buildNodes();
  const newNodes = [
    n.chequearSinMatchAntesDePausar, n.haySinMatchPendienteTambien,
    n.armarNotaBotPausado, n.enviarNotaBotPausado,
  ];

  const nodes = [...wf.nodes, ...newNodes];
  const connections = JSON.parse(JSON.stringify(wf.connections));

  // --- Fix 1: no pausar si la nota privada respondio una pendiente "sin match" ---
  connections[hayPreguntaPendienteNode.name].main[1] = [{ node: n.chequearSinMatchAntesDePausar.name, type: "main", index: 0 }];
  connections[n.chequearSinMatchAntesDePausar.name] = { main: [[{ node: n.haySinMatchPendienteTambien.name, type: "main", index: 0 }]] };
  connections[n.haySinMatchPendienteTambien.name] = {
    main: [
      [{ node: finNoEsEntranteNode.name, type: "main", index: 0 }], // TRUE: hay pendiente sin_match -> la otra rama ya la resuelve, no pausar
      [{ node: marcarBotPausadoNode.name, type: "main", index: 0 }], // FALSE: de verdad no hay nada pendiente -> pausar como antes
    ],
  };

  // --- Fix 2: avisar con nota privada cuando llega un mensaje durante la pausa ---
  connections[botPausadoNode.name].main[0] = [{ node: n.armarNotaBotPausado.name, type: "main", index: 0 }];
  connections[n.armarNotaBotPausado.name] = { main: [[{ node: n.enviarNotaBotPausado.name, type: "main", index: 0 }]] };
  connections[n.enviarNotaBotPausado.name] = { main: [[{ node: finBotPausadoNode.name, type: "main", index: 0 }]] };

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
