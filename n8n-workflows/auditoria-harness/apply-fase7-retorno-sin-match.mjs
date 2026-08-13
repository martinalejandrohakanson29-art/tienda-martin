// Fase 7: cierra el circuito de la Fase 5/6 -- cuando el equipo contesta (nota
// privada) una pregunta que quedo pendiente en preguntas_sin_match_pendientes,
// se interpreta con IA acotada, se le manda la respuesta al cliente con la voz
// del bot (nunca revela que hubo un humano de por medio), se marca la fila
// como respondida, y se guarda en conocimiento_libre (categoria='sin_match')
// para que la proxima pregunta parecida ya no necesite escalar.
//
// Se DUPLICA el camino existente de "el equipo respondio" (Buscar Preguntas
// Pendientes / etc., que solo mira preguntas_tecnicas_pendientes) en vez de
// editarlo -- nodos nuevos en paralelo, mismo patron que el fan-out ya usado
// al final de la Fase 6. Menor riesgo de regresion sobre el camino tecnico
// que ya funciona en produccion desde la Fase 3. Costo aceptado: si una
// conversacion tiene a la vez una pendiente tecnica y una sin_match, hace
// falta una respuesta del equipo por cada una.
import { randomUUID } from "crypto";
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fase7-retorno-sin-match_2026-08-13.json", import.meta.url);

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
const DEEPSEEK_CRED = { deepSeekApi: { id: "6uiYD2nzluzyDXnZ", name: "DeepSeek account" } };

function id() { return randomUUID(); }

