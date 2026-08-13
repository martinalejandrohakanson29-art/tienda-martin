// Fase 2: pinear el kit al matchear plantilla exacta, y responder preguntas de
// compatibilidad del kit pineado usando el kit_id real (Fase 1). Si no hay dato
// o no aplica, cae en el mismo "Fin - Sin Match" de siempre (sin regresion).
// Aplicado sobre el workflow "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg) via API.
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fase2-pin-compatibilidad_2026-08-12.json", import.meta.url);

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
const POSTGRES_CRED = { postgres: { id: "65YYZNhTfBBheEpo", name: "Postgres account" } };
const DEEPSEEK_CRED = { deepSeekApi: { id: "6uiYD2nzluzyDXnZ", name: "DeepSeek account" } };

const SESSION_ID_EXPR =
  "($('Webhook1').item.json.body.conversation.messages[0].sender.phone_number || ('conv-' + $('Webhook1').item.json.body.conversation.messages[0].conversation_id))";

function id() { return randomUUID(); }

function buildNodes() {
  const marcarKitPineado = {
    parameters: {
      operation: "set",
      key: `=kit_pineado:{{ ${SESSION_ID_EXPR} }}`,
      value: "={{ JSON.stringify({ kit_id: $json.kit_id, kit_nombre: $json.kit_nombre }) }}",
      expire: true,
      ttl: 43200,
    },
    type: "n8n-nodes-base.redis",
    typeVersion: 1,
    position: [4480, -650],
    id: id(),
    name: "Marcar Kit Pineado",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 1000,
    credentials: REDIS_CRED,
  };

  const leerKitPineado = {
    parameters: {
      operation: "get",
      propertyName: "kit_pineado_raw",
      key: `=kit_pineado:{{ ${SESSION_ID_EXPR} }}`,
      options: {},
    },
    type: "n8n-nodes-base.redis",
    typeVersion: 1,
    position: [4480, 300],
    id: id(),
    name: "Leer Kit Pineado",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 1000,
    credentials: REDIS_CRED,
  };

  const hayKitPineado = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [
          {
            id: id(),
            leftValue: "={{ $json.kit_pineado_raw }}",
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
    position: [4750, 300],
    id: id(),
    name: "¿Hay Kit Pineado?",
  };

  const parsearKitPineado = {
    parameters: {
      jsCode:
        "let kitId = null, kitNombre = '';\n" +
        "try {\n" +
        "  const raw = $json.kit_pineado_raw || '{}';\n" +
        "  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;\n" +
        "  kitId = parsed.kit_id ?? null;\n" +
        "  kitNombre = (parsed.kit_nombre || '').toString();\n" +
        "} catch (e) {}\n" +
        "return [{ json: { kit_id: kitId, kit_nombre: kitNombre } }];\n",
    },
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [5020, 220],
    id: id(),
    name: "Parsear Kit Pineado",
  };

  const refrescarKitPineado = {
    parameters: {
      operation: "set",
      key: `=kit_pineado:{{ ${SESSION_ID_EXPR} }}`,
      value: "={{ JSON.stringify({ kit_id: $json.kit_id, kit_nombre: $json.kit_nombre }) }}",
      expire: true,
      ttl: 43200,
    },
    type: "n8n-nodes-base.redis",
    typeVersion: 1,
    position: [5290, 420],
    id: id(),
    name: "Refrescar Kit Pineado",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 1000,
    credentials: REDIS_CRED,
  };

  const extraerPreguntaCompatibilidad = {
    parameters: {
      promptType: "define",
      text: "=Mensaje del cliente: {{ $('Unir Mensajes').item.json.texto_completo }}",
      options: {
        systemMessage:
          '=El cliente ya esta hablando sobre el kit "{{ $json.kit_nombre }}". Del mensaje del cliente, determina si esta preguntando por la compatibilidad de ESE kit con un modelo de moto puntual (por ejemplo: si anda, si sirve, si entra, si es compatible). Respondé UNICAMENTE con un JSON valido, sin texto adicional, con este formato exacto:\n{"es_compatibilidad": true o false, "modelo_moto": "..."}\n\nes_compatibilidad debe ser true SOLO si la pregunta es explicitamente sobre si el kit anda/sirve/entra/es compatible con una moto puntual. Cualquier otra cosa (precio, envio, saludo, agradecimiento, u otro tema) es false.\n\nmodelo_moto es el modelo de moto que menciona, tal cual lo escribio. Si no menciona ningun modelo con claridad, dejalo como string vacio "". No inventes un modelo que no este en el mensaje.',
      },
    },
    type: "@n8n/n8n-nodes-langchain.agent",
    typeVersion: 2,
    position: [5290, 220],
    id: id(),
    name: "Extraer Pregunta Compatibilidad",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
  };

  const deepseekCompatibilidad = {
    parameters: {
      model: "deepseek-v4-flash",
      options: { temperature: 0, timeout: 25000, maxRetries: 2 },
    },
    type: "@n8n/n8n-nodes-langchain.lmChatDeepSeek",
    typeVersion: 1,
    position: [5290, 420],
    id: id(),
    name: "DeepSeek Chat Model - Compatibilidad",
    credentials: DEEPSEEK_CRED,
  };
  // Nota: "Refrescar Kit Pineado" y "DeepSeek Chat Model - Compatibilidad" comparten
  // posicion en el canvas por simplicidad (no afecta funcionamiento), se corrige mas abajo.
  deepseekCompatibilidad.position = [5290, 560];

  const parsearPreguntaCompatibilidad = {
    parameters: {
      jsCode:
        "let esCompatibilidad = false, modeloMoto = '';\n" +
        "try {\n" +
        "  const raw = ($json.output || '{}').toString().trim();\n" +
        "  const clean = raw.replace(/```json|```/g, '').trim();\n" +
        "  const parsed = JSON.parse(clean);\n" +
        "  esCompatibilidad = parsed.es_compatibilidad === true;\n" +
        "  modeloMoto = (parsed.modelo_moto || '').toString().trim();\n" +
        "} catch (e) {}\n\n" +
        "const escapar = (s) => s.replace(/'/g, \"''\");\n\n" +
        "return [{\n" +
        "  json: {\n" +
        "    es_compatibilidad: esCompatibilidad,\n" +
        "    modelo_moto: modeloMoto,\n" +
        "    modelo_moto_sql: escapar(modeloMoto),\n" +
        "    kit_id: $('Parsear Kit Pineado').item.json.kit_id,\n" +
        "    kit_nombre: $('Parsear Kit Pineado').item.json.kit_nombre,\n" +
        "  }\n" +
        "}];\n",
    },
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [5560, 220],
    id: id(),
    name: "Parsear Pregunta Compatibilidad",
  };

  const esCompatibilidadConModelo = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
        conditions: [
          {
            id: id(),
            leftValue: "={{ $json.es_compatibilidad }}",
            rightValue: true,
            operator: { type: "boolean", operation: "equals" },
          },
          {
            id: id(),
            leftValue: "={{ $json.modelo_moto }}",
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
    position: [5830, 220],
    id: id(),
    name: "¿Es Compatibilidad Con Modelo?",
  };

  const buscarCompatibilidadDelKit = {
    parameters: {
      operation: "executeQuery",
      query:
        "SELECT compatible, detalle\nFROM compatibilidades\nWHERE kit_id = {{ $json.kit_id }}\n  AND rm_modelo_ok(modelo_moto, '{{ $json.modelo_moto_sql }}')\nORDER BY creado_en DESC\nLIMIT 1;",
      options: {},
    },
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [6100, 220],
    id: id(),
    name: "Buscar Compatibilidad del Kit",
    alwaysOutputData: true,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    credentials: POSTGRES_CRED,
  };

  const hayDatoDeCompatibilidad = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [
          {
            id: id(),
            leftValue: "={{ $json.compatible !== undefined }}",
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
    position: [6370, 220],
    id: id(),
    name: "¿Hay Dato de Compatibilidad?",
  };

  const prepararRespuestaCompatibilidad = {
    parameters: {
      assignments: {
        assignments: [
          {
            id: id(),
            name: "content",
            value:
              "={{ ($json.compatible ? ('Sí, el ' + $('Parsear Pregunta Compatibilidad').item.json.kit_nombre + ' es compatible con tu ' + $('Parsear Pregunta Compatibilidad').item.json.modelo_moto + '.') : ('No, el ' + $('Parsear Pregunta Compatibilidad').item.json.kit_nombre + ' no es compatible con tu ' + $('Parsear Pregunta Compatibilidad').item.json.modelo_moto + '.')) + ($json.detalle ? (' ' + $json.detalle) : '') }}",
            type: "string",
          },
        ],
      },
      includeOtherFields: false,
      options: {},
    },
    type: "n8n-nodes-base.set",
    typeVersion: 3.4,
    position: [6640, 220],
    id: id(),
    name: "Preparar Respuesta Compatibilidad",
  };

  const enviarRespuestaCompatibilidad = {
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
        "={{ JSON.stringify({ conversation_id: $('Webhook1').item.json.body.conversation.messages[0].conversation_id, account_id: $('Webhook1').item.json.body.account.id, content: $json.content, origen: 'compatibilidad_kit_2_0', contacto: ($('Webhook1').item.json.body.conversation?.meta?.sender?.name || $('Webhook1').item.json.body.sender?.name || ''), foto_url: null }) }}",
      options: { timeout: 20000 },
    },
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [6910, 220],
    id: id(),
    name: "Enviar Respuesta Compatibilidad",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
  };

  const finCompatibilidadRespondida = {
    parameters: {},
    type: "n8n-nodes-base.noOp",
    typeVersion: 1,
    position: [7180, 220],
    id: id(),
    name: "Fin - Compatibilidad Respondida",
  };

  return {
    marcarKitPineado,
    leerKitPineado,
    hayKitPineado,
    parsearKitPineado,
    refrescarKitPineado,
    extraerPreguntaCompatibilidad,
    deepseekCompatibilidad,
    parsearPreguntaCompatibilidad,
    esCompatibilidadConModelo,
    buscarCompatibilidadDelKit,
    hayDatoDeCompatibilidad,
    prepararRespuestaCompatibilidad,
    enviarRespuestaCompatibilidad,
    finCompatibilidadRespondida,
  };
}

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const finSinMatchNode = wf.nodes.find((n) => n.name === "Fin - Sin Match (todavia sin manejar)");
  if (!finSinMatchNode) throw new Error('No se encontro el nodo "Fin - Sin Match (todavia sin manejar)"');

  const n = buildNodes();
  const newNodes = [
    n.marcarKitPineado,
    n.leerKitPineado,
    n.hayKitPineado,
    n.parsearKitPineado,
    n.refrescarKitPineado,
    n.extraerPreguntaCompatibilidad,
    n.deepseekCompatibilidad,
    n.parsearPreguntaCompatibilidad,
    n.esCompatibilidadConModelo,
    n.buscarCompatibilidadDelKit,
    n.hayDatoDeCompatibilidad,
    n.prepararRespuestaCompatibilidad,
    n.enviarRespuestaCompatibilidad,
    n.finCompatibilidadRespondida,
  ];

  const nodes = [...wf.nodes, ...newNodes];

  const connections = JSON.parse(JSON.stringify(wf.connections));

  // Rama "Kit" del switch: agregar Marcar Kit Pineado en paralelo a Enviar Saludo Kit.
  connections["Ruteo Clasificacion"].main[0].push({ node: n.marcarKitPineado.name, type: "main", index: 0 });

  // Rama "Sin Match" del switch: interceptar antes de "Fin - Sin Match" (se mantiene como
  // destino final de todas las ramas negativas, sin tocar el nodo en si).
  connections["Ruteo Clasificacion"].main[2] = [{ node: n.leerKitPineado.name, type: "main", index: 0 }];

  connections[n.leerKitPineado.name] = { main: [[{ node: n.hayKitPineado.name, type: "main", index: 0 }]] };

  connections[n.hayKitPineado.name] = {
    main: [
      [{ node: n.parsearKitPineado.name, type: "main", index: 0 }],
      [{ node: finSinMatchNode.name, type: "main", index: 0 }],
    ],
  };

  connections[n.parsearKitPineado.name] = {
    main: [
      [
        { node: n.refrescarKitPineado.name, type: "main", index: 0 },
        { node: n.extraerPreguntaCompatibilidad.name, type: "main", index: 0 },
      ],
    ],
  };

  connections[n.deepseekCompatibilidad.name] = {
    ai_languageModel: [[{ node: n.extraerPreguntaCompatibilidad.name, type: "ai_languageModel", index: 0 }]],
  };

  connections[n.extraerPreguntaCompatibilidad.name] = {
    main: [[{ node: n.parsearPreguntaCompatibilidad.name, type: "main", index: 0 }]],
  };

  connections[n.parsearPreguntaCompatibilidad.name] = {
    main: [[{ node: n.esCompatibilidadConModelo.name, type: "main", index: 0 }]],
  };

  connections[n.esCompatibilidadConModelo.name] = {
    main: [
      [{ node: n.buscarCompatibilidadDelKit.name, type: "main", index: 0 }],
      [{ node: finSinMatchNode.name, type: "main", index: 0 }],
    ],
  };

  connections[n.buscarCompatibilidadDelKit.name] = {
    main: [[{ node: n.hayDatoDeCompatibilidad.name, type: "main", index: 0 }]],
  };

  connections[n.hayDatoDeCompatibilidad.name] = {
    main: [
      [{ node: n.prepararRespuestaCompatibilidad.name, type: "main", index: 0 }],
      [{ node: finSinMatchNode.name, type: "main", index: 0 }],
    ],
  };

  connections[n.prepararRespuestaCompatibilidad.name] = {
    main: [[{ node: n.enviarRespuestaCompatibilidad.name, type: "main", index: 0 }]],
  };

  connections[n.enviarRespuestaCompatibilidad.name] = {
    main: [[{ node: n.finCompatibilidadRespondida.name, type: "main", index: 0 }]],
  };

  const allowedSettingsKeys = [
    "saveExecutionProgress",
    "saveManualExecutions",
    "saveDataErrorExecution",
    "saveDataSuccessExecution",
    "executionTimeout",
    "errorWorkflow",
    "timezone",
    "executionOrder",
  ];
  const settings = Object.fromEntries(
    Object.entries(wf.settings || {}).filter(([k]) => allowedSettingsKeys.includes(k))
  );

  const body = {
    name: wf.name,
    nodes,
    connections,
    settings,
  };

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: JSON.stringify(body) });
  console.log("Actualizado. Nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const fresh = await api(`/workflows/${WORKFLOW_ID}`);
  console.log("Verificacion GET post-update. Nodos:", fresh.nodes.length, "| activo:", fresh.active);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
