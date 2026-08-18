// Tapa el agujero encontrado revisando la conversacion 2109 (+5493725464840,
// 2026-08-18): con un kit ya pineado, el saludo del kit siempre termina
// preguntando "para que moto lo estas buscando?" -- y muy seguido el cliente
// contesta solo la cilindrada ("110", "125") sin marca ni modelo puntual.
// Extraer Pregunta Compatibilidad ya detecta esto bien (es_compatibilidad:
// true, modelo_moto: "" a proposito, para no inventar), pero el siguiente
// paso (¿Es Compatibilidad Con Modelo?) exige un modelo real para entrar a la
// rama que sabe resolver compatibilidad -- sin eso, el mensaje caia en el
// balde generico "otro" del partidor de sub-preguntas, que no supo que hacer
// con una respuesta de una sola palabra y termino escalando a un humano en
// vano (la ficha del kit ya tiene la regla para este caso exacto, pero nunca
// se llega a leerla).
//
// Diseño acordado con el usuario (ver conversacion 2026-08-18):
//   1) Extraer Pregunta Compatibilidad (agente existente) se amplia: ahora
//      separa "cilindrada" (generico, ej. "110") de "modelo_moto" (marca +
//      modelo puntual), y la regla de resto_mensaje se simplifica -- ya NO
//      deja el mensaje completo pegado cuando no hay modelo, siempre saca
//      SOLO la frase de compatibilidad/cilindrada.
//   2) Nodo nuevo ¿Compatibilidad Sin Marca/Modelo? (IF, deterministico)
//      intercepta ANTES del gate existente: es_compatibilidad=true Y
//      modelo_moto vacio. Si no aplica (hay modelo, o no es compatibilidad),
//      sigue el camino de siempre sin ningun cambio.
//   3) Si aplica, agente nuevo y chico "Redactar Repregunta Modelo" arma UNA
//      pregunta corta pidiendo marca+modelo (usa la cilindrada si la hay),
//      nunca confirma ni descarta compatibilidad, nunca inventa una marca.
//      Con el estilo pedido por el usuario: signo de cierre "?" nada mas,
//      nunca el de apertura "¿" (ver [[feedback-bot-preguntas-sin-apertura]]).
//   4) El resto de la rafaga (envio, ubicacion, etc.) se resuelve reusando
//      ¿Hay Resto Adicional en la Rafaga? -- el mismo nodo que ya cumple esa
//      funcion en la rama de compatibilidad normal, con una segunda entrada
//      (mismo patron que ya usan "Parsear Kit Pineado" o "Enviar Saludo Kit").
//
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { randomUUID } from "crypto";
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL(
  "./workflow_backup_pre-feat-repregunta-modelo_2026-08-18.json",
  import.meta.url
);

const EXTRAER_NODE = "Extraer Pregunta Compatibilidad";
const PARSEAR_NODE = "Parsear Pregunta Compatibilidad";
const ES_COMPAT_CON_MODELO_NODE = "¿Es Compatibilidad Con Modelo?";
const RESTO_ADICIONAL_NODE = "¿Hay Resto Adicional en la Rafaga?";
const DEEPSEEK_REF_NODE = "DeepSeek Chat Model - Compatibilidad"; // para copiar credencial

const GATE_SIN_MODELO_NODE = "¿Compatibilidad Sin Marca/Modelo?";
const REDACTAR_NODE = "Redactar Repregunta Modelo";
const DEEPSEEK_REDACTAR_NODE = "DeepSeek Chat Model - Repregunta Modelo";
const PARSEAR_REDACTAR_NODE = "Parsear Repregunta Modelo";
const ENVIAR_NODE = "Enviar Repregunta Modelo";
const FIN_NODE = "Fin - Repregunta Modelo Enviada";

