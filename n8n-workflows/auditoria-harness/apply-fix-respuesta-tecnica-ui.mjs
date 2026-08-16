// Rama nueva, aditiva, dentro de la respuesta del equipo a una pendiente TÉCNICA
// (Fase 3): si la nota privada que llega trae la marca fija que arma la UI nueva
// de /admin/chatwoot/pendientes ([[RM_TECNICA:id=N;compatible=true|false]] + texto
// libre de aclaración), un paso nuevo sin IA la interpreta directo -- sin pasar
// por "Interpretar Respuesta Equipo" (DeepSeek) -- y guarda en `compatibilidades`
// EXACTAMENTE lo que se eligió en la UI (compatible + aclaración), sin que el
// modelo repita datos redundantes (ej. "110", "recorrido corto" en cada fila de
// un kit que ya es 100% 110cc / recorrido corto).
//
// Notas escritas a mano en Chatwoot (sin la marca) siguen yendo por el camino
// viejo con IA, sin ningún cambio -- el único nodo existente que se toca es
// "¿Hay Pregunta Pendiente?", y solo para insertar el chequeo de la marca antes
// de "Interpretar Respuesta Equipo" (que sigue siendo el destino final si no hay
// marca). Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.APIKEY_N8N || process.env.API_KEY_N8N;
if (!API_KEY) throw new Error("Falta APIKEY_N8N / API_KEY_N8N en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-respuesta-tecnica-ui_2026-08-16.json", import.meta.url);

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

