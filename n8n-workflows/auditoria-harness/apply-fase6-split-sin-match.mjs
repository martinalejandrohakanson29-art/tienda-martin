// Fase 6 (v2, corrige un bug real encontrado probando la v1): cuando un
// mensaje no matchea ni plantilla de kit ni saludo (o hay kit pineado pero no
// es pregunta de compatibilidad), en vez de caer en "Fin - Sin Match" sin
// hacer nada, se parte el texto en sub-preguntas con IA acotada (etiqueta,
// nunca redacta), cada una se resuelve de forma deterministica contra datos
// ya cargados (kits_publicidad, info_negocio, conocimiento_libre), se redacta
// con IA acotada (solo el dato encontrado, nunca inventa), y se manda 1 o 2
// mensajes al cliente. Lo que no se pueda resolver escala en silencio a
// preguntas_sin_match_pendientes (Fase 5, ya corrida).
//
// BUG de la v1 (detectado probando en produccion, conv de prueba): se uso un
// n8n-nodes-base.switch para rutear cada sub-pregunta por categoria, y las
// ramas nunca se volvian a juntar antes de "Aggregate" -- cada rama disparaba
// su propio envio de mensaje por separado, en vez de un unico mensaje
// combinado. Un Switch/If crea conexiones distintas en el grafo; conectar
// varias de esas conexiones al mismo nodo destino NO las junta en un solo
// batch (eso es lo que hace un nodo Merge, con arity fija) -- cada conexion
// dispara su propia corrida del nodo destino. La v2 evita el problema de raiz:
// nunca bifurca. Cada sub-pregunta pasa, siempre en el mismo unico camino,
// por las 4 busquedas (gateadas en el propio SQL con una comparacion de texto
// contra la categoria, asi que para 3 de las 4 no hace nada), y el paso de
// redaccion se llama siempre -- si no hay dato, el prompt le pide al modelo
// que devuelva el string exacto SIN_DATO en vez de redactar, y de ahi sale
// resuelto/no-resuelto sin ningun If de por medio. Un unico camino lineal
// -> nunca hace falta rejuntar nada -> Aggregate recibe siempre el batch
// completo. Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY) en el entorno");

