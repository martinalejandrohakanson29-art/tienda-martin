// Fase 3: cuando no hay dato de compatibilidad del kit pineado, se le pregunta
// al equipo en privado (nota privada de Chatwoot, conversacional) y cuando
// responde, se interpreta con IA y se guarda para siempre en compatibilidades
// (con kit_id real). Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fase3-escalado-equipo_2026-08-13.json", import.meta.url);

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
  // --- Rama de escalado ---

  const yaHayPreguntaPendiente = {
    parameters: {
      operation: "executeQuery",
      query:
        "SELECT id FROM preguntas_tecnicas_pendientes\nWHERE conversation_id = {{ $('Webhook1').item.json.body.conversation.messages[0].conversation_id }}\n  AND kit_id = {{ $('Parsear Pregunta Compatibilidad').item.json.kit_id }}\n  AND estado = 'pendiente'\n  AND rm_modelo_ok(modelo_moto, '{{ $('Parsear Pregunta Compatibilidad').item.json.modelo_moto_sql }}')\nLIMIT 1;",
      options: {},
    },
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [6370, 500],
    id: id(),
    name: "¿Ya Hay Pregunta Pendiente?",
    alwaysOutputData: true,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    credentials: POSTGRES_CRED,
  };

  const yaExiste = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [
          {
            id: id(),
            leftValue: "={{ $json.id !== undefined }}",
            rightValue: true,
            operator: { type: "boolean", operation: "equals" },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [6640, 500],
    id: id(),
    name: "¿Ya Existe Pendiente?",
  };

  const registrarPreguntaPendiente = {
    parameters: {
      operation: "executeQuery",
      query:
        "INSERT INTO preguntas_tecnicas_pendientes (conversation_id, kit_id, modelo_moto, kit, pregunta_original)\nVALUES (\n  {{ $('Webhook1').item.json.body.conversation.messages[0].conversation_id }},\n  {{ $('Parsear Pregunta Compatibilidad').item.json.kit_id }},\n  '{{ $('Parsear Pregunta Compatibilidad').item.json.modelo_moto_sql }}',\n  '{{ $('Parsear Pregunta Compatibilidad').item.json.kit_nombre.replace(/'/g, \"''\") }}',\n  '{{ $('Unir Mensajes').item.json.texto_completo.replace(/'/g, \"''\") }}'\n);",
      options: {},
    },
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [6910, 580],
    id: id(),
    name: "Registrar Pregunta Pendiente",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    credentials: POSTGRES_CRED,
  };

  const prepararNotaEscalado = {
    parameters: {
      assignments: {
        assignments: [
          {
            id: id(),
            name: "motivo",
            value:
              "=El cliente está preguntando si el *{{ $('Parsear Pregunta Compatibilidad').item.json.kit_nombre }}* es compatible con su *{{ $('Parsear Pregunta Compatibilidad').item.json.modelo_moto }}*. Todavía no tenemos ese dato cargado — respondé acá mismo (es privado, el cliente no lo ve) si es compatible o no, y con qué detalle. En cuanto contestes se lo paso al cliente y queda guardado para la próxima vez que pregunten lo mismo.",
            type: "string",
          },
        ],
      },
      includeOtherFields: false,
      options: {},
    },
    type: "n8n-nodes-base.set",
    typeVersion: 3.4,
    position: [7180, 580],
    id: id(),
    name: "Preparar Nota Escalado",
  };

  const enviarNotaEscalado = {
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
    position: [7450, 580],
    id: id(),
    name: "Enviar Nota Escalado",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    onError: "continueErrorOutput",
  };

  const finEscaladoAEquipo = {
    parameters: {},
    type: "n8n-nodes-base.noOp",
    typeVersion: 1,
    position: [7720, 580],
    id: id(),
    name: "Fin - Escalado a Equipo",
  };

  // --- Rama de respuesta del equipo ---

  const esRespuestaDeMiEquipo = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
        conditions: [
          {
            id: id(),
            leftValue: "={{ $json.body.message_type }}",
            rightValue: "outgoing",
            operator: { type: "string", operation: "equals" },
          },
          {
            id: id(),
            leftValue: "={{ $json.body.sender.type }}",
            rightValue: "user",
            operator: { type: "string", operation: "equals" },
          },
          {
            id: id(),
            leftValue: "={{ $json.body.sender.id }}",
            rightValue: "={{ $('Config Chatwoot').item.json.chatwoot_bot_user_id }}",
            operator: { type: "number", operation: "notEquals" },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [1120, 500],
    id: id(),
    name: "¿Es Respuesta de Mi Equipo?",
  };

  const buscarPreguntasPendientes = {
    parameters: {
      operation: "executeQuery",
      query:
        "SELECT COALESCE(json_agg(json_build_object('id', id, 'kit_id', kit_id, 'kit', kit, 'modelo_moto', modelo_moto, 'pregunta_original', pregunta_original) ORDER BY creado_en ASC), '[]'::json) AS pendientes\nFROM preguntas_tecnicas_pendientes\nWHERE conversation_id = {{ $('Webhook1').item.json.body.conversation.messages[0].conversation_id }} AND estado = 'pendiente';",
      options: {},
    },
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [1408, 500],
    id: id(),
    name: "Buscar Preguntas Pendientes",
    alwaysOutputData: true,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    credentials: POSTGRES_CRED,
  };

  const hayPreguntaPendiente = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [
          {
            id: id(),
            leftValue: "={{ Array.isArray($json.pendientes) && $json.pendientes.length > 0 }}",
            rightValue: true,
            operator: { type: "boolean", operation: "equals" },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [1680, 500],
    id: id(),
    name: "¿Hay Pregunta Pendiente?",
  };

  const interpretarRespuestaEquipo = {
    parameters: {
      promptType: "define",
      text: "=Preguntas tecnicas pendientes en esta conversacion (JSON): {{ JSON.stringify($json.pendientes) }}\n\nRespuesta del equipo: {{ $('Webhook1').item.json.body.content }}",
      options: {
        systemMessage:
          '=Sos parte de un sistema que ayuda a un equipo de venta de repuestos de moto a responder preguntas tecnicas de compatibilidad. Te paso una lista de preguntas pendientes de esta conversacion (cada una con id, kit, modelo_moto) y la respuesta que acaba de escribir un miembro del equipo, en lenguaje natural y libre.\n\nDeterminá a cuál pregunta pendiente responde, y qué dijo. Respondé UNICAMENTE con un JSON valido, sin texto adicional, con este formato exacto:\n{"pregunta_id": numero o null, "compatible": true o false o null, "detalle": "...", "mensaje_cliente": "...", "confianza": "alta" o "baja"}\n\n- Si hay una sola pregunta pendiente y la respuesta es plausiblemente sobre ella, usá su id.\n- Si hay varias preguntas pendientes y no queda claro a cual responde, "pregunta_id": null y "confianza": "baja".\n- "compatible" es true si el equipo confirma que anda/sirve/entra, false si dice que no. Si no queda claro, null y "confianza": "baja".\n- "detalle" es cualquier aclaracion util que haya dado el equipo (ej. que hay que cambiar una pieza, que hay dos variantes, etc.), o string vacio si no agrego nada.\n- "mensaje_cliente" es un mensaje corto y natural, listo para mandarle al cliente, contando lo que contesto el equipo (nunca inventes datos que el equipo no dijo).\n- "confianza": "alta" SOLO si quedo claro a que pregunta responde Y si es compatible o no. Cualquier otra situacion (ambiguo, no es realmente una respuesta tecnica, etc.) es "baja" — en ese caso no hace falta completar bien los demas campos.',
      },
    },
    type: "@n8n/n8n-nodes-langchain.agent",
    typeVersion: 2,
    position: [1950, 500],
    id: id(),
    name: "Interpretar Respuesta Equipo",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
  };

  const deepseekInterpretacion = {
    parameters: {
      model: "deepseek-v4-flash",
      options: { temperature: 0, timeout: 25000, maxRetries: 2 },
    },
    type: "@n8n/n8n-nodes-langchain.lmChatDeepSeek",
    typeVersion: 1,
    position: [1950, 700],
    id: id(),
    name: "DeepSeek Chat Model - Interpretacion",
    credentials: DEEPSEEK_CRED,
  };

  const parsearRespuestaEquipo = {
    parameters: {
      jsCode:
        "let preguntaId = null, compatible = null, detalle = '', mensajeCliente = '', confianza = 'baja';\n" +
        "try {\n" +
        "  const raw = ($json.output || '{}').toString().trim();\n" +
        "  const clean = raw.replace(/```json|```/g, '').trim();\n" +
        "  const parsed = JSON.parse(clean);\n" +
        "  preguntaId = parsed.pregunta_id ?? null;\n" +
        "  compatible = typeof parsed.compatible === 'boolean' ? parsed.compatible : null;\n" +
        "  detalle = (parsed.detalle || '').toString();\n" +
        "  mensajeCliente = (parsed.mensaje_cliente || '').toString();\n" +
        "  confianza = parsed.confianza === 'alta' ? 'alta' : 'baja';\n" +
        "} catch (e) {}\n\n" +
        "const pendientes = $('Buscar Preguntas Pendientes').item.json.pendientes || [];\n" +
        "let match = pendientes.find((p) => p.id === preguntaId) || null;\n" +
        "if (!match && pendientes.length === 1) match = pendientes[0];\n" +
        "if (!match || compatible === null || !mensajeCliente) confianza = 'baja';\n\n" +
        "const escapar = (s) => (s || '').toString().replace(/'/g, \"''\");\n\n" +
        "return [{\n" +
        "  json: {\n" +
        "    confianza,\n" +
        "    pregunta_id: match ? match.id : null,\n" +
        "    kit_id: match ? match.kit_id : null,\n" +
        "    kit_sql: match ? escapar(match.kit) : '',\n" +
        "    modelo_moto_sql: match ? escapar(match.modelo_moto) : '',\n" +
        "    compatible,\n" +
        "    detalle_sql: escapar(detalle),\n" +
        "    mensaje_cliente: mensajeCliente,\n" +
        "  },\n" +
        "}];\n",
    },
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [2220, 500],
    id: id(),
    name: "Parsear Respuesta Equipo",
  };

  const confianzaAlta = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
        conditions: [
          {
            id: id(),
            leftValue: "={{ $json.confianza }}",
            rightValue: "alta",
            operator: { type: "string", operation: "equals" },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [2490, 500],
    id: id(),
    name: "¿Confianza Alta?",
  };

  const finConfianzaBaja = {
    parameters: {},
    type: "n8n-nodes-base.noOp",
    typeVersion: 1,
    position: [2760, 700],
    id: id(),
    name: "Fin - Confianza Baja (no se actua)",
  };

  const guardarEnCompatibilidades = {
    parameters: {
      operation: "executeQuery",
      query:
        "INSERT INTO compatibilidades (modelo_moto, kit, kit_id, compatible, detalle, fuente)\nVALUES ('{{ $json.modelo_moto_sql }}', '{{ $json.kit_sql }}', {{ $json.kit_id }}, {{ $json.compatible }}, '{{ $json.detalle_sql }}', 'equipo');",
      options: {},
    },
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [2760, 400],
    id: id(),
    name: "Guardar en Compatibilidades",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    credentials: POSTGRES_CRED,
  };

  const marcarPreguntaRespondida = {
    parameters: {
      operation: "executeQuery",
      query: "UPDATE preguntas_tecnicas_pendientes SET estado = 'respondida' WHERE id = {{ $('Parsear Respuesta Equipo').item.json.pregunta_id }};",
      options: {},
    },
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [3030, 400],
    id: id(),
    name: "Marcar Pregunta Respondida",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    credentials: POSTGRES_CRED,
  };

  const fueNotaPrivada = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
        conditions: [
          {
            id: id(),
            leftValue: "={{ !!$('Webhook1').item.json.body.private }}",
            rightValue: true,
            operator: { type: "boolean", operation: "equals" },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [3300, 400],
    id: id(),
    name: "¿Fue Nota Privada?",
  };

  const finEquipoYaRespondioDirecto = {
    parameters: {},
    type: "n8n-nodes-base.noOp",
    typeVersion: 1,
    position: [3570, 600],
    id: id(),
    name: "Fin - Equipo Ya Respondio Directo",
  };

  const enviarRespuestaClienteAprendizaje = {
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
        "={{ JSON.stringify({ conversation_id: $('Webhook1').item.json.body.conversation.messages[0].conversation_id, account_id: $('Webhook1').item.json.body.account.id, content: $('Parsear Respuesta Equipo').item.json.mensaje_cliente, origen: 'aprendizaje_compatibilidad_2_0', contacto: ($('Webhook1').item.json.body.conversation?.meta?.sender?.name || ''), foto_url: null }) }}",
      options: { timeout: 20000 },
    },
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [3570, 400],
    id: id(),
    name: "Enviar Respuesta al Cliente (Aprendizaje)",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
  };

  const finAprendizajeEnviado = {
    parameters: {},
    type: "n8n-nodes-base.noOp",
    typeVersion: 1,
    position: [3840, 400],
    id: id(),
    name: "Fin - Aprendizaje Enviado",
  };

  return {
    yaHayPreguntaPendiente, yaExiste, registrarPreguntaPendiente, prepararNotaEscalado,
    enviarNotaEscalado, finEscaladoAEquipo,
    esRespuestaDeMiEquipo, buscarPreguntasPendientes, hayPreguntaPendiente,
    interpretarRespuestaEquipo, deepseekInterpretacion, parsearRespuestaEquipo,
    confianzaAlta, finConfianzaBaja, guardarEnCompatibilidades, marcarPreguntaRespondida,
    fueNotaPrivada, finEquipoYaRespondioDirecto, enviarRespuestaClienteAprendizaje, finAprendizajeEnviado,
  };
}

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const configChatwoot = wf.nodes.find((n) => n.name === "Config Chatwoot");
  if (!configChatwoot) throw new Error('No se encontro el nodo "Config Chatwoot"');
  const finNoEsEntranteNode = wf.nodes.find((n) => n.name === "Fin - No es Entrante");
  if (!finNoEsEntranteNode) throw new Error('No se encontro el nodo "Fin - No es Entrante"');
  const finSinMatchNode = wf.nodes.find((n) => n.name === "Fin - Sin Match (todavia sin manejar)");
  if (!finSinMatchNode) throw new Error('No se encontro el nodo "Fin - Sin Match (todavia sin manejar)"');

  // Extender Config Chatwoot con chatwoot_api y chatwoot_bot_user_id (aditivo).
  configChatwoot.parameters.assignments.assignments.push(
    { id: id(), name: "chatwoot_api", value: "https://chat.revolucionmotos.tech/api/v1", type: "string" },
    { id: id(), name: "chatwoot_bot_user_id", value: 2, type: "number" },
    { id: id(), name: "chatwoot_token", value: "={{ $env.CHATWOOT_API_TOKEN }}", type: "string" }
  );

  const n = buildNodes();
  const newNodes = [
    n.yaHayPreguntaPendiente, n.yaExiste, n.registrarPreguntaPendiente, n.prepararNotaEscalado,
    n.enviarNotaEscalado, n.finEscaladoAEquipo,
    n.esRespuestaDeMiEquipo, n.buscarPreguntasPendientes, n.hayPreguntaPendiente,
    n.interpretarRespuestaEquipo, n.deepseekInterpretacion, n.parsearRespuestaEquipo,
    n.confianzaAlta, n.finConfianzaBaja, n.guardarEnCompatibilidades, n.marcarPreguntaRespondida,
    n.fueNotaPrivada, n.finEquipoYaRespondioDirecto, n.enviarRespuestaClienteAprendizaje, n.finAprendizajeEnviado,
  ];

  const nodes = [...wf.nodes, ...newNodes];
  const connections = JSON.parse(JSON.stringify(wf.connections));

  // --- Enganchar rama de escalado en el "no" de ¿Hay Dato de Compatibilidad? ---
  connections["¿Hay Dato de Compatibilidad?"].main[1] = [{ node: n.yaHayPreguntaPendiente.name, type: "main", index: 0 }];

  connections[n.yaHayPreguntaPendiente.name] = { main: [[{ node: n.yaExiste.name, type: "main", index: 0 }]] };
  connections[n.yaExiste.name] = {
    main: [
      [{ node: finSinMatchNode.name, type: "main", index: 0 }],
      [{ node: n.registrarPreguntaPendiente.name, type: "main", index: 0 }],
    ],
  };
  connections[n.registrarPreguntaPendiente.name] = { main: [[{ node: n.prepararNotaEscalado.name, type: "main", index: 0 }]] };
  connections[n.prepararNotaEscalado.name] = { main: [[{ node: n.enviarNotaEscalado.name, type: "main", index: 0 }]] };
  connections[n.enviarNotaEscalado.name] = { main: [[{ node: n.finEscaladoAEquipo.name, type: "main", index: 0 }]] };

  // --- Enganchar rama de respuesta del equipo en el "no" de Es mensaje entrante ---
  connections["Es mensaje entrante"].main[1] = [{ node: n.esRespuestaDeMiEquipo.name, type: "main", index: 0 }];

  connections[n.esRespuestaDeMiEquipo.name] = {
    main: [
      [{ node: n.buscarPreguntasPendientes.name, type: "main", index: 0 }],
      [{ node: finNoEsEntranteNode.name, type: "main", index: 0 }],
    ],
  };
  connections[n.buscarPreguntasPendientes.name] = { main: [[{ node: n.hayPreguntaPendiente.name, type: "main", index: 0 }]] };
  connections[n.hayPreguntaPendiente.name] = {
    main: [
      [{ node: n.interpretarRespuestaEquipo.name, type: "main", index: 0 }],
      [{ node: finNoEsEntranteNode.name, type: "main", index: 0 }],
    ],
  };
  connections[n.deepseekInterpretacion.name] = {
    ai_languageModel: [[{ node: n.interpretarRespuestaEquipo.name, type: "ai_languageModel", index: 0 }]],
  };
  connections[n.interpretarRespuestaEquipo.name] = { main: [[{ node: n.parsearRespuestaEquipo.name, type: "main", index: 0 }]] };
  connections[n.parsearRespuestaEquipo.name] = { main: [[{ node: n.confianzaAlta.name, type: "main", index: 0 }]] };
  connections[n.confianzaAlta.name] = {
    main: [
      [{ node: n.guardarEnCompatibilidades.name, type: "main", index: 0 }],
      [{ node: n.finConfianzaBaja.name, type: "main", index: 0 }],
    ],
  };
  connections[n.guardarEnCompatibilidades.name] = { main: [[{ node: n.marcarPreguntaRespondida.name, type: "main", index: 0 }]] };
  connections[n.marcarPreguntaRespondida.name] = { main: [[{ node: n.fueNotaPrivada.name, type: "main", index: 0 }]] };
  connections[n.fueNotaPrivada.name] = {
    main: [
      [{ node: n.enviarRespuestaClienteAprendizaje.name, type: "main", index: 0 }],
      [{ node: n.finEquipoYaRespondioDirecto.name, type: "main", index: 0 }],
    ],
  };
  connections[n.enviarRespuestaClienteAprendizaje.name] = { main: [[{ node: n.finAprendizajeEnviado.name, type: "main", index: 0 }]] };

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