const NUEVO_EXTRAER_SYSTEM_MESSAGE =
  'El cliente ya esta hablando sobre el kit "{{ $json.kit_nombre }}". Del mensaje del cliente, determina si esta preguntando por la compatibilidad de ESE kit con un modelo de moto puntual (por ejemplo: si anda, si sirve, si entra, si es compatible). Respondé UNICAMENTE con un JSON valido, sin texto adicional, con este formato exacto:\n' +
  '{"es_compatibilidad": true o false, "modelo_moto": "...", "cilindrada": "...", "resto_mensaje": "..."}\n\n' +
  'es_compatibilidad debe ser true si la pregunta es explicitamente sobre si el kit anda/sirve/entra/es compatible con una moto puntual, O si el cliente simplemente menciona/afirma un modelo de moto puntual O una cilindrada/tipo de motor generico como respuesta (sin forma de pregunta) -- nuestros mensajes de kit siempre terminan preguntando "para que moto lo estas buscando?", asi que la gran mayoria de las respuestas del cliente son solo eso, sin signos de pregunta, y eso tambien cuenta como pregunta de compatibilidad. Cualquier otra cosa (precio, envio, saludo, agradecimiento, u otro tema sin ninguna moto ni cilindrada mencionada) es false.\n\n' +
  'modelo_moto es el modelo de moto que menciona, tal cual lo escribio -- pero solo cuenta si es una moto real identificable (marca y/o modelo puntual, ej. "Zanella ZB 110", "Gilera Smash", "Yamaha Crypton 110"). Si el cliente SOLO menciona la cilindrada o el tipo de motor en general (ej. "un motor 110", "110cc", "un 110", "moto china de 110") sin nombrar marca ni modelo puntual, eso NO es un modelo_moto valido -- dejalo como string vacio "". No inventes un modelo que no este en el mensaje.\n\n' +
  'cilindrada: si el cliente menciono una cilindrada o tipo de motor generico (ej. "110", "125cc", "200") SIN marca ni modelo puntual, poné ese valor aca (ej. "110"). Si no menciono ninguna cilindrada, o si ya diste un modelo_moto completo, dejalo como string vacio "". No inventes una cilindrada que el cliente no dijo.\n\n' +
  'resto_mensaje: copiá el mensaje del cliente TAL CUAL lo escribio, pero sacando UNICAMENTE la frase/oracion puntual que pregunta por la compatibilidad (ya sea con modelo, o solo con la cilindrada) -- dejá el resto del texto sin modificar, palabra por palabra, no resumas ni reformules ni agregues nada. Si es_compatibilidad es false, o si el mensaje completo es solamente sobre la compatibilidad/cilindrada y no queda nada mas, dejalo como string vacio "". Nunca inventes contenido que el cliente no escribio.';

const NUEVO_PARSEAR_CODE =
  "let esCompatibilidad = false, modeloMoto = '', cilindrada = '', restoMensaje = null;\n" +
  "try {\n" +
  "  const raw = ($json.output || '{}').toString().trim();\n" +
  "  const clean = raw.replace(/```json|```/g, '').trim();\n" +
  "  const parsed = JSON.parse(clean);\n" +
  "  esCompatibilidad = parsed.es_compatibilidad === true;\n" +
  "  modeloMoto = (parsed.modelo_moto || '').toString().trim();\n" +
  "  cilindrada = (parsed.cilindrada || '').toString().trim();\n" +
  "  if (esCompatibilidad) restoMensaje = (parsed.resto_mensaje || '').toString().trim();\n" +
  "} catch (e) {}\n\n" +
  "const escapar = (s) => s.replace(/'/g, \"''\");\n\n" +
  "return [{\n" +
  "  json: {\n" +
  "    es_compatibilidad: esCompatibilidad,\n" +
  "    modelo_moto: modeloMoto,\n" +
  "    modelo_moto_sql: escapar(modeloMoto),\n" +
  "    cilindrada: cilindrada,\n" +
  "    resto_mensaje: restoMensaje,\n" +
  "    kit_id: $('Parsear Kit Pineado').item.json.kit_id,\n" +
  "    kit_nombre: $('Parsear Kit Pineado').item.json.kit_nombre,\n" +
  "  }\n" +
  "}];\n";

const REDACTAR_SYSTEM_MESSAGE =
  'Tu unico trabajo es armar UNA sola pregunta corta, en primera persona como si fueras parte del negocio (nunca reveles que sos un asistente o una IA), pidiendole al cliente la marca y el modelo puntual de su moto -- necesitamos ese dato para poder confirmarle despues si el kit le sirve o no.\n\n' +
  'Reglas:\n' +
  '- Nunca confirmes ni descartes compatibilidad vos mismo, eso lo resuelve otro paso con el dato real.\n' +
  '- Nunca inventes una marca o modelo que el cliente no dijo.\n' +
  '- Nunca contestes ninguna otra cosa (precio, envio, ubicacion, etc.), aunque el cliente haya preguntado algo mas -- eso lo maneja otro paso aparte.\n' +
  '- No saludes (nada de "Hola" ni similares) -- esta charla ya esta en curso, arranca directo con la pregunta.\n' +
  '- Si te paso que el cliente ya dijo una cilindrada, mencionala en la pregunta para que sea mas facil de contestar (ej.: "Para una 110, que marca y modelo es?").\n' +
  '- Muy importante de estilo: tus preguntas van UNICAMENTE con el signo de cierre "?" al final, NUNCA con el signo de apertura "¿" al principio -- asi suena mas natural, como alguien tipeando rapido por WhatsApp.\n\n' +
  'Respondé solamente el mensaje final en texto plano, sin JSON, sin comillas, sin explicaciones.';

