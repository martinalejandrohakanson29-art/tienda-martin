// Fase 10: cuando el primer mensaje de una rafaga coincide letra por letra
// con la plantilla publicitaria de un kit, pero el cliente agrega algo mas
// a continuacion en el mismo arranque (ej. "que valen"), el matching
// dejaba de reconocer el kit del todo -- comparaba la plantilla contra el
// TEXTO COMPLETO agrupado, no contra el primer mensaje solo, asi que
// cualquier frase de mas rompia el match y todo caia en sin_match.
// Caso real: contacto +5492954875916 (conv 1900, 2026-08-13), escribio la
// plantilla exacta del Kit 8 (combo TAPA CDI + CILINDRO 120) y 4 segundos
// despues "que valen" -- nunca recibio ni el saludo ni el precio.
//
// Fix (charlado con el usuario antes de tocar produccion, ver conversacion):
//  1) "Clasificar Mensaje (sin IA)" ahora compara la plantilla SOLO contra
//     el primer mensaje de la rafaga ("Unir Mensajes" ahora expone
//     primer_mensaje / resto_mensaje ademas de texto_completo).
//  2) Si matchea y no hay resto -> exactamente el comportamiento de
//     siempre, cero cambios.
//  3) Si matchea y SI hay resto -> antes de dar el kit por confirmado, un
//     paso chico de IA acotada ("Validar Continuidad de Tema", mismo
//     patron que la Fase 6) mira el resto y decide: sigue siendo sobre
//     este kit (precio/envio/stock/forma de pago/algo generico) o es un
//     tema distinto. Ante la duda, responde que es tema distinto (el
//     camino seguro, no el que asume) -- filosofia del proyecto: nunca
//     asumir, escalar cuando no hay certeza.
//     - Mismo tema: se manda el saludo del kit y se pinea IGUAL que hoy,
//       y el resto ("que valen") se resuelve en el mismo intercambio
//       reutilizando el pipeline que YA EXISTE para "kit pineado + nueva
//       pregunta" (compatibilidad / Fase 6 precio-envio-negocio) -- se
//       llega ahi re-entrando por "Leer Kit Pineado" justo despues de
//       pinear, asi que el pin ya esta escrito en Redis cuando se relee.
//     - Tema distinto: NO se manda el saludo de ese kit (aunque la
//       primera frase matcheo letra por letra) y NO se pinea nada. Todo
//       el mensaje se trata como si no hubiera matcheado ninguna
//       plantilla -- se re-usa el mismo camino "sin_match" que ya existe,
//       sin inventar nada nuevo para este caso.
//  4) "Dividir y Etiquetar Sub-preguntas" y "Extraer Pregunta
//     Compatibilidad" (ambos, hoy, leen el texto fijo de "Unir Mensajes")
//     ahora prefieren el resto_mensaje cuando existe, para no reprocesar
//     la frase de la plantilla ya resuelta por el saludo.
//
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { randomUUID } from "crypto";
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fase10-continuidad-plantilla-con-resto_2026-08-13.json", import.meta.url);

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

const DEEPSEEK_CRED = { deepSeekApi: { id: "6uiYD2nzluzyDXnZ", name: "DeepSeek account" } };

function id() { return randomUUID(); }

