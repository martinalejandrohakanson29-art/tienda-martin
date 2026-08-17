// Fix doble, encontrado revisando dos conversaciones reales del 2026-08-15:
//
// 1) STOPWORDS de "Clasificar Mensaje (sin IA)": conv 2021, el cliente entro
//    por un anuncio que le agrega "Enlace:\n\n\n" adelante del mensaje real
//    ("Enlace:\n\n\n¡Hola! Quiero más información") -- metadata que mete
//    Meta/Instagram, no algo que el cliente haya escrito. "enlace" no estaba
//    en STOPWORDS, asi que contaba como palabra de contenido real y rompia la
//    deteccion de "saludo sin pedido especifico" (que exige CERO palabras de
//    contenido). El mensaje cayo en sin_match y escalo una nota al equipo por
//    algo que el bot ya sabe manejar solo (rama "Enviar Saludo Generico":
//    manda "Hola bro! En qué te podemos ayudar?"). Fix: agregar "enlace" a
//    STOPWORDS. Un solo string, sin tocar logica.
//
// 2) Nuevo paso de IA acotada para "interes generico sin producto puntual":
//    el problema de fondo no es solo "enlace" -- cualquier variante de
//    "quiero mas informacion" que no tenga literalmente una de las
//    GREETING_WORDS ("hola", "buenas", etc.) tampoco entra por la rama
//    saludo, porque esa deteccion es 100% por lista de palabras. Ya paso
//    algo parecido en la Fase 9 con "Me interesa". En vez de perseguir cada
//    frase nueva a mano, se agrega un paso de IA chico y acotado (mismo
//    patron ya probado en "Validar Continuidad de Tema": nunca redacta, solo
//    clasifica, DeepSeek, temperature 0, "ante la duda: false") que se
//    inserta en la salida "Sin Match" de "Ruteo Clasificacion", ANTES de
//    "Leer Kit Pineado":
//      Detectar Interes Generico (agent, DeepSeek) -> Parsear Interes
//      Generico (code) -> ¿Es Interes Generico? (if)
//        true  -> Enviar Saludo Generico (nodo ya existente, sin cambios)
//        false -> Leer Kit Pineado (mismo camino de siempre, sin cambios)
//    Si la IA no esta segura, responde false y el mensaje sigue el camino
//    normal (sub-preguntas / escalado) -- no se pierde ni se contesta de
//    mas, mismo criterio conservador que el resto del workflow.
//
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { randomUUID } from "crypto";
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-saludo-generico-enlace-ia_2026-08-17.json", import.meta.url);

const CLASIFICAR_NODE = "Clasificar Mensaje (sin IA)";
const RUTEO_NODE = "Ruteo Clasificacion";
const LEER_KIT_PINEADO_NODE = "Leer Kit Pineado";
const ENVIAR_SALUDO_GENERICO_NODE = "Enviar Saludo Generico";
const DEEPSEEK_CONTINUIDAD_NODE = "DeepSeek Chat Model - Continuidad de Tema"; // para copiar credencial

const OLD_STOPWORDS_TAIL =
  "  'hey','alo','informacion','info','ayuda','favor','porfa','porfavor','consultar','saber','onda',\n" +
  "  'todo','bien','gracias','disculpa','disculpe','perdon',\n" +
  "]);";

const NEW_STOPWORDS_TAIL =
  "  'hey','alo','informacion','info','ayuda','favor','porfa','porfavor','consultar','saber','onda',\n" +
  "  'todo','bien','gracias','disculpa','disculpe','perdon',\n" +
  "  // metadata que a veces mete Meta/Instagram delante del mensaje real cuando\n" +
  "  // el cliente entra por un anuncio con link (no es contenido que haya\n" +
  "  // escrito el cliente) -- ver conv 2021, \"Enlace:\\n\\n\\n¡Hola! Quiero más informacion\"\n" +
  "  'enlace',\n" +
  "]);";