// Base limpia: el backup tomado ANTES de la v1 (67 nodos), no el estado
// actual en vivo (que tiene la v1 con el bug). Reemplazamos todo de una.
const CLEAN_BASE_PATH = new URL("./workflow_backup_pre-fase6-split-sin-match_2026-08-13.json", import.meta.url);
const BACKUP_PATH = new URL("./workflow_backup_pre-fase6v2-split-sin-match_2026-08-13.json", import.meta.url);

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
  const prepararContexto = {
    parameters: {
      jsCode:
        "let kitId = null, kitNombre = null;\n" +
        "try {\n" +
        "  const k = $('Parsear Kit Pineado').item.json;\n" +
        "  if (k && k.kit_id) { kitId = k.kit_id; kitNombre = k.kit_nombre || null; }\n" +
        "} catch (e) {}\n\n" +
        "return [{ json: { kit_id: kitId, kit_nombre: kitNombre } }];\n",
    },
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [8200, 100],
    id: id(),
    name: "Preparar Contexto Sub-preguntas",
  };

  const dividirEtiquetar = {
    parameters: {
      promptType: "define",
      text: "={{ $('Unir Mensajes').item.json.texto_completo }}",
      options: {
        systemMessage:
          "=Analiza el mensaje del cliente y dividilo en las preguntas o pedidos distintos que contiene (puede ser uno solo). Para cada uno, asigná una categoría de esta lista cerrada: \"precio\", \"envio\", \"negocio\", \"otro\".\n\n" +
          "- \"precio\": pregunta cuánto cuesta o por el precio de ALGO YA IDENTIFICADO en la charla (el kit/combo del que ya se está hablando). {{ $json.kit_id !== null ? 'En esta charla SÍ hay un kit ya identificado, así que \"precio\" es válido.' : 'En esta charla NO hay ningún kit identificado todavía, así que NUNCA uses \"precio\" -- cualquier pregunta de precio en este caso va como \"otro\".' }}\n" +
          "- \"envio\": pregunta sobre si hacen envíos, a dónde, cómo, o cuánto tarda.\n" +
          "- \"negocio\": pregunta sobre el negocio en general -- ubicación, horarios, medios de pago, garantía.\n" +
          "- \"otro\": cualquier otra cosa, incluida cualquier pregunta sobre un producto o repuesto específico que no sea el kit ya identificado en la charla.\n\n" +
          "Ante la duda entre una categoría y \"otro\", usá \"otro\" -- nunca inventes ni asumas.\n\n" +
          "Respondé ÚNICAMENTE con un JSON válido, sin texto adicional, con este formato exacto:\n" +
          "{\"partes\": [{\"texto\": \"...\", \"categoria\": \"precio|envio|negocio|otro\"}]}\n\n" +
          "El campo \"texto\" es la sub-pregunta tal cual la escribió el cliente (podés recortar saludos sueltos). No agregues categorías que no estén en la lista. No redactes ninguna respuesta, solo separá y etiquetá.",
      },
    },
    type: "@n8n/n8n-nodes-langchain.agent",
    typeVersion: 2,
    position: [8470, 100],
    id: id(),
    name: "Dividir y Etiquetar Sub-preguntas",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
  };

  const deepseekSplit = {
    parameters: { model: "deepseek-v4-flash", options: { temperature: 0, timeout: 25000, maxRetries: 2 } },
    type: "@n8n/n8n-nodes-langchain.lmChatDeepSeek",
    typeVersion: 1,
    position: [8470, 300],
    id: id(),
    name: "DeepSeek Chat Model - Split Sub-preguntas",
    credentials: DEEPSEEK_CRED,
  };

  const parsearSubpreguntas = {
    parameters: {
      jsCode:
        "let partes = [];\n" +
        "try {\n" +
        "  const raw = ($json.output || '{}').toString().trim();\n" +
        "  const clean = raw.replace(/```json|```/g, '').trim();\n" +
        "  const parsed = JSON.parse(clean);\n" +
        "  if (Array.isArray(parsed.partes)) partes = parsed.partes;\n" +
        "} catch (e) {}\n\n" +
        "const categoriasValidas = ['precio', 'envio', 'negocio', 'otro'];\n" +
        "const kitId = $('Preparar Contexto Sub-preguntas').item.json.kit_id;\n" +
        "const kitNombre = $('Preparar Contexto Sub-preguntas').item.json.kit_nombre;\n" +
        "const escapar = (s) => (s || '').toString().replace(/'/g, \"''\");\n\n" +
        "const limpio = partes\n" +
        "  .map((p) => {\n" +
        "    let categoria = categoriasValidas.includes(p && p.categoria) ? p.categoria : 'otro';\n" +
        "    if (categoria === 'precio' && !kitId) categoria = 'otro';\n" +
        "    return { texto: ((p && p.texto) || '').toString().trim(), categoria };\n" +
        "  })\n" +
        "  .filter((p) => p.texto.length > 0)\n" +
        "  .map((p) => ({ ...p, texto_sql: escapar(p.texto), kit_id: kitId, kit_nombre: kitNombre }));\n\n" +
        "return [{ json: { partes: limpio } }];\n",
    },
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [8740, 100],
    id: id(),
    name: "Parsear Sub-preguntas",
  };

  const separarPedazos = {
    parameters: { fieldToSplitOut: "partes", options: {} },
    type: "n8n-nodes-base.splitOut",
    typeVersion: 1,
    position: [9010, 100],
    id: id(),
    name: "Separar Pedazos",
  };

  // --- De aca en mas, TODO en un unico camino lineal, sin bifurcar nunca. ---

  const buscarPrecioKit = {
    parameters: {
      operation: "executeQuery",
      // LEFT JOIN a partir de una fila semilla: garantiza SIEMPRE una fila de
      // salida por cada item de entrada (precio/detalle en NULL si no matchea),
      // para que ningun item desaparezca del lote cuando la busqueda da 0 filas.
      query:
        "SELECT k.precio, k.detalle\nFROM (SELECT 1) seed\nLEFT JOIN kits_publicidad k\n  ON '{{ $json.categoria }}' = 'precio' AND k.id = {{ $json.kit_id || 0 }} AND k.precio IS NOT NULL AND k.precio <> '';",
      options: {},
    },
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [9280, 100],
    id: id(),
    name: "Buscar Precio Kit Pineado",
    alwaysOutputData: true,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    credentials: POSTGRES_CRED,
  };

  const buscarEnvioKit = {
    parameters: {
      operation: "executeQuery",
      query:
        "SELECT k.envio\nFROM (SELECT 1) seed\nLEFT JOIN kits_publicidad k\n  ON '{{ $('Separar Pedazos').item.json.categoria }}' = 'envio' AND k.id = {{ $('Separar Pedazos').item.json.kit_id || 0 }} AND k.envio IS NOT NULL AND k.envio <> '';",
      options: {},
    },
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [9550, 100],
    id: id(),
    name: "Buscar Envio Kit Pineado",
    alwaysOutputData: true,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    credentials: POSTGRES_CRED,
  };

  const buscarEnvioGeneral = {
    parameters: {
      operation: "executeQuery",
      query:
        "SELECT sub.respuesta\nFROM (SELECT 1) seed\nLEFT JOIN LATERAL (\n  SELECT respuesta FROM info_negocio\n  WHERE rm_score(tema, 'envios') >= 0.5 AND rm_score('envios', tema) >= 0.5\n  ORDER BY creado_en DESC LIMIT 1\n) sub ON '{{ $('Separar Pedazos').item.json.categoria }}' = 'envio' AND {{ $('Buscar Envio Kit Pineado').item.json.envio == null ? 'true' : 'false' }};",
      options: {},
    },
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [9820, 100],
    id: id(),
    name: "Buscar Info Negocio (Envio General)",
    alwaysOutputData: true,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    credentials: POSTGRES_CRED,
  };

  const extraerTemaNegocioSub = {
    parameters: {
      promptType: "define",
      text: "={{ $('Separar Pedazos').item.json.texto }}",
      options: {
        systemMessage:
          "Extrae del mensaje del cliente el tema puntual sobre el negocio que esta preguntando (no sobre un repuesto especifico). Respondé UNICAMENTE con un JSON valido, sin texto adicional, con este formato exacto:\n{\"tema\": \"...\"}\n\nElegi el tema entre: ubicacion, horarios, medios_pago, envios, garantia, otro. Usa \"otro\" si es sobre el negocio pero no encaja en los anteriores. No inventes datos, solo clasifica.",
      },
    },
    type: "@n8n/n8n-nodes-langchain.agent",
    typeVersion: 2,
    position: [10090, 100],
    id: id(),
    name: "Extraer Tema Negocio (Sub-pregunta)",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
  };

  const deepseekTemaNegocio = {
    parameters: { model: "deepseek-v4-flash", options: { temperature: 0, timeout: 25000, maxRetries: 2 } },
    type: "@n8n/n8n-nodes-langchain.lmChatDeepSeek",
    typeVersion: 1,
    position: [10090, 300],
    id: id(),
    name: "DeepSeek Chat Model - Tema Negocio",
    credentials: DEEPSEEK_CRED,
  };

  const parsearTemaNegocio = {
    parameters: {
      // runOnceForEachItem: el default (runOnceForAllItems) solo procesa el
      // primer item del lote y descarta el resto -- critico ahora que este
      // paso corre con 2+ sub-preguntas juntas (antes del split, este
      // workflow nunca tuvo mas de 1 item a la vez, asi que nunca hizo falta).
      mode: "runOnceForEachItem",
      jsCode:
        "let tema = 'otro';\n" +
        "try {\n" +
        "  const raw = ($json.output || '{}').toString().trim();\n" +
        "  const clean = raw.replace(/```json|```/g, '').trim();\n" +
        "  const parsed = JSON.parse(clean);\n" +
        "  const temasValidos = ['ubicacion', 'horarios', 'medios_pago', 'envios', 'garantia', 'otro'];\n" +
        "  if (temasValidos.includes(parsed.tema)) tema = parsed.tema;\n" +
        "} catch (e) {}\n\n" +
        "const escapar = (s) => (s || '').toString().replace(/'/g, \"''\");\n" +
        "return { json: { tema_sql: escapar(tema) } };\n",
    },
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [10360, 100],
    id: id(),
    name: "Parsear Tema Negocio",
  };

  const buscarInfoNegocioNegocio = {
    parameters: {
      operation: "executeQuery",
      query:
        "SELECT sub.respuesta\nFROM (SELECT 1) seed\nLEFT JOIN LATERAL (\n  SELECT respuesta FROM info_negocio\n  WHERE rm_score(tema, '{{ $json.tema_sql }}') >= 0.5 AND rm_score('{{ $json.tema_sql }}', tema) >= 0.5\n  ORDER BY creado_en DESC LIMIT 1\n) sub ON '{{ $('Separar Pedazos').item.json.categoria }}' = 'negocio';",
      options: {},
    },
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [10630, 100],
    id: id(),
    name: "Buscar Info Negocio (Negocio)",
    alwaysOutputData: true,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    credentials: POSTGRES_CRED,
  };

  const buscarConocimientoLibre = {
    parameters: {
      operation: "executeQuery",
      query:
        "SELECT sub.respuesta\nFROM (SELECT 1) seed\nLEFT JOIN LATERAL (\n  SELECT respuesta FROM conocimiento_libre\n  WHERE categoria = 'sin_match'\n    AND array_length(rm_tokens('{{ $('Separar Pedazos').item.json.texto_sql }}'), 1) >= 2\n    AND rm_score(clave || ' ' || pregunta, '{{ $('Separar Pedazos').item.json.texto_sql }}') >= 0.75\n  ORDER BY creado_en DESC LIMIT 1\n) sub ON '{{ $('Separar Pedazos').item.json.categoria }}' = 'otro';",
      options: {},
    },
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [10900, 100],
    id: id(),
    name: "Buscar en Conocimiento Libre (Sin Match)",
    alwaysOutputData: true,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    credentials: POSTGRES_CRED,
  };

  const consolidarDato = {
    parameters: {
      mode: "runOnceForEachItem",
      jsCode:
        "const categoria = $('Separar Pedazos').item.json.categoria;\n" +
        "const texto = $('Separar Pedazos').item.json.texto;\n\n" +
        "let dato = null;\n" +
        "if (categoria === 'precio') {\n" +
        "  const r = $('Buscar Precio Kit Pineado').item.json;\n" +
        "  if (r && r.precio != null) dato = 'Precio: ' + r.precio + (r.detalle ? ('. Detalle: ' + r.detalle) : '');\n" +
        "} else if (categoria === 'envio') {\n" +
        "  const kitEnvio = $('Buscar Envio Kit Pineado').item.json;\n" +
        "  if (kitEnvio && kitEnvio.envio != null) {\n" +
        "    dato = kitEnvio.envio;\n" +
        "  } else {\n" +
        "    const general = $('Buscar Info Negocio (Envio General)').item.json;\n" +
        "    if (general && general.respuesta != null) dato = general.respuesta;\n" +
        "  }\n" +
        "} else if (categoria === 'negocio') {\n" +
        "  const r = $('Buscar Info Negocio (Negocio)').item.json;\n" +
        "  if (r && r.respuesta != null) dato = r.respuesta;\n" +
        "} else {\n" +
        "  const r = $('Buscar en Conocimiento Libre (Sin Match)').item.json;\n" +
        "  if (r && r.respuesta != null) dato = r.respuesta;\n" +
        "}\n\n" +
        "return { json: { texto, categoria, dato_texto: dato || 'SIN_DATO' } };\n",
    },
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [11170, 100],
    id: id(),
    name: "Consolidar Dato Resuelto",
  };

  const redactarRespuesta = {
    parameters: {
      promptType: "define",
      text: "=Pregunta del cliente: {{ $json.texto }}\n\nDato aprobado para responder: {{ $json.dato_texto }}",
      options: {
        systemMessage:
          "Redactá una respuesta corta y natural para mandarle a un cliente por WhatsApp, en primera persona como si fueras parte del negocio (nunca reveles que sos un asistente o una IA, nunca muestres duda). Usá ÚNICAMENTE la información del \"Dato aprobado\" que te paso -- no agregues ningún dato, condición, precio ni detalle que no esté ahí, no inventes ni completes nada por tu cuenta. Si el \"Dato aprobado\" es exactamente \"SIN_DATO\", no redactes nada: respondé únicamente el texto exacto SIN_DATO, sin comillas y sin ningún otro texto. Si hay un dato real, respondé solamente el mensaje final en texto plano, sin JSON, sin comillas, sin explicaciones.",
      },
    },
    type: "@n8n/n8n-nodes-langchain.agent",
    typeVersion: 2,
    position: [11440, 100],
    id: id(),
    name: "Redactar Respuesta desde Dato",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
  };

  const deepseekRedaccion = {
    parameters: { model: "deepseek-v4-flash", options: { temperature: 0, timeout: 25000, maxRetries: 2 } },
    type: "@n8n/n8n-nodes-langchain.lmChatDeepSeek",
    typeVersion: 1,
    position: [11440, 300],
    id: id(),
    name: "DeepSeek Chat Model - Redaccion",
    credentials: DEEPSEEK_CRED,
  };

  const marcarResueltoONo = {
    parameters: {
      mode: "runOnceForEachItem",
      jsCode:
        "const mensaje = (($json.output || '').toString().trim());\n" +
        "const resuelto = !!mensaje && mensaje !== 'SIN_DATO';\n" +
        "return { json: {\n" +
        "  texto: $('Consolidar Dato Resuelto').item.json.texto,\n" +
        "  categoria: $('Consolidar Dato Resuelto').item.json.categoria,\n" +
        "  resuelto,\n" +
        "  mensaje: resuelto ? mensaje : '',\n" +
        "} };\n",
    },
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [11710, 100],
    id: id(),
    name: "Marcar Resuelto o No Resuelto",
  };

  const aggregatePiezas = {
    parameters: { aggregate: "aggregateAllItemData", destinationFieldName: "piezas", include: "allFields", options: {} },
    type: "n8n-nodes-base.aggregate",
    typeVersion: 1,
    position: [11980, 100],
    id: id(),
    name: "Aggregate Piezas Sub-preguntas",
  };

  const armarMensajes = {
    parameters: {
      jsCode:
        "const piezas = $json.piezas || [];\n" +
        "const prioridad = { precio: 0, envio: 1, negocio: 2, otro: 3 };\n\n" +
        "const resueltas = piezas.filter((p) => p.resuelto && p.mensaje)\n" +
        "  .sort((a, b) => (prioridad[a.categoria] ?? 9) - (prioridad[b.categoria] ?? 9));\n" +
        "const noResueltas = piezas.filter((p) => !p.resuelto || !p.mensaje);\n\n" +
        "let mensaje1 = null, mensaje2 = null;\n" +
        "if (resueltas.length === 1) {\n" +
        "  mensaje1 = resueltas[0].mensaje;\n" +
        "} else if (resueltas.length >= 2) {\n" +
        "  mensaje1 = resueltas[0].mensaje;\n" +
        "  mensaje2 = resueltas.slice(1).map((p) => p.mensaje).join('\\n\\n');\n" +
        "}\n\n" +
        "const piezasSinResolver = noResueltas.map((p) => p.texto).filter(Boolean).join('; ');\n" +
        "const escapar = (s) => (s || '').toString().replace(/'/g, \"''\");\n\n" +
        "return [{ json: {\n" +
        "  hayMensajes: !!mensaje1,\n" +
        "  mensaje1: mensaje1 || '',\n" +
        "  mensaje2: mensaje2 || '',\n" +
        "  hayMensaje2: !!mensaje2,\n" +
        "  haySinResolver: noResueltas.length > 0,\n" +
        "  piezas_sin_resolver_sql: escapar(piezasSinResolver),\n" +
        "} }];\n",
    },
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [12250, 100],
    id: id(),
    name: "Armar Mensajes",
  };

  // --- A partir de aca, un unico item -> bifurcar en paralelo es seguro
  // (mismo patron que "Ruteo Clasificacion" ya en produccion): ninguna de
  // las dos ramas necesita rejuntarse con la otra despues. ---

  const hayMensajesParaCliente = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [{ id: id(), leftValue: "={{ $json.hayMensajes }}", rightValue: true, operator: { type: "boolean", operation: "equals" } }],
        combinator: "and",
      },
      options: {},
    },
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [12520, -50],
    id: id(),
    name: "¿Hay Mensajes Para el Cliente?",
  };

  const enviarMensaje1 = {
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
        "={{ JSON.stringify({ conversation_id: $('Webhook1').item.json.body.conversation.messages[0].conversation_id, account_id: $('Webhook1').item.json.body.account.id, content: $json.mensaje1, origen: 'sub_preguntas_2_0', contacto: ($('Webhook1').item.json.body.conversation?.meta?.sender?.name || $('Webhook1').item.json.body.sender?.name || ''), foto_url: null }) }}",
      options: { timeout: 20000 },
    },
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [12790, -120],
    id: id(),
    name: "Enviar Mensaje 1 (Sub-pregunta)",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
  };

  const hayMensaje2 = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [{ id: id(), leftValue: "={{ $('Armar Mensajes').item.json.hayMensaje2 }}", rightValue: true, operator: { type: "boolean", operation: "equals" } }],
        combinator: "and",
      },
      options: {},
    },
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [13060, -120],
    id: id(),
    name: "¿Hay Mensaje 2?",
  };

  const enviarMensaje2 = {
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
        "={{ JSON.stringify({ conversation_id: $('Webhook1').item.json.body.conversation.messages[0].conversation_id, account_id: $('Webhook1').item.json.body.account.id, content: $('Armar Mensajes').item.json.mensaje2, origen: 'sub_preguntas_2_0', contacto: ($('Webhook1').item.json.body.conversation?.meta?.sender?.name || $('Webhook1').item.json.body.sender?.name || ''), foto_url: null }) }}",
      options: { timeout: 20000 },
    },
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [13330, -170],
    id: id(),
    name: "Enviar Mensaje 2 (Sub-pregunta)",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
  };

  const finSubpreguntasRespondidas = {
    parameters: {},
    type: "n8n-nodes-base.noOp",
    typeVersion: 1,
    position: [13600, -120],
    id: id(),
    name: "Fin - Sub-preguntas Respondidas",
  };

  const hayPiezasSinResolver = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [{ id: id(), leftValue: "={{ $json.haySinResolver }}", rightValue: true, operator: { type: "boolean", operation: "equals" } }],
        combinator: "and",
      },
      options: {},
    },
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [12520, 350],
    id: id(),
    name: "¿Hay Piezas Sin Resolver?",
  };

  const yaHayPendienteSinMatch = {
    parameters: {
      operation: "executeQuery",
      query:
        "SELECT id FROM preguntas_sin_match_pendientes\nWHERE conversation_id = {{ $('Webhook1').item.json.body.conversation.messages[0].conversation_id }} AND estado = 'pendiente'\nLIMIT 1;",
      options: {},
    },
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [12790, 350],
    id: id(),
    name: "¿Ya Hay Pendiente Sin Match?",
    alwaysOutputData: true,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    credentials: POSTGRES_CRED,
  };

  const yaExisteSinMatch = {
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
    position: [13060, 350],
    id: id(),
    name: "¿Ya Existe Pendiente Sin Match?",
  };

  const registrarPendienteSinMatch = {
    parameters: {
      operation: "executeQuery",
      query:
        "INSERT INTO preguntas_sin_match_pendientes (conversation_id, pregunta_original)\nVALUES ({{ $('Webhook1').item.json.body.conversation.messages[0].conversation_id }}, '{{ $('Armar Mensajes').item.json.piezas_sin_resolver_sql }}');",
      options: {},
    },
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [13330, 450],
    id: id(),
    name: "Registrar Pendiente Sin Match",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    credentials: POSTGRES_CRED,
  };

  const prepararNotaEscaladoSinMatch = {
    parameters: {
      assignments: {
        assignments: [
          {
            id: id(),
            name: "motivo",
            value:
              "=El cliente preguntó algo que todavía no supimos ubicar: \"{{ $('Armar Mensajes').item.json.piezas_sin_resolver_sql }}\". Respondé acá mismo (es privado, el cliente no lo ve) y en cuanto contestes se lo paso al cliente y queda guardado para la próxima vez que pregunten algo parecido.",
            type: "string",
          },
        ],
      },
      includeOtherFields: false,
      options: {},
    },
    type: "n8n-nodes-base.set",
    typeVersion: 3.4,
    position: [13600, 450],
    id: id(),
    name: "Preparar Nota Escalado Sin Match",
  };

  const enviarNotaEscaladoSinMatch = {
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
    position: [13870, 450],
    id: id(),
    name: "Enviar Nota Escalado Sin Match",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    onError: "continueErrorOutput",
  };

  const finEscaladoSinMatchRegistrado = {
    parameters: {},
    type: "n8n-nodes-base.noOp",
    typeVersion: 1,
    position: [14140, 450],
    id: id(),
    name: "Fin - Escalado Sin Match Registrado",
  };

  return {
    prepararContexto, dividirEtiquetar, deepseekSplit, parsearSubpreguntas, separarPedazos,
    buscarPrecioKit, buscarEnvioKit, buscarEnvioGeneral,
    extraerTemaNegocioSub, deepseekTemaNegocio, parsearTemaNegocio, buscarInfoNegocioNegocio,
    buscarConocimientoLibre, consolidarDato,
    redactarRespuesta, deepseekRedaccion, marcarResueltoONo,
    aggregatePiezas, armarMensajes,
    hayMensajesParaCliente, enviarMensaje1, hayMensaje2, enviarMensaje2, finSubpreguntasRespondidas,
    hayPiezasSinResolver, yaHayPendienteSinMatch, yaExisteSinMatch, registrarPendienteSinMatch,
    prepararNotaEscaladoSinMatch, enviarNotaEscaladoSinMatch, finEscaladoSinMatchRegistrado,
  };
}

