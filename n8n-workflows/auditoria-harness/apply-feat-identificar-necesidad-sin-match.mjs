// Agrega un agente de IA con "libertad acotada" en la rama Sin Match de
// "Ruteo Clasificacion", para reemplazar el problema de fondo diagnosticado
// el 2026-08-17 revisando la cola de /admin/chatwoot/pendientes: la UNICA
// forma que tenia el bot de pinear un kit era el match letra por letra con
// una plantilla de Instagram/Meta Ads (Clasificar Mensaje sin IA). Cualquier
// conversacion que arrancaba con lenguaje natural (ej. "Quería saber el
// precio del kit 120 con tapa CDI") nunca pineaba nada, y cada mensaje
// siguiente de esa charla ("Y precio", "Precio?", "Osea que me sale todo?")
// se evaluaba de cero sin memoria, terminando en preguntas_sin_match_pendientes
// aunque el cliente ya hubiera nombrado el kit.
//
// Diseño acordado con el usuario (ver conversacion, diagrama en Artifact
// "Respuestas Chatwoot 2.0"):
//   1) El chequeo "¿Hay Kit Pineado?" pasa a decidirse ANTES para cualquier
//      mensaje que no matcheo plantilla exacta (Ruteo Clasificacion salida
//      "Sin Match" -> Leer Kit Pineado directo, ya no via "Detectar Interes
//      Generico" primero).
//   2) Si ya hay kit pineado, CERO cambios: sigue el camino de siempre
//      (Parsear Kit Pineado -> Refrescar + Extraer Pregunta Compatibilidad).
//   3) Si NO hay kit pineado, entra el agente nuevo "Identificar Necesidad"
//      -- reemplaza a "Detectar Interes Generico" (que se elimina, su unica
//      salida "generico" pasa a ser un tipo mas de este agente). Ve: el
//      mensaje actual, el historial reciente de la conversacion real
//      (Chatwoot, nuevo nodo "Traer Historial Conversacion"), y la lista
//      CERRADA de kits activos (ya disponible en "Buscar Kits Activos" --
//      no inventa, elige de esa lista o dice "ninguno", mismo criterio que
//      mato el matching por keywords sueltas en su momento).
//   4) Salida estructurada de 4 tipos ("¿Qué Identificó?", switch):
//        - saludo: interes generico sin pedido -> Enviar Saludo Generico
//          (nodo existente, sin cambios)
//        - kit_confiado: pinea el kit (reusa a "Parsear Kit Pineado" con un
//          input sintetico { kit_pineado_raw }, para no duplicar logica rio
//          abajo -- Refrescar Kit Pineado hace el SET real en Redis, no hace
//          falta un nodo Redis nuevo) + manda una confirmacion corta
//          redactada por el mismo agente (nunca repite precio, para no pisar
//          el filtro de "kit_recien_confirmado" en Parsear Sub-preguntas)
//        - candidatos: 2-3 kits posibles, repregunta nombrando las opciones,
//          no pinea nada todavia
//        - ninguno: pedido concreto pero no es ninguno de los kits que
//          vendemos -> Preparar Contexto Sub-preguntas (nodo existente, MISMO
//          camino que ya seguia hoy el caso "sin pin", sin cambios)
//
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { randomUUID } from "crypto";
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL(
  "./workflow_backup_pre-feat-identificar-necesidad-sin-match_2026-08-17.json",
  import.meta.url
);

const RUTEO_NODE = "Ruteo Clasificacion";
const LEER_KIT_PINEADO_NODE = "Leer Kit Pineado";
const HAY_KIT_PINEADO_NODE = "¿Hay Kit Pineado?";
const PARSEAR_KIT_PINEADO_NODE = "Parsear Kit Pineado";
const ENVIAR_SALUDO_GENERICO_NODE = "Enviar Saludo Generico";
const PREPARAR_CONTEXTO_SUBPREGUNTAS_NODE = "Preparar Contexto Sub-preguntas";
const DEEPSEEK_REF_NODE = "DeepSeek Chat Model - Continuidad de Tema"; // para copiar credencial