const PARSEAR_REDACTAR_CODE =
  "let mensaje = ($json.output || '').toString().trim();\n" +
  "if (!mensaje) {\n" +
  "  const cil = ($('Parsear Pregunta Compatibilidad').item.json.cilindrada || '').toString().trim();\n" +
  "  mensaje = cil ? `Para una ${cil}, que marca y modelo es?` : 'Que marca y modelo es tu moto?';\n" +
  "}\n" +
  "return [{ json: { mensaje } }];\n";

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

  for (const name of [EXTRAER_NODE, PARSEAR_NODE, ES_COMPAT_CON_MODELO_NODE, RESTO_ADICIONAL_NODE, DEEPSEEK_REF_NODE]) {
    if (!byName(name)) throw new Error(`No se encontro el nodo "${name}"`);
  }
  for (const name of [GATE_SIN_MODELO_NODE, REDACTAR_NODE, DEEPSEEK_REDACTAR_NODE, PARSEAR_REDACTAR_NODE, ENVIAR_NODE, FIN_NODE]) {
    if (byName(name)) throw new Error(`El nodo nuevo "${name}" ya existe -- puede que este fix ya se haya aplicado.`);
  }

  // --- Validar wiring esperado antes de tocar nada ---
  const parsearConn = wf.connections[PARSEAR_NODE];
  const parsearOut = parsearConn?.main?.[0];
  if (!parsearOut || parsearOut.length !== 1 || parsearOut[0].node !== ES_COMPAT_CON_MODELO_NODE) {
    throw new Error(`"${PARSEAR_NODE}" no apunta a "${ES_COMPAT_CON_MODELO_NODE}" como se esperaba.`);
  }

  const deepseekRef = byName(DEEPSEEK_REF_NODE);
  const extraerNode = byName(EXTRAER_NODE);
  const parsearNode = byName(PARSEAR_NODE);

  // --- Ampliar el agente existente (Extraer Pregunta Compatibilidad) ---
  extraerNode.parameters.options.systemMessage = NUEVO_EXTRAER_SYSTEM_MESSAGE;
  parsearNode.parameters.jsCode = NUEVO_PARSEAR_CODE;
  console.log("Ampliados:", EXTRAER_NODE, "y", PARSEAR_NODE);

  // --- Nodos nuevos ---
  const nodosNuevos = [
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
          conditions: [
            {
              id: randomUUID(),
              leftValue: "={{ $json.es_compatibilidad }}",
              rightValue: true,
              operator: { type: "boolean", operation: "equals" },
            },
            {
              id: randomUUID(),
              leftValue: "={{ $json.modelo_moto }}",
              rightValue: "",
              operator: { type: "string", operation: "equals" },
            },
          ],
          combinator: "and",
        },
        options: {},
      },
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [5830, 400],
      id: randomUUID(),
      name: GATE_SIN_MODELO_NODE,
    },
    {
      parameters: {
        promptType: "define",
        text: "={{ $json.cilindrada ? ('El cliente ya dijo que la cilindrada es ' + $json.cilindrada + '.') : 'El cliente no aclaro ninguna cilindrada todavia.' }}",
        options: { systemMessage: REDACTAR_SYSTEM_MESSAGE },
      },
      type: "@n8n/n8n-nodes-langchain.agent",
      typeVersion: 2,
      position: [6100, 340],
      id: randomUUID(),
      name: REDACTAR_NODE,
      retryOnFail: true,
      maxTries: 2,
      waitBetweenTries: 1500,
    },
    {
      parameters: {
        model: "deepseek-v4-flash",
        options: { temperature: 0, timeout: 25000, maxRetries: 2 },
      },
      type: "@n8n/n8n-nodes-langchain.lmChatDeepSeek",
      typeVersion: 1,
      position: [6100, 760],
      id: randomUUID(),
      name: DEEPSEEK_REDACTAR_NODE,
      credentials: { deepSeekApi: deepseekRef.credentials.deepSeekApi },
    },
    {
      parameters: { jsCode: PARSEAR_REDACTAR_CODE },
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [6370, 340],
      id: randomUUID(),
      name: PARSEAR_REDACTAR_NODE,
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
        jsonBody: "={{ JSON.stringify({ conversation_id: $('Webhook1').item.json.body.conversation.messages[0].conversation_id, account_id: $('Webhook1').item.json.body.account.id, content: $json.mensaje, origen: 'repregunta_modelo_compatibilidad', contacto: ($('Webhook1').item.json.body.conversation?.meta?.sender?.name || $('Webhook1').item.json.body.sender?.name || ''), foto_url: null }) }}",
        options: { timeout: 20000 },
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [6640, 340],
      id: randomUUID(),
      name: ENVIAR_NODE,
    },
    {
      parameters: {},
      type: "n8n-nodes-base.noOp",
      typeVersion: 1,
      position: [6910, 340],
      id: randomUUID(),
      name: FIN_NODE,
    },
  ];

  wf.nodes.push(...nodosNuevos);

  // --- Rewire ---
  // Parsear Pregunta Compatibilidad -> Gate nuevo (antes: directo a ¿Es Compatibilidad Con Modelo?)
  parsearConn.main[0] = [{ node: GATE_SIN_MODELO_NODE, type: "main", index: 0 }];

  wf.connections[GATE_SIN_MODELO_NODE] = {
    main: [
      // true (sin marca/modelo): repregunta + resto de la rafaga en paralelo (mismo patron que ya usa ¿Es Compatibilidad Con Modelo?)
      [
        { node: REDACTAR_NODE, type: "main", index: 0 },
        { node: RESTO_ADICIONAL_NODE, type: "main", index: 0 },
      ],
      // false (hay modelo, o no es compatibilidad): camino de siempre, sin cambios
      [{ node: ES_COMPAT_CON_MODELO_NODE, type: "main", index: 0 }],
    ],
  };

  wf.connections[REDACTAR_NODE] = { main: [[{ node: PARSEAR_REDACTAR_NODE, type: "main", index: 0 }]] };
  wf.connections[DEEPSEEK_REDACTAR_NODE] = {
    ai_languageModel: [[{ node: REDACTAR_NODE, type: "ai_languageModel", index: 0 }]],
  };
  wf.connections[PARSEAR_REDACTAR_NODE] = { main: [[{ node: ENVIAR_NODE, type: "main", index: 0 }]] };
  wf.connections[ENVIAR_NODE] = { main: [[{ node: FIN_NODE, type: "main", index: 0 }]] };

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
  const okNodos = [GATE_SIN_MODELO_NODE, REDACTAR_NODE, DEEPSEEK_REDACTAR_NODE, PARSEAR_REDACTAR_NODE, ENVIAR_NODE, FIN_NODE]
    .every((name) => !!freshByName(name));
  const okGate = fresh.connections[PARSEAR_NODE]?.main?.[0]?.[0]?.node === GATE_SIN_MODELO_NODE;
  const okFalseSigueIgual = fresh.connections[GATE_SIN_MODELO_NODE]?.main?.[1]?.[0]?.node === ES_COMPAT_CON_MODELO_NODE;
  const okResto = fresh.connections[GATE_SIN_MODELO_NODE]?.main?.[0]?.some((c) => c.node === RESTO_ADICIONAL_NODE);
  const okPromptAmpliado = freshByName(EXTRAER_NODE)?.parameters?.options?.systemMessage?.includes("cilindrada");

  console.log("Verificacion nodos nuevos:", okNodos ? "OK" : "ALGO NO CUADRA");
  console.log("Verificacion Parsear -> Gate nuevo:", okGate ? "OK" : "ALGO NO CUADRA");
  console.log("Verificacion Gate (false) -> camino de siempre:", okFalseSigueIgual ? "OK" : "ALGO NO CUADRA");
  console.log("Verificacion Gate (true) -> resto adicional en paralelo:", okResto ? "OK" : "ALGO NO CUADRA");
  console.log("Verificacion prompt ampliado con cilindrada:", okPromptAmpliado ? "OK" : "ALGO NO CUADRA");
  console.log(
    okNodos && okGate && okFalseSigueIgual && okResto && okPromptAmpliado
      ? "Fix aplicado correctamente."
      : "REVISAR A MANO, algo no quedo como se esperaba."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