const AGENT_SYSTEM_MESSAGE =
  "El cliente escribio un mensaje que no coincidio letra por letra con ninguna plantilla de kit publicitado, y tampoco es un saludo puro sin nada mas (ese caso ya se maneja aparte). Decidi si el mensaje es UN INTERES GENERICO SIN PEDIDO CONCRETO -- por ejemplo \"quiero mas informacion\", \"me interesa\", mensajes de un clic en un anuncio que no mencionan ningun producto/kit puntual, aunque tengan palabras sueltas de metadata como \"Enlace:\" -- o si YA pregunta o pide algo concreto (un producto, precio, compatibilidad con una moto, envio, ubicacion, forma de pago, o cualquier otra cosa puntual) que necesita una respuesta real.\n\nRespondé ÚNICAMENTE con un JSON válido, sin texto adicional, con este formato exacto:\n{\"generico\": true o false}\n\nAnte la duda, respondé false (tratalo como que SI pide algo concreto, para que se resuelva por el camino normal de siempre en vez de perderse sin contestar ni escalar) -- SOLO respondé true cuando sea claramente un interes generico sin ningun dato puntual.";

const PARSER_CODE =
  "let generico = false;\n" +
  "try {\n" +
  "  const raw = ($json.output || '{}').toString().trim();\n" +
  "  const clean = raw.replace(/```json|```/g, '').trim();\n" +
  "  const parsed = JSON.parse(clean);\n" +
  "  generico = parsed.generico === true;\n" +
  "} catch (e) {}\n\n" +
  "return [{ json: { generico } }];\n";

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

  // --- Fix 1: STOPWORDS ---
  const clasificar = wf.nodes.find((n) => n.name === CLASIFICAR_NODE);
  if (!clasificar) throw new Error(`No se encontro el nodo "${CLASIFICAR_NODE}"`);
  if (!clasificar.parameters.jsCode.includes(OLD_STOPWORDS_TAIL)) {
    throw new Error(`El codigo de "${CLASIFICAR_NODE}" no coincide con lo esperado -- puede que ya se haya tocado. Revisar a mano antes de seguir.`);
  }
  clasificar.parameters.jsCode = clasificar.parameters.jsCode.replace(OLD_STOPWORDS_TAIL, NEW_STOPWORDS_TAIL);
  console.log(`"${CLASIFICAR_NODE}": "enlace" agregado a STOPWORDS.`);

  // --- Fix 2: paso de IA acotada + rewire ---
  const ruteo = wf.nodes.find((n) => n.name === RUTEO_NODE);
  if (!ruteo) throw new Error(`No se encontro el nodo "${RUTEO_NODE}"`);
  const leerKitPineado = wf.nodes.find((n) => n.name === LEER_KIT_PINEADO_NODE);
  if (!leerKitPineado) throw new Error(`No se encontro el nodo "${LEER_KIT_PINEADO_NODE}"`);
  const enviarSaludoGenerico = wf.nodes.find((n) => n.name === ENVIAR_SALUDO_GENERICO_NODE);
  if (!enviarSaludoGenerico) throw new Error(`No se encontro el nodo "${ENVIAR_SALUDO_GENERICO_NODE}"`);
  const deepseekContinuidad = wf.nodes.find((n) => n.name === DEEPSEEK_CONTINUIDAD_NODE);
  if (!deepseekContinuidad) throw new Error(`No se encontro el nodo "${DEEPSEEK_CONTINUIDAD_NODE}" (para copiar credencial)`);

  const ruteoConn = wf.connections[RUTEO_NODE];
  const fallbackOut = ruteoConn?.main?.[2];
  if (!fallbackOut || fallbackOut.length !== 1 || fallbackOut[0].node !== LEER_KIT_PINEADO_NODE) {
    throw new Error(`La salida "Sin Match" de "${RUTEO_NODE}" no apunta a "${LEER_KIT_PINEADO_NODE}" como se esperaba -- puede que ya se haya tocado. Revisar a mano.`);
  }

  const DETECTAR_NODE = "Detectar Interes Generico";
  const DEEPSEEK_NODE = "DeepSeek Chat Model - Interes Generico";
  const PARSEAR_NODE = "Parsear Interes Generico";
  const IF_NODE = "¿Es Interes Generico?";

  if (wf.nodes.some((n) => [DETECTAR_NODE, DEEPSEEK_NODE, PARSEAR_NODE, IF_NODE].includes(n.name))) {
    throw new Error("Alguno de los nodos nuevos ya existe -- puede que este fix ya se haya aplicado. Revisar a mano.");
  }

  const nodosNuevos = [
    {
      parameters: {
        promptType: "define",
        text: "={{ $('Unir Mensajes').item.json.texto_completo }}",
        options: { systemMessage: AGENT_SYSTEM_MESSAGE },
      },
      type: "@n8n/n8n-nodes-langchain.agent",
      typeVersion: 2,
      position: [4480, 520],
      id: randomUUID(),
      name: DETECTAR_NODE,
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
      position: [4480, 700],
      id: randomUUID(),
      name: DEEPSEEK_NODE,
      credentials: { deepSeekApi: deepseekContinuidad.credentials.deepSeekApi },
    },
    {
      parameters: { jsCode: PARSER_CODE },
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [4750, 520],
      id: randomUUID(),
      name: PARSEAR_NODE,
    },
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
          conditions: [
            {
              id: randomUUID(),
              leftValue: "={{ $json.generico }}",
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
      position: [5020, 520],
      id: randomUUID(),
      name: IF_NODE,
    },
  ];

  wf.nodes.push(...nodosNuevos);

  // Ruteo Clasificacion (salida "Sin Match") -> Detectar Interes Generico (antes: Leer Kit Pineado)
  ruteoConn.main[2] = [{ node: DETECTAR_NODE, type: "main", index: 0 }];

  wf.connections[DETECTAR_NODE] = { main: [[{ node: PARSEAR_NODE, type: "main", index: 0 }]] };
  wf.connections[DEEPSEEK_NODE] = { ai_languageModel: [[{ node: DETECTAR_NODE, type: "ai_languageModel", index: 0 }]] };
  wf.connections[PARSEAR_NODE] = { main: [[{ node: IF_NODE, type: "main", index: 0 }]] };
  wf.connections[IF_NODE] = {
    main: [
      [{ node: ENVIAR_SALUDO_GENERICO_NODE, type: "main", index: 0 }],
      [{ node: LEER_KIT_PINEADO_NODE, type: "main", index: 0 }],
    ],
  };

  console.log("Nodos nuevos agregados y rewireados: Ruteo Clasificacion (Sin Match) -> Detectar Interes Generico -> Parsear -> If -> Enviar Saludo Generico / Leer Kit Pineado.");

  const allowedSettingsKeys = [
    "saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
    "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder",
  ];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => allowedSettingsKeys.includes(k)));

  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: JSON.stringify(body) });
  console.log("Actualizado. Nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const fresh = await api(`/workflows/${WORKFLOW_ID}`);
  const freshClasificar = fresh.nodes.find((n) => n.name === CLASIFICAR_NODE);
  const okStopwords = freshClasificar?.parameters.jsCode.includes("'enlace',");
  const okNodos = [DETECTAR_NODE, DEEPSEEK_NODE, PARSEAR_NODE, IF_NODE].every((name) => fresh.nodes.some((n) => n.name === name));
  const okConn = fresh.connections[RUTEO_NODE]?.main?.[2]?.[0]?.node === DETECTAR_NODE;
  console.log("Verificacion STOPWORDS:", okStopwords ? "OK" : "ALGO NO CUADRA");
  console.log("Verificacion nodos nuevos:", okNodos ? "OK" : "ALGO NO CUADRA");
  console.log("Verificacion rewire:", okConn ? "OK" : "ALGO NO CUADRA");
  console.log(okStopwords && okNodos && okConn ? "Fix aplicado correctamente." : "REVISAR A MANO, algo no quedo como se esperaba.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