const OLD_DETECTAR_NODES = [
  "Detectar Interes Generico",
  "DeepSeek Chat Model - Interes Generico",
  "Parsear Interes Generico",
  "¿Es Interes Generico?",
];

const IDENTIFICAR_NODE = "Identificar Necesidad";
const DEEPSEEK_IDENTIFICAR_NODE = "DeepSeek Chat Model - Identificar Necesidad";
const TRAER_HISTORIAL_NODE = "Traer Historial Conversacion";
const FORMATEAR_HISTORIAL_NODE = "Formatear Historial";
const PARSEAR_IDENTIFICAR_NODE = "Parsear Identificar Necesidad";
const SWITCH_IDENTIFICAR_NODE = "¿Qué Identificó?";
const PREPARAR_PIN_NODE = "Preparar Pin desde Identificacion";
const ENVIAR_CONFIRMACION_NODE = "Enviar Confirmacion Kit (Propuesta)";
const FIN_CONFIRMACION_NODE = "Fin - Confirmacion Kit Enviada";
const ENVIAR_REPREGUNTA_NODE = "Enviar Repregunta Candidatos (Propuesta)";
const FIN_REPREGUNTA_NODE = "Fin - Repregunta Enviada";

const IDENTIFICAR_SYSTEM_MESSAGE =
  'El cliente escribio un mensaje que no coincidio letra por letra con ninguna plantilla de kit publicitado, y todavia no hay ningun kit identificado en esta conversacion. Tu trabajo es leer el mensaje actual y el historial reciente de la charla (si lo hay) y decidir a que kit de la lista CERRADA se refiere el cliente -- o si hace falta pedirle que aclare. La lista de kits y el historial vienen en el mensaje del usuario.\n\n' +
  'Respondé ÚNICAMENTE con un JSON válido, sin texto adicional, con este formato exacto:\n' +
  '{"tipo": "saludo" | "kit_confiado" | "candidatos" | "ninguno", "kit_id": numero o null, "candidatos": [{"kit_id": numero, "nombre": "..."}], "mensaje": "..."}\n\n' +
  '- "saludo": interés genérico sin pedido concreto (ej. "quiero mas informacion", "me interesa", un mensaje de un clic en un anuncio que no menciona ningún producto puntual, aunque tenga palabras sueltas de metadata como "Enlace:"). kit_id: null, candidatos: [], mensaje: "".\n' +
  '- "kit_confiado": estás razonablemente seguro de a cuál de los kits de la lista se refiere -- por nombre, alias, o por lo que pide (ej. "kit 220 varillero", "el combo con tapa cdi", "precio del 120 con carbu"), incluso si no usó el nombre exacto, o porque el historial de la charla ya lo dejó claro. kit_id: el id de ESE kit, tiene que ser un id real de la lista, nunca inventado. candidatos: []. mensaje: una confirmación CORTA en primera persona del negocio, en español informal argentino, nombrando el kit SIN repetir el precio ni los detalles (eso lo contesta otro paso después) -- ej. "Dale, el combo de tapa CDI + cilindro 120, ¿no?". Nunca más de una oración.\n' +
  '- "candidatos": el pedido es concreto pero podría ser 2 o 3 kits distintos de la lista y no podés estar seguro de cuál. kit_id: null. candidatos: esos 2 o 3 kits (id + nombre, copiados tal cual de la lista). mensaje: una pregunta corta nombrando esas opciones para que el cliente aclare -- ej. "¿Te referís al kit 120 para 110 o al kit potenciado 220cc?".\n' +
  '- "ninguno": el cliente pide algo concreto (producto, precio, compatibilidad, envío, negocio) pero NO es ninguno de los kits de la lista -- es otro repuesto/producto que no vendemos como kit publicitado, o una pregunta general del negocio. kit_id: null, candidatos: [], mensaje: "".\n\n' +
  'Ante la duda entre "kit_confiado" y "candidatos", preferí "candidatos" -- nunca pinees un kit si no estás realmente seguro. Ante la duda entre "candidatos" y "ninguno" (si ninguno de los kits encaja bien), preferí "ninguno". Nunca inventes un kit_id que no esté en la lista cerrada que te pasaron.';