function buildNodes() {
  const hayRestoEnLaRafaga = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [
          { id: id(), leftValue: "={{ $json.resto_mensaje }}", rightValue: "", operator: { type: "string", operation: "notEmpty", singleValue: true } },
        ],
        combinator: "and",
      },
      options: {},
    },
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [4480, -208],
    id: id(),
    name: "¿Hay Resto en la Rafaga?",
  };

  const validarContinuidad = {
    parameters: {
      promptType: "define",
      text: "={{ $json.resto_mensaje }}",
      options: {
        systemMessage:
          "=El cliente escribio, en el mismo arranque de conversacion, un primer mensaje que coincide EXACTO con la plantilla publicitaria del kit \"{{ $json.kit_nombre }}\" (por eso ya sabemos que ese es el kit del que se trata). Ahora tenes el TEXTO QUE AGREGO A CONTINUACION, en el mismo momento. Decidi si ese texto adicional SIGUE siendo sobre ESE MISMO kit (por ejemplo: pregunta el precio, el envio, la forma de pago, el stock, o cualquier pregunta generica sobre el) o si el cliente esta hablando de un producto o tema DISTINTO (por ejemplo: menciona explicitamente que en realidad busca otra cosa, un repuesto distinto, se arrepiente, o cambia de tema).\n\nRespondé ÚNICAMENTE con un JSON válido, sin texto adicional, con este formato exacto:\n{\"mismo_tema\": true o false}\n\nAnte la duda, respondé false (tratalo como tema distinto, para que se resuelva por el camino normal en vez de asumir) -- SOLO respondé true cuando el texto sea claramente una continuación natural sobre el mismo kit.",
      },
    },
    type: "@n8n/n8n-nodes-langchain.agent",
    typeVersion: 2,
    position: [4750, -100],
    id: id(),
    name: "Validar Continuidad de Tema",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
  };

  const deepseekContinuidad = {
    parameters: { model: "deepseek-v4-flash", options: { temperature: 0, timeout: 25000, maxRetries: 2 } },
    type: "@n8n/n8n-nodes-langchain.lmChatDeepSeek",
    typeVersion: 1,
    position: [4750, 100],
    id: id(),
    name: "DeepSeek Chat Model - Continuidad de Tema",
    credentials: DEEPSEEK_CRED,
  };

  const parsearContinuidad = {
    parameters: {
      jsCode:
        "let mismoTema = false;\n" +
        "try {\n" +
        "  const raw = ($json.output || '{}').toString().trim();\n" +
        "  const clean = raw.replace(/```json|```/g, '').trim();\n" +
        "  const parsed = JSON.parse(clean);\n" +
        "  mismoTema = parsed.mismo_tema === true;\n" +
        "} catch (e) {}\n\n" +
        "const previo = $('¿Hay Resto en la Rafaga?').item.json;\n" +
        "return [{ json: {\n" +
        "  mismo_tema: mismoTema,\n" +
        "  kit_id: previo.kit_id,\n" +
        "  kit_nombre: previo.kit_nombre,\n" +
        "  mensaje_bienvenida: previo.mensaje_bienvenida,\n" +
        "  foto_url: previo.foto_url,\n" +
        "  resto_mensaje: previo.resto_mensaje,\n" +
        "} }];\n",
    },
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [5020, -100],
    id: id(),
    name: "Parsear Continuidad de Tema",
  };

  const esMismoTema = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [
          { id: id(), leftValue: "={{ $json.mismo_tema }}", rightValue: true, operator: { type: "boolean", operation: "equals" } },
        ],
        combinator: "and",
      },
      options: {},
    },
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [5290, -100],
    id: id(),
    name: "¿Es Mismo Tema?",
  };

  const hayRestoParaResolver = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [
          { id: id(), leftValue: "={{ $('Clasificar Mensaje (sin IA)').item.json.resto_mensaje }}", rightValue: "", operator: { type: "string", operation: "notEmpty", singleValue: true } },
        ],
        combinator: "and",
      },
      options: {},
    },
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [4750, -650],
    id: id(),
    name: "¿Hay Resto Para Resolver?",
  };

  return { hayRestoEnLaRafaga, validarContinuidad, deepseekContinuidad, parsearContinuidad, esMismoTema, hayRestoParaResolver };
}

const UNIR_MENSAJES_JS = `// El buffer de Redis guarda mas nuevo primero (push = LPUSH), por eso se
// invierte antes de unir. Si el cliente mando "Hola" y despues "quiero el
// combo 110 a 120" en dos mensajes seguidos, acá quedan juntos en un solo
// texto para que el resto del flujo los trate como una sola consulta.
//
// primer_mensaje / resto_mensaje (Fase 10, 2026-08-13): ademas del texto
// unido, se expone por separado el PRIMER mensaje de la rafaga y todo lo
// que vino despues -- necesario para que el matching de plantilla exacta
// (Clasificar Mensaje) se compare solo contra el primer mensaje, sin que
// una frase agregada a continuacion (ej. "que valen") rompa el match.
const raw = $('Traer Buffer').item.json.message || [];
const mensajesOrdenados = raw
  .slice()
  .reverse()
  .map((s) => {
    try {
      const obj = typeof s === 'string' ? JSON.parse(s) : s;
      return obj?.message || '';
    } catch (e) {
      return String(s);
    }
  });

const textoCompleto = mensajesOrdenados.join('\\n');
const primerMensaje = mensajesOrdenados[0] || '';
const restoMensaje = mensajesOrdenados.slice(1).join('\\n');

return [{ json: { texto_completo: textoCompleto, primer_mensaje: primerMensaje, resto_mensaje: restoMensaje } }];
`;