function buildNodes() {
  const esRespuestaEstructuradaUI = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [
          {
            id: id(),
            leftValue: "={{ ($('Webhook1').item.json.body.content || '').trim().startsWith('[[RM_TECNICA:') }}",
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
    position: [1950, 900],
    id: id(),
    name: "¿Es Respuesta Estructurada UI?",
  };

  const parsearRespuestaEstructuradaUI = {
    parameters: {
      jsCode:
        "let preguntaId = null, compatible = null, detalle = '';\n" +
        "try {\n" +
        "  const raw = ($('Webhook1').item.json.body.content || '').toString();\n" +
        "  const m = raw.match(/^\\[\\[RM_TECNICA:id=(\\d+);compatible=(true|false)\\]\\]/);\n" +
        "  if (m) {\n" +
        "    preguntaId = Number(m[1]);\n" +
        "    compatible = m[2] === 'true';\n" +
        "    detalle = raw.slice(m[0].length).trim();\n" +
        "  }\n" +
        "} catch (e) {}\n\n" +
        "const pendientes = $('Buscar Preguntas Pendientes').item.json.pendientes || [];\n" +
        "const match = pendientes.find((p) => p.id === preguntaId) || null;\n" +
        "const valido = !!match && compatible !== null;\n\n" +
        "const escapar = (s) => (s || '').toString().replace(/'/g, \"''\");\n" +
        "const modeloMoto = match ? match.modelo_moto : '';\n" +
        "const mensajeCliente = valido\n" +
        "  ? (compatible ? ('Sí, el kit es compatible con tu ' + modeloMoto) : ('No, el kit no es compatible con tu ' + modeloMoto)) + (detalle ? (', ' + detalle) : '') + '.'\n" +
        "  : '';\n\n" +
        "return [{\n" +
        "  json: {\n" +
        "    valido,\n" +
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
    position: [2220, 900],
    id: id(),
    name: "Parsear Respuesta Estructurada UI",
  };

  const datoValidoUI = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
        conditions: [
          {
            id: id(),
            leftValue: "={{ $json.valido }}",
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
    position: [2490, 900],
    id: id(),
    name: "¿Dato Válido UI?",
  };

  const finMarcaUIInvalida = {
    parameters: {},
    type: "n8n-nodes-base.noOp",
    typeVersion: 1,
    position: [2760, 1050],
    id: id(),
    name: "Fin - Marca UI Invalida",
  };

  const guardarEnCompatibilidadesUI = {
    parameters: {
      operation: "executeQuery",
      query:
        "INSERT INTO compatibilidades (modelo_moto, kit, kit_id, compatible, detalle, fuente)\nVALUES ('{{ $json.modelo_moto_sql }}', '{{ $json.kit_sql }}', {{ $json.kit_id }}, {{ $json.compatible }}, '{{ $json.detalle_sql }}', 'admin');",
      options: {},
    },
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [2760, 900],
    id: id(),
    name: "Guardar en Compatibilidades (UI)",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    credentials: POSTGRES_CRED,
  };

  const marcarPreguntaRespondidaUI = {
    parameters: {
      operation: "executeQuery",
      query:
        "UPDATE preguntas_tecnicas_pendientes SET estado = 'respondida' WHERE id = {{ $('Parsear Respuesta Estructurada UI').item.json.pregunta_id }};",
      options: {},
    },
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [3030, 900],
    id: id(),
    name: "Marcar Pregunta Respondida (UI)",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    credentials: POSTGRES_CRED,
  };

  const enviarRespuestaClienteUI = {
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
        "={{ JSON.stringify({ conversation_id: $('Webhook1').item.json.body.conversation.messages[0].conversation_id, account_id: $('Webhook1').item.json.body.account.id, content: $('Parsear Respuesta Estructurada UI').item.json.mensaje_cliente, origen: 'aprendizaje_compatibilidad_ui', contacto: ($('Webhook1').item.json.body.conversation?.meta?.sender?.name || ''), foto_url: null }) }}",
      options: { timeout: 20000 },
    },
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [3300, 900],
    id: id(),
    name: "Enviar Respuesta al Cliente (UI)",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
  };

  const finAprendizajeUIEnviado = {
    parameters: {},
    type: "n8n-nodes-base.noOp",
    typeVersion: 1,
    position: [3570, 900],
    id: id(),
    name: "Fin - Aprendizaje UI Enviado",
  };

  return {
    esRespuestaEstructuradaUI, parsearRespuestaEstructuradaUI, datoValidoUI, finMarcaUIInvalida,
    guardarEnCompatibilidadesUI, marcarPreguntaRespondidaUI, enviarRespuestaClienteUI, finAprendizajeUIEnviado,
  };
}

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const hayPreguntaPendienteNode = wf.nodes.find((n) => n.name === "¿Hay Pregunta Pendiente?");
  if (!hayPreguntaPendienteNode) throw new Error('No se encontro el nodo "¿Hay Pregunta Pendiente?"');
  const interpretarNode = wf.nodes.find((n) => n.name === "Interpretar Respuesta Equipo");
  if (!interpretarNode) throw new Error('No se encontro el nodo "Interpretar Respuesta Equipo"');
  const buscarPendientesNode = wf.nodes.find((n) => n.name === "Buscar Preguntas Pendientes");
  if (!buscarPendientesNode) throw new Error('No se encontro el nodo "Buscar Preguntas Pendientes"');

  const conexionActualHayPregunta = wf.connections["¿Hay Pregunta Pendiente?"];
  const destinoActualTrue = conexionActualHayPregunta?.main?.[0]?.[0]?.node;
  if (destinoActualTrue !== "Interpretar Respuesta Equipo") {
    throw new Error(
      `"¿Hay Pregunta Pendiente?" (true) apunta a "${destinoActualTrue}", no a "Interpretar Respuesta Equipo" -- ` +
      "puede que ya se haya tocado. Revisar a mano antes de seguir."
    );
  }

  const n = buildNodes();
  const newNodes = [
    n.esRespuestaEstructuradaUI, n.parsearRespuestaEstructuradaUI, n.datoValidoUI, n.finMarcaUIInvalida,
    n.guardarEnCompatibilidadesUI, n.marcarPreguntaRespondidaUI, n.enviarRespuestaClienteUI, n.finAprendizajeUIEnviado,
  ];

  const nodes = [...wf.nodes, ...newNodes];
  const connections = JSON.parse(JSON.stringify(wf.connections));

  // Único cambio a una conexión existente: el "true" de ¿Hay Pregunta Pendiente?
  // pasa por el chequeo de marca antes de llegar (eventualmente) a la IA.
  connections["¿Hay Pregunta Pendiente?"].main[0] = [{ node: n.esRespuestaEstructuradaUI.name, type: "main", index: 0 }];

  connections[n.esRespuestaEstructuradaUI.name] = {
    main: [
      [{ node: n.parsearRespuestaEstructuradaUI.name, type: "main", index: 0 }],
      [{ node: interpretarNode.name, type: "main", index: 0 }],
    ],
  };
  connections[n.parsearRespuestaEstructuradaUI.name] = { main: [[{ node: n.datoValidoUI.name, type: "main", index: 0 }]] };
  connections[n.datoValidoUI.name] = {
    main: [
      [{ node: n.guardarEnCompatibilidadesUI.name, type: "main", index: 0 }],
      [{ node: n.finMarcaUIInvalida.name, type: "main", index: 0 }],
    ],
  };
  connections[n.guardarEnCompatibilidadesUI.name] = { main: [[{ node: n.marcarPreguntaRespondidaUI.name, type: "main", index: 0 }]] };
  connections[n.marcarPreguntaRespondidaUI.name] = { main: [[{ node: n.enviarRespuestaClienteUI.name, type: "main", index: 0 }]] };
  connections[n.enviarRespuestaClienteUI.name] = { main: [[{ node: n.finAprendizajeUIEnviado.name, type: "main", index: 0 }]] };

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