const FORMATEAR_HISTORIAL_CODE =
  "const kits = $('Buscar Kits Activos').item.json.kits || [];\n" +
  "const listaKits = kits.map((k) => `- id ${k.id}: ${k.nombre}` + (k.keywords ? ` (alias: ${k.keywords})` : '')).join('\\n');\n\n" +
  "const mensajeActual = ($('Unir Mensajes').item.json.texto_completo || '').toString();\n" +
  "const lineasActuales = new Set(mensajeActual.split('\\n').map((l) => l.trim()).filter(Boolean));\n\n" +
  "let historial = '';\n" +
  "try {\n" +
  "  const payload = $json.payload || [];\n" +
  "  const msgs = payload\n" +
  "    .filter((m) => (m.message_type === 0 || m.message_type === 1) && !m.private && (m.content || '').trim())\n" +
  "    .filter((m) => !lineasActuales.has((m.content || '').trim()))\n" +
  "    .slice(-8)\n" +
  "    .map((m) => `${m.message_type === 0 ? 'Cliente' : 'Nosotros'}: ${(m.content || '').trim()}`);\n" +
  "  historial = msgs.join('\\n');\n" +
  "} catch (e) {}\n\n" +
  "const contexto =\n" +
  "  `Kits activos (lista cerrada -- son los UNICOS kits que existen, no hay otros):\\n${listaKits}\\n\\n` +\n" +
  "  `Ultimos mensajes de esta conversacion, del mas viejo al mas nuevo (puede estar vacio si es la primera vez que escribe):\\n${historial || '(sin mensajes previos)'}\\n\\n` +\n" +
  "  `Mensaje actual del cliente:\\n${mensajeActual}`;\n\n" +
  "return [{ json: { contexto_para_ia: contexto } }];\n";

const PARSEAR_IDENTIFICAR_CODE =
  "let tipo = 'ninguno', kitId = null, candidatos = [], mensaje = '';\n" +
  "const kits = $('Buscar Kits Activos').item.json.kits || [];\n" +
  "const idsValidos = new Set(kits.map((k) => k.id));\n" +
  "const kitsById = new Map(kits.map((k) => [k.id, k]));\n\n" +
  "try {\n" +
  "  const raw = ($json.output || '{}').toString().trim();\n" +
  "  const clean = raw.replace(/```json|```/g, '').trim();\n" +
  "  const parsed = JSON.parse(clean);\n\n" +
  "  const tiposValidos = ['saludo', 'kit_confiado', 'candidatos', 'ninguno'];\n" +
  "  tipo = tiposValidos.includes(parsed.tipo) ? parsed.tipo : 'ninguno';\n" +
  "  mensaje = (parsed.mensaje || '').toString().trim();\n\n" +
  "  if (tipo === 'kit_confiado') {\n" +
  "    const id = Number(parsed.kit_id);\n" +
  "    if (idsValidos.has(id)) {\n" +
  "      kitId = id;\n" +
  "    } else {\n" +
  "      tipo = 'ninguno'; // nunca confiar en un id fuera de la lista cerrada\n" +
  "    }\n" +
  "  }\n\n" +
  "  if (tipo === 'candidatos') {\n" +
  "    const cands = (Array.isArray(parsed.candidatos) ? parsed.candidatos : [])\n" +
  "      .map((c) => ({ kit_id: Number(c && c.kit_id), nombre: ((c && c.nombre) || '').toString() }))\n" +
  "      .filter((c) => idsValidos.has(c.kit_id));\n" +
  "    if (cands.length >= 2 && cands.length <= 3) {\n" +
  "      candidatos = cands;\n" +
  "    } else {\n" +
  "      tipo = 'ninguno'; // no vino bien formado, no arriesgar una repregunta rota\n" +
  "    }\n" +
  "  }\n" +
  "} catch (e) {}\n\n" +
  "const kitNombre = kitId !== null ? (kitsById.get(kitId)?.nombre || '') : '';\n\n" +
  "if (tipo === 'kit_confiado' && !mensaje) {\n" +
  "  mensaje = `Dale, es sobre ${kitNombre}, ¿no?`;\n" +
  "}\n" +
  "if (tipo === 'candidatos' && !mensaje) {\n" +
  "  mensaje = `¿Te referís a ${candidatos.map((c) => c.nombre).join(' o a ')}?`;\n" +
  "}\n\n" +
  "return [{ json: { tipo, kit_id: kitId, kit_nombre: kitNombre, candidatos, mensaje } }];\n";