const CLASIFICAR_MENSAJE_JS = `// Clasificacion sin IA, en orden de confianza:
//  1) plantilla exacta: el PRIMER mensaje de la rafaga coincide letra por
//     letra (normalizado) con una linea del campo "Plantillas exactas de
//     Instagram/Meta Ads" del kit -> kit. Se compara SOLO contra el primer
//     mensaje (no contra toda la rafaga unida) desde la Fase 10
//     (2026-08-13): antes se comparaba contra el texto completo agrupado,
//     y un cliente que escribia la plantilla exacta y agregaba algo mas
//     unos segundos despues (ej. "que valen") rompia el match del todo y
//     caia en sin_match sin necesidad -- ver
//     n8n-workflows/CHATWOOT-BOT-CONTEXTO.md. Si hay algo despues del
//     primer mensaje, se pasa en "resto_mensaje" y un paso de IA acotada
//     mas adelante ("Validar Continuidad de Tema") decide si sigue siendo
//     sobre el mismo kit o es un tema distinto antes de dar el pin por
//     bueno.
//  2) si no matcheo ningun kit pero el mensaje es un saludo sin pedido
//     especifico (ej. "Hola", "Hola buenas tarde", "quiero mas info") -> saludo
//  3) cualquier otra cosa -> sin_match (todavia sin manejar)
//
// Por que no keywords: la cobertura de keywords (ej. alias "kit 120" de
// 2 palabras sueltas) matcheaba mensajes que solo tenian esas palabras
// dispersas en el texto sin relacion real, ej. una consulta de precio de
// piezas sueltas ("...consulto que sale el kit de 120 tapa de cilindro
// cdi...") disparaba el saludo del combo como si fuera la respuesta
// correcta. Se probo agregar una guarda por palabras de precio y no alcanzo
// — el usuario pidio sacar "keywords" del matching por completo y dejar
// SOLO la plantilla exacta, que no tiene ambiguedad posible porque es
// texto literal.
const kits = $('Buscar Kits Activos').item.json.kits || [];
const mensaje = ($('Unir Mensajes').item.json.texto_completo || '').toString();
const primerMensaje = ($('Unir Mensajes').item.json.primer_mensaje || '').toString();
const restoMensaje = ($('Unir Mensajes').item.json.resto_mensaje || '').toString().trim();

const STOPWORDS = new Set([
  'para','con','del','las','los','una','uno','que','por','sus','esa','ese','esta','este','hay',
  'mas','tiene','tienen','quiero','necesito','busco','tengo','como','cual','cuanto',
  // saludo / relleno (para que "Hola, queria mas info" quede sin tokens de contenido)
  'hola','holis','buenas','buenos','buen','dias','dia','tardes','tarde','noches','noche','tal',
  'hey','alo','informacion','info','ayuda','favor','porfa','porfavor','consultar','saber','onda',
  'todo','bien','gracias','disculpa','disculpe','perdon',
]);

const normalizar = (s) => s.toString().trim().toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/\\s+/g, ' ');

function tokens(txt) {
  const plano = normalizar(txt).replace(/[^a-z0-9]+/g, ' ');
  const vistos = new Set();
  for (const t of plano.split(' ')) {
    if (t.length < 3 || STOPWORDS.has(t)) continue;
    vistos.add(t.replace(/s$/, ''));
  }
  return [...vistos];
}

const mensajeNorm = normalizar(mensaje);
const primerMensajeNorm = normalizar(primerMensaje);
const mensajeTokens = tokens(mensaje);

function salidaKit(tipo, kit) {
  return [{ json: { tipo: 'kit', deteccion: tipo, kit_id: kit.id, kit_nombre: kit.nombre, mensaje_bienvenida: kit.mensaje_bienvenida, foto_url: kit.foto_url || null, resto_mensaje: restoMensaje } }];
}

// 1) Plantilla exacta (solo contra el primer mensaje de la rafaga)
for (const kit of kits) {
  const plantillas = (kit.plantillas_bienvenida || '').split('\\n').map(normalizar).filter(Boolean);
  if (plantillas.includes(primerMensajeNorm)) return salidaKit('plantilla_exacta', kit);
}

// 2) Saludo sin pedido especifico: tiene alguna palabra de saludo Y no le
// quedan palabras de contenido despues de sacar saludo/relleno.
const GREETING_WORDS = ['hola', 'holis', 'buenas', 'buenos', 'que tal', 'hey', 'alo'];
const tieneSaludo = GREETING_WORDS.some((w) => mensajeNorm.includes(w));
if (tieneSaludo && mensajeTokens.length === 0) {
  return [{ json: { tipo: 'saludo' } }];
}

// 3) Sin match
return [{ json: { tipo: 'sin_match' } }];
`;

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const unirMensajesNode = wf.nodes.find((n) => n.name === "Unir Mensajes");
  if (!unirMensajesNode) throw new Error('No se encontro el nodo "Unir Mensajes"');
  const clasificarNode = wf.nodes.find((n) => n.name === "Clasificar Mensaje (sin IA)");
  if (!clasificarNode) throw new Error('No se encontro el nodo "Clasificar Mensaje (sin IA)"');
  const dividirEtiquetarNode = wf.nodes.find((n) => n.name === "Dividir y Etiquetar Sub-preguntas");
  if (!dividirEtiquetarNode) throw new Error('No se encontro el nodo "Dividir y Etiquetar Sub-preguntas" (correr Fase 6 primero)');
  const extraerCompatibilidadNode = wf.nodes.find((n) => n.name === "Extraer Pregunta Compatibilidad");
  if (!extraerCompatibilidadNode) throw new Error('No se encontro el nodo "Extraer Pregunta Compatibilidad"');
  const ruteoClasificacionNode = wf.nodes.find((n) => n.name === "Ruteo Clasificacion");
  if (!ruteoClasificacionNode) throw new Error('No se encontro el nodo "Ruteo Clasificacion"');
  const marcarKitPineadoNode = wf.nodes.find((n) => n.name === "Marcar Kit Pineado");
  if (!marcarKitPineadoNode) throw new Error('No se encontro el nodo "Marcar Kit Pineado"');
  const leerKitPineadoNode = wf.nodes.find((n) => n.name === "Leer Kit Pineado");
  if (!leerKitPineadoNode) throw new Error('No se encontro el nodo "Leer Kit Pineado"');
  if (!wf.connections["Ruteo Clasificacion"]) throw new Error('No se encontraron conexiones de "Ruteo Clasificacion"');

  // --- Edits en nodos existentes (in place) ---
  unirMensajesNode.parameters.jsCode = UNIR_MENSAJES_JS;
  clasificarNode.parameters.jsCode = CLASIFICAR_MENSAJE_JS;
  dividirEtiquetarNode.parameters.text = "={{ $('Clasificar Mensaje (sin IA)').item.json.resto_mensaje || $('Unir Mensajes').item.json.texto_completo }}";
  extraerCompatibilidadNode.parameters.text = "=Mensaje del cliente: {{ $('Clasificar Mensaje (sin IA)').item.json.resto_mensaje || $('Unir Mensajes').item.json.texto_completo }}";

  const n = buildNodes();
  const newNodes = [n.hayRestoEnLaRafaga, n.validarContinuidad, n.deepseekContinuidad, n.parsearContinuidad, n.esMismoTema, n.hayRestoParaResolver];

  const nodes = [...wf.nodes, ...newNodes];
  const connections = JSON.parse(JSON.stringify(wf.connections));

  // "Kit" (output 0) de Ruteo Clasificacion ya no va directo a saludo+pin:
  // primero chequea si hay resto para analizar.
  connections["Ruteo Clasificacion"].main[0] = [{ node: n.hayRestoEnLaRafaga.name, type: "main", index: 0 }];

  connections[n.hayRestoEnLaRafaga.name] = {
    main: [
      [{ node: n.validarContinuidad.name, type: "main", index: 0 }], // TRUE: hay resto -> validar antes de confirmar
      [
        { node: "Enviar Saludo Kit", type: "main", index: 0 },
        { node: "Marcar Kit Pineado", type: "main", index: 0 },
      ], // FALSE: sin resto -> camino de siempre, sin cambios
    ],
  };

  connections[n.deepseekContinuidad.name] = { ai_languageModel: [[{ node: n.validarContinuidad.name, type: "ai_languageModel", index: 0 }]] };
  connections[n.validarContinuidad.name] = { main: [[{ node: n.parsearContinuidad.name, type: "main", index: 0 }]] };
  connections[n.parsearContinuidad.name] = { main: [[{ node: n.esMismoTema.name, type: "main", index: 0 }]] };

  connections[n.esMismoTema.name] = {
    main: [
      [
        { node: "Enviar Saludo Kit", type: "main", index: 0 },
        { node: "Marcar Kit Pineado", type: "main", index: 0 },
      ], // TRUE: mismo tema -> saludo + pin normal
      [{ node: leerKitPineadoNode.name, type: "main", index: 0 }], // FALSE: tema distinto -> tratar como sin_match, sin saludar ni pinear
    ],
  };

  // Marcar Kit Pineado antes no tenia salida (fire-and-forget). Ahora, si
  // hay resto para resolver, sigue directo al pipeline de "kit ya pineado"
  // releyendo el pin recien escrito -- si no hay resto (caso normal de
  // siempre), este chequeo no hace nada.
  connections[marcarKitPineadoNode.name] = { main: [[{ node: n.hayRestoParaResolver.name, type: "main", index: 0 }]] };
  connections[n.hayRestoParaResolver.name] = {
    main: [
      [{ node: leerKitPineadoNode.name, type: "main", index: 0 }], // TRUE
      [], // FALSE: nada mas que hacer
    ],
  };

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