async function main() {
  // Backup del estado actual (con el bug) por las dudas, aunque no lo usemos
  // como base -- documentar que existio y que se reemplazo.
  const live = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(live, null, 0));
  console.log("Backup del estado con bug (v1) guardado. Nodos actuales:", live.nodes.length);

  const wf = JSON.parse(readFileSync(CLEAN_BASE_PATH, "utf8"));
  console.log("Partiendo de la base limpia pre-fase6. Nodos:", wf.nodes.length);

  const finSinMatchNode = wf.nodes.find((n) => n.name === "Fin - Sin Match (todavia sin manejar)");
  if (!finSinMatchNode) throw new Error('No se encontro el nodo "Fin - Sin Match (todavia sin manejar)"');
  if (!wf.connections["¿Hay Kit Pineado?"]) throw new Error('No se encontro "¿Hay Kit Pineado?"');
  if (!wf.connections["¿Es Compatibilidad Con Modelo?"]) throw new Error('No se encontro "¿Es Compatibilidad Con Modelo?"');

  const n = buildNodes();
  const newNodes = Object.values(n);
  const nodes = [...wf.nodes, ...newNodes];
  const connections = JSON.parse(JSON.stringify(wf.connections));

  connections["¿Hay Kit Pineado?"].main[1] = [{ node: n.prepararContexto.name, type: "main", index: 0 }];
  connections["¿Es Compatibilidad Con Modelo?"].main[1] = [{ node: n.prepararContexto.name, type: "main", index: 0 }];

  connections[n.prepararContexto.name] = { main: [[{ node: n.dividirEtiquetar.name, type: "main", index: 0 }]] };
  connections[n.deepseekSplit.name] = { ai_languageModel: [[{ node: n.dividirEtiquetar.name, type: "ai_languageModel", index: 0 }]] };
  connections[n.dividirEtiquetar.name] = { main: [[{ node: n.parsearSubpreguntas.name, type: "main", index: 0 }]] };
  connections[n.parsearSubpreguntas.name] = { main: [[{ node: n.separarPedazos.name, type: "main", index: 0 }]] };
  connections[n.separarPedazos.name] = { main: [[{ node: n.buscarPrecioKit.name, type: "main", index: 0 }]] };

  // --- Camino lineal unico, sin bifurcar ---
  connections[n.buscarPrecioKit.name] = { main: [[{ node: n.buscarEnvioKit.name, type: "main", index: 0 }]] };
  connections[n.buscarEnvioKit.name] = { main: [[{ node: n.buscarEnvioGeneral.name, type: "main", index: 0 }]] };
  connections[n.buscarEnvioGeneral.name] = { main: [[{ node: n.extraerTemaNegocioSub.name, type: "main", index: 0 }]] };
  connections[n.deepseekTemaNegocio.name] = { ai_languageModel: [[{ node: n.extraerTemaNegocioSub.name, type: "ai_languageModel", index: 0 }]] };
  connections[n.extraerTemaNegocioSub.name] = { main: [[{ node: n.parsearTemaNegocio.name, type: "main", index: 0 }]] };
  connections[n.parsearTemaNegocio.name] = { main: [[{ node: n.buscarInfoNegocioNegocio.name, type: "main", index: 0 }]] };
  connections[n.buscarInfoNegocioNegocio.name] = { main: [[{ node: n.buscarConocimientoLibre.name, type: "main", index: 0 }]] };
  connections[n.buscarConocimientoLibre.name] = { main: [[{ node: n.consolidarDato.name, type: "main", index: 0 }]] };
  connections[n.consolidarDato.name] = { main: [[{ node: n.redactarRespuesta.name, type: "main", index: 0 }]] };
  connections[n.deepseekRedaccion.name] = { ai_languageModel: [[{ node: n.redactarRespuesta.name, type: "ai_languageModel", index: 0 }]] };
  connections[n.redactarRespuesta.name] = { main: [[{ node: n.marcarResueltoONo.name, type: "main", index: 0 }]] };
  connections[n.marcarResueltoONo.name] = { main: [[{ node: n.aggregatePiezas.name, type: "main", index: 0 }]] };
  connections[n.aggregatePiezas.name] = { main: [[{ node: n.armarMensajes.name, type: "main", index: 0 }]] };

  // --- Fan-out final en paralelo (seguro: ninguna rama necesita rejuntarse) ---
  connections[n.armarMensajes.name] = {
    main: [[
      { node: n.hayMensajesParaCliente.name, type: "main", index: 0 },
      { node: n.hayPiezasSinResolver.name, type: "main", index: 0 },
    ]],
  };

  connections[n.hayMensajesParaCliente.name] = { main: [[{ node: n.enviarMensaje1.name, type: "main", index: 0 }]] };
  connections[n.enviarMensaje1.name] = { main: [[{ node: n.hayMensaje2.name, type: "main", index: 0 }]] };
  connections[n.hayMensaje2.name] = {
    main: [
      [{ node: n.enviarMensaje2.name, type: "main", index: 0 }],
      [{ node: n.finSubpreguntasRespondidas.name, type: "main", index: 0 }],
    ],
  };
  connections[n.enviarMensaje2.name] = { main: [[{ node: n.finSubpreguntasRespondidas.name, type: "main", index: 0 }]] };

  connections[n.hayPiezasSinResolver.name] = { main: [[{ node: n.yaHayPendienteSinMatch.name, type: "main", index: 0 }]] };
  connections[n.yaHayPendienteSinMatch.name] = { main: [[{ node: n.yaExisteSinMatch.name, type: "main", index: 0 }]] };
  connections[n.yaExisteSinMatch.name] = {
    main: [
      [{ node: finSinMatchNode.name, type: "main", index: 0 }],
      [{ node: n.registrarPendienteSinMatch.name, type: "main", index: 0 }],
    ],
  };
  connections[n.registrarPendienteSinMatch.name] = { main: [[{ node: n.prepararNotaEscaladoSinMatch.name, type: "main", index: 0 }]] };
  connections[n.prepararNotaEscaladoSinMatch.name] = { main: [[{ node: n.enviarNotaEscaladoSinMatch.name, type: "main", index: 0 }]] };
  connections[n.enviarNotaEscaladoSinMatch.name] = { main: [[{ node: n.finEscaladoSinMatchRegistrado.name, type: "main", index: 0 }]] };

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