const PREPARAR_PIN_CODE =
  "return [{ json: { kit_pineado_raw: JSON.stringify({ kit_id: $json.kit_id, kit_nombre: $json.kit_nombre }) } }];\n";

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

  const byName = (name) => wf.nodes.find((n) => n.name === name);

  for (const name of [
    RUTEO_NODE, LEER_KIT_PINEADO_NODE, HAY_KIT_PINEADO_NODE, PARSEAR_KIT_PINEADO_NODE,
    ENVIAR_SALUDO_GENERICO_NODE, PREPARAR_CONTEXTO_SUBPREGUNTAS_NODE, DEEPSEEK_REF_NODE,
  ]) {
    if (!byName(name)) throw new Error(`No se encontro el nodo "${name}"`);
  }
  for (const name of OLD_DETECTAR_NODES) {
    if (!byName(name)) throw new Error(`No se encontro el nodo viejo "${name}" a reemplazar -- revisar a mano.`);
  }
  for (const name of [
    IDENTIFICAR_NODE, DEEPSEEK_IDENTIFICAR_NODE, TRAER_HISTORIAL_NODE, FORMATEAR_HISTORIAL_NODE,
    PARSEAR_IDENTIFICAR_NODE, SWITCH_IDENTIFICAR_NODE, PREPARAR_PIN_NODE, ENVIAR_CONFIRMACION_NODE,
    FIN_CONFIRMACION_NODE, ENVIAR_REPREGUNTA_NODE, FIN_REPREGUNTA_NODE,
  ]) {
    if (byName(name)) throw new Error(`El nodo nuevo "${name}" ya existe -- puede que este fix ya se haya aplicado.`);
  }

  // --- Validar wiring esperado antes de tocar nada ---
  const ruteoConn = wf.connections[RUTEO_NODE];
  const sinMatchOut = ruteoConn?.main?.[2];
  if (!sinMatchOut || sinMatchOut.length !== 1 || sinMatchOut[0].node !== "Detectar Interes Generico") {
    throw new Error(`La salida "Sin Match" de "${RUTEO_NODE}" no apunta a "Detectar Interes Generico" como se esperaba.`);
  }
  const hayPinConn = wf.connections[HAY_KIT_PINEADO_NODE];
  const noPinOut = hayPinConn?.main?.[1];
  if (!noPinOut || noPinOut.length !== 1 || noPinOut[0].node !== PREPARAR_CONTEXTO_SUBPREGUNTAS_NODE) {
    throw new Error(`La salida "no" de "${HAY_KIT_PINEADO_NODE}" no apunta a "${PREPARAR_CONTEXTO_SUBPREGUNTAS_NODE}" como se esperaba.`);
  }

  const deepseekRef = byName(DEEPSEEK_REF_NODE);
  const config = byName("Config Chatwoot");
  if (!config) throw new Error('No se encontro el nodo "Config Chatwoot"');

  // --- Eliminar "Detectar Interes Generico" y su cadena (el agente nuevo lo reemplaza) ---
  wf.nodes = wf.nodes.filter((n) => !OLD_DETECTAR_NODES.includes(n.name));
  for (const name of OLD_DETECTAR_NODES) delete wf.connections[name];
  console.log("Eliminados:", OLD_DETECTAR_NODES.join(", "));

  // --- Nodos nuevos ---
  const nodosNuevos = [
    {
      parameters: {
        method: "GET",
        url: "={{ $('Config Chatwoot').item.json.chatwoot_api }}/accounts/{{ $('Webhook1').item.json.body.account.id }}/conversations/{{ $('Webhook1').item.json.body.conversation.messages[0].conversation_id }}/messages",
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: "api_access_token", value: "={{ $('Config Chatwoot').item.json.chatwoot_token }}" }],
        },
        options: { timeout: 15000 },
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [4750, 950],
      id: randomUUID(),
      name: TRAER_HISTORIAL_NODE,
      retryOnFail: true,
      maxTries: 2,
      waitBetweenTries: 1500,
    },
    {
      parameters: { jsCode: FORMATEAR_HISTORIAL_CODE },
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [5020, 950],
      id: randomUUID(),
      name: FORMATEAR_HISTORIAL_NODE,
    },
    {
      parameters: {
        promptType: "define",
        text: "={{ $json.contexto_para_ia }}",
        options: { systemMessage: IDENTIFICAR_SYSTEM_MESSAGE },
      },
      type: "@n8n/n8n-nodes-langchain.agent",
      typeVersion: 2,
      position: [5290, 950],
      id: randomUUID(),
      name: IDENTIFICAR_NODE,
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 2000,
    },
    {
      parameters: {
        model: "deepseek-v4-flash",
        options: { temperature: 0, timeout: 25000, maxRetries: 2 },
      },
      type: "@n8n/n8n-nodes-langchain.lmChatDeepSeek",
      typeVersion: 1,
      position: [5290, 1130],
      id: randomUUID(),
      name: DEEPSEEK_IDENTIFICAR_NODE,
      credentials: { deepSeekApi: deepseekRef.credentials.deepSeekApi },
    },
    {
      parameters: { jsCode: PARSEAR_IDENTIFICAR_CODE },
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [5560, 950],
      id: randomUUID(),
      name: PARSEAR_IDENTIFICAR_NODE,
    },
    {
      parameters: {
        rules: {
          values: [
            {
              conditions: {
                options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
                conditions: [
                  {
                    id: randomUUID(),
                    leftValue: "={{ $json.tipo }}",
                    rightValue: "kit_confiado",
                    operator: { type: "string", operation: "equals", name: "filter.operator.equals" },
                  },
                ],
                combinator: "and",
              },
              renameOutput: true,
              outputKey: "Kit Confiado",
            },
            {
              conditions: {
                options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
                conditions: [
                  {
                    id: randomUUID(),
                    leftValue: "={{ $json.tipo }}",
                    rightValue: "candidatos",
                    operator: { type: "string", operation: "equals", name: "filter.operator.equals" },
                  },
                ],
                combinator: "and",
              },
              renameOutput: true,
              outputKey: "Candidatos",
            },
            {
              conditions: {
                options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
                conditions: [
                  {
                    id: randomUUID(),
                    leftValue: "={{ $json.tipo }}",
                    rightValue: "saludo",
                    operator: { type: "string", operation: "equals", name: "filter.operator.equals" },
                  },
                ],
                combinator: "and",
              },
              renameOutput: true,
              outputKey: "Saludo",
            },
          ],
        },
        options: { fallbackOutput: "extra", renameFallbackOutput: "Ninguno" },
      },
      type: "n8n-nodes-base.switch",
      typeVersion: 3.4,
      position: [5830, 950],
      id: randomUUID(),
      name: SWITCH_IDENTIFICAR_NODE,
    },
    {
      parameters: { jsCode: PREPARAR_PIN_CODE },
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [6100, 1000],
      id: randomUUID(),
      name: PREPARAR_PIN_NODE,
    },
    {
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
        jsonBody: "={{ JSON.stringify({ conversation_id: $('Webhook1').item.json.body.conversation.messages[0].conversation_id, account_id: $('Webhook1').item.json.body.account.id, content: $json.mensaje, origen: 'confirmacion_kit_ia_propuesta', contacto: ($('Webhook1').item.json.body.conversation?.meta?.sender?.name || $('Webhook1').item.json.body.sender?.name || ''), foto_url: null }) }}",
        options: { timeout: 20000 },
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [6100, 850],
      id: randomUUID(),
      name: ENVIAR_CONFIRMACION_NODE,
    },
    {
      parameters: {},
      type: "n8n-nodes-base.noOp",
      typeVersion: 1,
      position: [6370, 850],
      id: randomUUID(),
      name: FIN_CONFIRMACION_NODE,
    },
    {
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
        jsonBody: "={{ JSON.stringify({ conversation_id: $('Webhook1').item.json.body.conversation.messages[0].conversation_id, account_id: $('Webhook1').item.json.body.account.id, content: $json.mensaje, origen: 'repregunta_candidatos_propuesta', contacto: ($('Webhook1').item.json.body.conversation?.meta?.sender?.name || $('Webhook1').item.json.body.sender?.name || ''), foto_url: null }) }}",
        options: { timeout: 20000 },
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [6100, 1150],
      id: randomUUID(),
      name: ENVIAR_REPREGUNTA_NODE,
    },
    {
      parameters: {},
      type: "n8n-nodes-base.noOp",
      typeVersion: 1,
      position: [6370, 1150],
      id: randomUUID(),
      name: FIN_REPREGUNTA_NODE,
    },
  ];

  wf.nodes.push(...nodosNuevos);

  // --- Rewire ---
  // Ruteo Clasificacion (Sin Match) -> Leer Kit Pineado directo (antes: Detectar Interes Generico)
  ruteoConn.main[2] = [{ node: LEER_KIT_PINEADO_NODE, type: "main", index: 0 }];

  // ¿Hay Kit Pineado? (no) -> Identificar Necesidad, via historial (antes: Preparar Contexto Sub-preguntas directo)
  hayPinConn.main[1] = [{ node: TRAER_HISTORIAL_NODE, type: "main", index: 0 }];

  wf.connections[TRAER_HISTORIAL_NODE] = { main: [[{ node: FORMATEAR_HISTORIAL_NODE, type: "main", index: 0 }]] };
  wf.connections[FORMATEAR_HISTORIAL_NODE] = { main: [[{ node: IDENTIFICAR_NODE, type: "main", index: 0 }]] };
  wf.connections[DEEPSEEK_IDENTIFICAR_NODE] = {
    ai_languageModel: [[{ node: IDENTIFICAR_NODE, type: "ai_languageModel", index: 0 }]],
  };
  wf.connections[IDENTIFICAR_NODE] = { main: [[{ node: PARSEAR_IDENTIFICAR_NODE, type: "main", index: 0 }]] };
  wf.connections[PARSEAR_IDENTIFICAR_NODE] = { main: [[{ node: SWITCH_IDENTIFICAR_NODE, type: "main", index: 0 }]] };

  wf.connections[SWITCH_IDENTIFICAR_NODE] = {
    main: [
      // 0: kit_confiado -> pinea (via Parsear Kit Pineado, reusado) + manda confirmacion
      [
        { node: PREPARAR_PIN_NODE, type: "main", index: 0 },
        { node: ENVIAR_CONFIRMACION_NODE, type: "main", index: 0 },
      ],
      // 1: candidatos -> repregunta, no pinea nada
      [{ node: ENVIAR_REPREGUNTA_NODE, type: "main", index: 0 }],
      // 2: saludo -> camino existente, sin cambios
      [{ node: ENVIAR_SALUDO_GENERICO_NODE, type: "main", index: 0 }],
      // 3 (fallback "Ninguno") -> MISMO camino que ya seguia hoy el caso sin pin
      [{ node: PREPARAR_CONTEXTO_SUBPREGUNTAS_NODE, type: "main", index: 0 }],
    ],
  };

  // Preparar Pin desde Identificacion -> Parsear Kit Pineado (nodo EXISTENTE, reusado con una
  // segunda conexion de entrada -- mismo patron que ya usa "Enviar Saludo Kit" hoy con 2 origenes).
  wf.connections[PREPARAR_PIN_NODE] = { main: [[{ node: PARSEAR_KIT_PINEADO_NODE, type: "main", index: 0 }]] };

  wf.connections[ENVIAR_CONFIRMACION_NODE] = { main: [[{ node: FIN_CONFIRMACION_NODE, type: "main", index: 0 }]] };
  wf.connections[ENVIAR_REPREGUNTA_NODE] = { main: [[{ node: FIN_REPREGUNTA_NODE, type: "main", index: 0 }]] };

  console.log("Nodos nuevos agregados y rewireados.");

  const allowedSettingsKeys = [
    "saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
    "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder",
  ];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => allowedSettingsKeys.includes(k)));

  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: JSON.stringify(body) });
  console.log("Actualizado. Nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const fresh = await api(`/workflows/${WORKFLOW_ID}`);
  const freshByName = (name) => fresh.nodes.find((n) => n.name === name);
  const okNodos = [
    IDENTIFICAR_NODE, DEEPSEEK_IDENTIFICAR_NODE, TRAER_HISTORIAL_NODE, FORMATEAR_HISTORIAL_NODE,
    PARSEAR_IDENTIFICAR_NODE, SWITCH_IDENTIFICAR_NODE, PREPARAR_PIN_NODE, ENVIAR_CONFIRMACION_NODE,
    FIN_CONFIRMACION_NODE, ENVIAR_REPREGUNTA_NODE, FIN_REPREGUNTA_NODE,
  ].every((name) => !!freshByName(name));
  const okEliminados = OLD_DETECTAR_NODES.every((name) => !freshByName(name));
  const okRuteo = fresh.connections[RUTEO_NODE]?.main?.[2]?.[0]?.node === LEER_KIT_PINEADO_NODE;
  const okHayPin = fresh.connections[HAY_KIT_PINEADO_NODE]?.main?.[1]?.[0]?.node === TRAER_HISTORIAL_NODE;
  const okFallback = fresh.connections[SWITCH_IDENTIFICAR_NODE]?.main?.[3]?.[0]?.node === PREPARAR_CONTEXTO_SUBPREGUNTAS_NODE;
  const okPin = fresh.connections[PREPARAR_PIN_NODE]?.main?.[0]?.[0]?.node === PARSEAR_KIT_PINEADO_NODE;

  console.log("Verificacion nodos nuevos:", okNodos ? "OK" : "ALGO NO CUADRA");
  console.log("Verificacion nodos viejos eliminados:", okEliminados ? "OK" : "ALGO NO CUADRA");
  console.log("Verificacion Ruteo Clasificacion -> Leer Kit Pineado:", okRuteo ? "OK" : "ALGO NO CUADRA");
  console.log("Verificacion ¿Hay Kit Pineado? (no) -> Traer Historial:", okHayPin ? "OK" : "ALGO NO CUADRA");
  console.log("Verificacion fallback Ninguno -> Preparar Contexto Sub-preguntas:", okFallback ? "OK" : "ALGO NO CUADRA");
  console.log("Verificacion Preparar Pin -> Parsear Kit Pineado:", okPin ? "OK" : "ALGO NO CUADRA");
  console.log(
    okNodos && okEliminados && okRuteo && okHayPin && okFallback && okPin
      ? "Fix aplicado correctamente."
      : "REVISAR A MANO, algo no quedo como se esperaba."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