function buildNodes() {
  const buscarPendienteSinMatch = {
    parameters: {
      operation: "executeQuery",
      query:
        "SELECT id, pregunta_original\nFROM preguntas_sin_match_pendientes\nWHERE conversation_id = {{ $('Webhook1').item.json.body.conversation.messages[0].conversation_id }} AND estado = 'pendiente'\nORDER BY creado_en DESC LIMIT 1;",
      options: {},
    },
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [1408, 900],
    id: id(),
    name: "Buscar Pendiente Sin Match",
    alwaysOutputData: true,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    credentials: POSTGRES_CRED,
  };

  const hayPendienteSinMatch = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [{ id: id(), leftValue: "={{ $json.id !== undefined }}", rightValue: true, operator: { type: "boolean", operation: "equals" } }],
        combinator: "and",
      },
      options: {},
    },
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [1680, 900],
    id: id(),
    name: "¿Hay Pendiente Sin Match?",
  };

  const interpretarRespuestaSinMatch = {
    parameters: {
      promptType: "define",
      text:
        "=Pregunta pendiente del cliente en esta conversacion: {{ $json.pregunta_original }}\n\nRespuesta del equipo: {{ $('Webhook1').item.json.body.content }}",
      options: {
        systemMessage:
          "Sos parte de un sistema que ayuda a un equipo de venta de repuestos de moto a responder preguntas que no supieron ubicar automaticamente. Te paso la pregunta pendiente del cliente y la respuesta que acaba de escribir un miembro del equipo, en lenguaje natural y libre.\n\nRespondé UNICAMENTE con un JSON valido, sin texto adicional, con este formato exacto:\n{\"mensaje_cliente\": \"...\", \"confianza\": \"alta\" o \"baja\"}\n\n- \"mensaje_cliente\" es un mensaje corto y natural, listo para mandarle al cliente, contando lo que contestó el equipo (nunca inventes datos que el equipo no dijo).\n- \"confianza\": \"alta\" SOLO si la respuesta del equipo realmente contesta la pregunta pendiente. Si es ambigua, si no es realmente una respuesta a esa pregunta, o si el equipo no dio información concreta, \"baja\" -- en ese caso no hace falta completar bien mensaje_cliente.",
      },
    },
    type: "@n8n/n8n-nodes-langchain.agent",
    typeVersion: 2,
    position: [1950, 900],
    id: id(),
    name: "Interpretar Respuesta Sin Match",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
  };

  const deepseekInterpretacionSinMatch = {
    parameters: { model: "deepseek-v4-flash", options: { temperature: 0, timeout: 25000, maxRetries: 2 } },
    type: "@n8n/n8n-nodes-langchain.lmChatDeepSeek",
    typeVersion: 1,
    position: [1950, 1100],
    id: id(),
    name: "DeepSeek Chat Model - Interpretacion Sin Match",
    credentials: DEEPSEEK_CRED,
  };

  const parsearRespuestaSinMatch = {
    parameters: {
      jsCode:
        "let mensajeCliente = '', confianza = 'baja';\n" +
        "try {\n" +
        "  const raw = ($json.output || '{}').toString().trim();\n" +
        "  const clean = raw.replace(/```json|```/g, '').trim();\n" +
        "  const parsed = JSON.parse(clean);\n" +
        "  mensajeCliente = (parsed.mensaje_cliente || '').toString();\n" +
        "  confianza = parsed.confianza === 'alta' ? 'alta' : 'baja';\n" +
        "} catch (e) {}\n\n" +
        "if (!mensajeCliente) confianza = 'baja';\n\n" +
        "const escapar = (s) => (s || '').toString().replace(/'/g, \"''\");\n" +
        "const pendienteId = $('Buscar Pendiente Sin Match').item.json.id;\n" +
        "const preguntaOriginal = $('Buscar Pendiente Sin Match').item.json.pregunta_original;\n\n" +
        "return [{\n" +
        "  json: {\n" +
        "    confianza,\n" +
        "    pendiente_id: pendienteId,\n" +
        "    pregunta_original_sql: escapar(preguntaOriginal),\n" +
        "    mensaje_cliente: mensajeCliente,\n" +
        "    mensaje_cliente_sql: escapar(mensajeCliente),\n" +
        "  },\n" +
        "}];\n",
    },
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [2220, 900],
    id: id(),
    name: "Parsear Respuesta Sin Match",
  };

  const confianzaAltaSinMatch = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
        conditions: [{ id: id(), leftValue: "={{ $json.confianza }}", rightValue: "alta", operator: { type: "string", operation: "equals" } }],
        combinator: "and",
      },
      options: {},
    },
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [2490, 900],
    id: id(),
    name: "¿Confianza Alta Sin Match?",
  };

  const finConfianzaBajaSinMatch = {
    parameters: {},
    type: "n8n-nodes-base.noOp",
    typeVersion: 1,
    position: [2760, 1100],
    id: id(),
    name: "Fin - Confianza Baja Sin Match (no se actua)",
  };

  const guardarEnConocimientoLibreSinMatch = {
    parameters: {
      operation: "executeQuery",
      query:
        "INSERT INTO conocimiento_libre (categoria, clave, pregunta, respuesta, fuente)\nSELECT 'sin_match', '', '{{ $json.pregunta_original_sql }}', '{{ $json.mensaje_cliente_sql }}', 'equipo'\nWHERE length(trim('{{ $json.mensaje_cliente_sql }}')) > 0;",
      options: {},
    },
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [2760, 800],
    id: id(),
    name: "Guardar en Conocimiento Libre (Sin Match)",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    credentials: POSTGRES_CRED,
  };

  const marcarPendienteSinMatchRespondida = {
    parameters: {
      operation: "executeQuery",
      query: "UPDATE preguntas_sin_match_pendientes SET estado = 'respondida' WHERE id = {{ $('Parsear Respuesta Sin Match').item.json.pendiente_id }};",
      options: {},
    },
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [3030, 800],
    id: id(),
    name: "Marcar Pendiente Sin Match Respondida",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    credentials: POSTGRES_CRED,
  };

  const fueNotaPrivadaSinMatch = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
        conditions: [{ id: id(), leftValue: "={{ !!$('Webhook1').item.json.body.private }}", rightValue: true, operator: { type: "boolean", operation: "equals" } }],
        combinator: "and",
      },
      options: {},
    },
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [3300, 800],
    id: id(),
    name: "¿Fue Nota Privada Sin Match?",
  };

  const finEquipoYaRespondioDirectoSinMatch = {
    parameters: {},
    type: "n8n-nodes-base.noOp",
    typeVersion: 1,
    position: [3570, 1000],
    id: id(),
    name: "Fin - Equipo Ya Respondio Directo Sin Match",
  };

  const enviarRespuestaClienteSinMatch = {
    parameters: {
      method: "POST",
      url: "={{ $('Config Chatwoot').item.json.app_url }}/api/chatwoot/enviar",
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: "Authorization", value: "=Bearer {{ $env.N8N_SECRET_TOKEN }}" },
          { name: "Content-Type", value: "application/json" },
        ],
      },
      sendBody: true,
      specifyBody: "json",
      jsonBody:
        "={{ JSON.stringify({ conversation_id: $('Webhook1').item.json.body.conversation.messages[0].conversation_id, account_id: $('Webhook1').item.json.body.account.id, content: $('Parsear Respuesta Sin Match').item.json.mensaje_cliente, origen: 'aprendizaje_sin_match_2_0', contacto: ($('Webhook1').item.json.body.conversation?.meta?.sender?.name || $('Webhook1').item.json.body.sender?.name || ''), foto_url: null }) }}",
      options: { timeout: 20000 },
    },
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [3570, 800],
    id: id(),
    name: "Enviar Respuesta al Cliente (Sin Match)",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
  };

  const finAprendizajeSinMatchEnviado = {
    parameters: {},
    type: "n8n-nodes-base.noOp",
    typeVersion: 1,
    position: [3840, 800],
    id: id(),
    name: "Fin - Aprendizaje Sin Match Enviado",
  };

  return {
    buscarPendienteSinMatch, hayPendienteSinMatch,
    interpretarRespuestaSinMatch, deepseekInterpretacionSinMatch, parsearRespuestaSinMatch,
    confianzaAltaSinMatch, finConfianzaBajaSinMatch,
    guardarEnConocimientoLibreSinMatch, marcarPendienteSinMatchRespondida,
    fueNotaPrivadaSinMatch, finEquipoYaRespondioDirectoSinMatch,
    enviarRespuestaClienteSinMatch, finAprendizajeSinMatchEnviado,
  };
}

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  if (!wf.connections["¿Es Respuesta de Mi Equipo?"]) throw new Error('No se encontro "¿Es Respuesta de Mi Equipo?"');

  const n = buildNodes();
  const newNodes = Object.values(n);
  const nodes = [...wf.nodes, ...newNodes];
  const connections = JSON.parse(JSON.stringify(wf.connections));

  // Fan-out en paralelo: la rama tecnica existente sigue igual, se agrega esta
  // segunda salida desde el mismo origen (mismo patron que "Ruteo Clasificacion").
  const salidaTrue = connections["¿Es Respuesta de Mi Equipo?"].main[0];
  salidaTrue.push({ node: n.buscarPendienteSinMatch.name, type: "main", index: 0 });

  connections[n.buscarPendienteSinMatch.name] = { main: [[{ node: n.hayPendienteSinMatch.name, type: "main", index: 0 }]] };
  connections[n.hayPendienteSinMatch.name] = {
    main: [
      [{ node: n.interpretarRespuestaSinMatch.name, type: "main", index: 0 }],
      [],
    ],
  };
  connections[n.deepseekInterpretacionSinMatch.name] = { ai_languageModel: [[{ node: n.interpretarRespuestaSinMatch.name, type: "ai_languageModel", index: 0 }]] };
  connections[n.interpretarRespuestaSinMatch.name] = { main: [[{ node: n.parsearRespuestaSinMatch.name, type: "main", index: 0 }]] };
  connections[n.parsearRespuestaSinMatch.name] = { main: [[{ node: n.confianzaAltaSinMatch.name, type: "main", index: 0 }]] };
  connections[n.confianzaAltaSinMatch.name] = {
    main: [
      [{ node: n.guardarEnConocimientoLibreSinMatch.name, type: "main", index: 0 }],
      [{ node: n.finConfianzaBajaSinMatch.name, type: "main", index: 0 }],
    ],
  };
  connections[n.guardarEnConocimientoLibreSinMatch.name] = { main: [[{ node: n.marcarPendienteSinMatchRespondida.name, type: "main", index: 0 }]] };
  connections[n.marcarPendienteSinMatchRespondida.name] = { main: [[{ node: n.fueNotaPrivadaSinMatch.name, type: "main", index: 0 }]] };
  connections[n.fueNotaPrivadaSinMatch.name] = {
    main: [
      [{ node: n.enviarRespuestaClienteSinMatch.name, type: "main", index: 0 }],
      [{ node: n.finEquipoYaRespondioDirectoSinMatch.name, type: "main", index: 0 }],
    ],
  };
  connections[n.enviarRespuestaClienteSinMatch.name] = { main: [[{ node: n.finAprendizajeSinMatchEnviado.name, type: "main", index: 0 }]] };

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
