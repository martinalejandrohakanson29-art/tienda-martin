// Dos bugs relacionados encontrados revisando en vivo la conv 2191 (+5493541219301, 2026-08-19):
//
// 1. "cierre" se repite sin parar. El cliente escribio "Sisi" (20:33) -> "Dale, cualquier cosa
//    nos escribis.", y 12 minutos despues "SiI" (20:45) -> EL MISMO texto de nuevo. La categoria
//    "cierre" (Fase del 18/8) siempre resuelve al mismo texto fijo, sin memoria de que ya se lo
//    dijo antes en la conversacion -- cada afirmacion nueva del cliente dispara un mensaje
//    identico, sonando repetitivo/robotico. Pedido explicito de Martin: "salvo que exista alguna
//    consulta nueva, no sigamos respondiendo mas".
//
// 2. "Si lomas seguro es que me llege" (20:58, con errores de tipeo por "Si lo mas seguro es que
//    me llegue") se clasifico como "envio" (el bullet actual matchea con solo mencionar
//    "llegar"/"envio", sin exigir una pregunta concreta) y disparo la respuesta generica fija de
//    Andreani -- que no tenia nada que ver. Mirando la conversacion completa, este mensaje es en
//    realidad la misma familia que el bug 1: un comentario ambiguo de afirmacion, no una pregunta
//    real de envio (de hecho un humano tuvo que intervenir 3 minutos despues -- confirma que
//    necesitaba escalar, no una respuesta generica). Charlado con Martin: unificar el criterio,
//    no mejorar el parseo puntual de ortografia.
//
// Fix bug 1 (Redis, patron ya usado para kit_pineado/bot_pausado): nodo nuevo "Buscar Cierre
// Reciente (Sub-pregunta)" (GET, key cierre_reciente:{telefono|conv}) insertado justo antes de
// "Consolidar Dato Resuelto" (unico punto seguro de la cadena lineal -- ese nodo ya usa
// referencias explicitas $('Nodo').item, no $json a secas, asi que insertar ahi no rompe nada,
// a diferencia de otros puntos de esta cadena que si dependen del predecesor inmediato). Si la
// rama "cierre" encuentra el flag ya prendido, la pieza se marca "omitir" (resuelto=true,
// mensaje='') en vez de "SIN_DATO" (que escalaria) -- "Armar Mensajes" ahora excluye del todo las
// piezas "omitir" de ambos lados (ni se manda, ni se escala). Cuando SI se manda un cierre nuevo,
// una rama paralela nueva colgando de "Armar Mensajes" (no se inserta en la cadena existente, asi
// que no rompe los $json a secas que ya leen "hayMensajes"/"haySinResolver") prende el flag por
// 24hs.
//
// Fix bug 2 (solo prompt): se tightening el bullet "envio" de "Dividir y Etiquetar Sub-preguntas"
// para exigir una pregunta concreta, no solo la mencion de la palabra "llegar"/"envio" -- con el
// caso real como ejemplo. Con esto, un comentario ambiguo como el del caso real cae en "otro" (que
// intenta el detalle del kit/conocimiento libre y si no hay nada, escala en silencio al equipo --
// exactamente lo que paso en la realidad) en vez de la respuesta generica equivocada.
//
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";
import { randomUUID } from "crypto";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-cierre-repetido-y-envio-ambiguo_2026-08-19.json", import.meta.url);
const REDIS_CRED = { id: "ZUlkjSz8R2bmmO2f", name: "Redis account 2" };

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

function replaceOnce(text, oldStr, newStr, label) {
  if (!text.includes(oldStr)) {
    throw new Error(`No se encontro el texto esperado para "${label}" -- puede que ya se haya tocado. Revisar a mano antes de seguir.`);
  }
  const first = text.indexOf(oldStr);
  const rest = text.slice(first + oldStr.length);
  if (rest.includes(oldStr)) {
    throw new Error(`El texto esperado para "${label}" aparece mas de una vez -- ambiguo, revisar a mano.`);
  }
  return text.replace(oldStr, newStr);
}

const KEY_EXPR =
  "=cierre_reciente:{{ ($('Webhook1').item.json.body.conversation.messages[0].sender.phone_number || ('conv-' + $('Webhook1').item.json.body.conversation.messages[0].conversation_id)) }}";

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const nodeByName = (name) => {
    const n = wf.nodes.find((x) => x.name === name);
    if (!n) throw new Error(`No se encontro el nodo "${name}"`);
    return n;
  };

  // ========== Fix 2 (prompt): "envio" exige pregunta concreta ==========
  const splitNode = nodeByName("Dividir y Etiquetar Sub-preguntas");
  let sys = splitNode.parameters.options.systemMessage;

  sys = replaceOnce(
    sys,
    `- "envio": pregunta sobre si hacen envíos, a dónde, cómo, o cuánto tarda -- tiene que mencionar explícitamente entrega/mandar/llegar a algún lado. OJO:`,
    `- "envio": pregunta CONCRETA sobre si hacen envíos, a dónde, cómo, o cuánto tarda -- tiene que ser una pregunta real (no un comentario o afirmación suelta) Y mencionar explícitamente entrega/mandar/llegar a algún lado. Un comentario ambiguo que solo roza la palabra "llegar"/"envío" de pasada, sin preguntar nada concreto, NO es "envio" -- ejemplo real: "Si lomas seguro es que me llege" (con errores de tipeo) no pregunta nada puntual sobre el envío, es un comentario ambiguo -- NO es "envio", cae como "otro" (o "cierre" si de verdad no hace falta ninguna respuesta). OJO:`,
    "bullet envio"
  );
  splitNode.parameters.options.systemMessage = sys;
  console.log('"Dividir y Etiquetar Sub-preguntas" actualizado (envio exige pregunta concreta).');

  // ========== Fix 1 (Redis): nodo nuevo "Buscar Cierre Reciente (Sub-pregunta)" ==========
  const conocLibre = nodeByName("Buscar en Conocimiento Libre (Sin Match)");
  const consolidar = nodeByName("Consolidar Dato Resuelto");

  const nBuscarCierre = {
    id: randomUUID(),
    name: "Buscar Cierre Reciente (Sub-pregunta)",
    type: "n8n-nodes-base.redis",
    typeVersion: 1,
    position: [conocLibre.position[0] + 136, conocLibre.position[1] - 160],
    parameters: {
      operation: "get",
      propertyName: "cierre_reciente_raw",
      key: KEY_EXPR,
      options: {},
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 1000,
    credentials: { redis: REDIS_CRED },
  };
  wf.nodes.push(nBuscarCierre);

  const connConocLibre = wf.connections["Buscar en Conocimiento Libre (Sin Match)"];
  if (!connConocLibre || connConocLibre.main?.[0]?.[0]?.node !== "Consolidar Dato Resuelto") {
    throw new Error('Conexion inesperada de "Buscar en Conocimiento Libre (Sin Match)" -- revisar a mano.');
  }
  wf.connections["Buscar en Conocimiento Libre (Sin Match)"] = {
    main: [[{ node: nBuscarCierre.name, type: "main", index: 0 }]],
  };
  wf.connections[nBuscarCierre.name] = {
    main: [[{ node: "Consolidar Dato Resuelto", type: "main", index: 0 }]],
  };
  console.log('Nodo "Buscar Cierre Reciente (Sub-pregunta)" insertado antes de "Consolidar Dato Resuelto".');

  // ========== "Consolidar Dato Resuelto": rama cierre chequea el flag, agrega omitir/es_cierre_nuevo ==========
  let consCode = consolidar.parameters.jsCode;

  consCode = replaceOnce(
    consCode,
    `let dato = null;\nif (categoria === 'precio') {`,
    `let dato = null;\nlet omitir = false;\nlet esCierreNuevo = false;\nif (categoria === 'precio') {`,
    "declaracion omitir/esCierreNuevo"
  );

  consCode = replaceOnce(
    consCode,
    `} else if (categoria === 'cierre') {\n  dato = 'Dale, cualquier cosa nos escribís.';\n} else {`,
    `} else if (categoria === 'cierre') {\n  let yaEnviado = false;\n  try {\n    const raw = $('Buscar Cierre Reciente (Sub-pregunta)').item.json.cierre_reciente_raw;\n    yaEnviado = !!raw;\n  } catch (e) {}\n  if (yaEnviado) {\n    omitir = true;\n  } else {\n    dato = 'Dale, cualquier cosa nos escribís.';\n    esCierreNuevo = true;\n  }\n} else {`,
    "rama cierre con chequeo redis"
  );

  consCode = replaceOnce(
    consCode,
    `return { json: { texto, categoria, dato_texto: dato || 'SIN_DATO' } };`,
    `return { json: { texto, categoria, dato_texto: dato || 'SIN_DATO', omitir, es_cierre_nuevo: esCierreNuevo } };`,
    "return final consolidar"
  );

  consolidar.parameters.jsCode = consCode;
  console.log('"Consolidar Dato Resuelto" actualizado.');

  // ========== "Marcar Resuelto o No Resuelto": respeta omitir sin escalar ==========
  const marcarResuelto = nodeByName("Marcar Resuelto o No Resuelto");
  const oldMarcarCode = `const mensaje = (($json.output || '').toString().trim());\nconst resuelto = !!mensaje && mensaje !== 'SIN_DATO';\nreturn { json: {\n  texto: $('Consolidar Dato Resuelto').item.json.texto,\n  categoria: $('Consolidar Dato Resuelto').item.json.categoria,\n  resuelto,\n  mensaje: resuelto ? mensaje : '',\n} };`;
  const newMarcarCode = `const mensaje = (($json.output || '').toString().trim());\nconst omitir = $('Consolidar Dato Resuelto').item.json.omitir === true;\nconst esCierreNuevo = $('Consolidar Dato Resuelto').item.json.es_cierre_nuevo === true;\nconst resuelto = omitir ? true : (!!mensaje && mensaje !== 'SIN_DATO');\nreturn { json: {\n  texto: $('Consolidar Dato Resuelto').item.json.texto,\n  categoria: $('Consolidar Dato Resuelto').item.json.categoria,\n  resuelto,\n  mensaje: (resuelto && !omitir) ? mensaje : '',\n  omitir,\n  es_cierre_nuevo: esCierreNuevo,\n} };`;
  marcarResuelto.parameters.jsCode = replaceOnce(marcarResuelto.parameters.jsCode, oldMarcarCode, newMarcarCode, "Marcar Resuelto o No Resuelto body");
  console.log('"Marcar Resuelto o No Resuelto" actualizado.');

  // ========== "Armar Mensajes": excluye piezas omitidas, expone necesitaMarcarCierre ==========
  const armar = nodeByName("Armar Mensajes");
  let armarCode = armar.parameters.jsCode;

  armarCode = replaceOnce(
    armarCode,
    `const piezas = $json.piezas || [];\nconst prioridad`,
    `const todas = $json.piezas || [];\nconst necesitaMarcarCierre = todas.some((p) => p.es_cierre_nuevo === true);\nconst piezas = todas.filter((p) => !p.omitir);\nconst prioridad`,
    "filtrar omitidas en Armar Mensajes"
  );

  armarCode = replaceOnce(
    armarCode,
    `  haySinResolver: noResueltas.length > 0,\n  piezas_sin_resolver_sql: escapar(piezasSinResolver),\n} }];`,
    `  haySinResolver: noResueltas.length > 0,\n  piezas_sin_resolver_sql: escapar(piezasSinResolver),\n  necesitaMarcarCierre,\n} }];`,
    "return final Armar Mensajes"
  );

  armar.parameters.jsCode = armarCode;
  console.log('"Armar Mensajes" actualizado.');

  // ========== Rama nueva colgando de "Armar Mensajes": marca el flag en Redis si corresponde ==========
  const armarPos = armar.position;

  const nIfMarcar = {
    id: randomUUID(),
    name: "¿Marcar Cierre Enviado?",
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [armarPos[0] + 272, armarPos[1] + 752],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [{
          id: randomUUID(),
          leftValue: "={{ $json.necesitaMarcarCierre }}",
          rightValue: true,
          operator: { type: "boolean", operation: "equals" },
        }],
        combinator: "and",
      },
      options: {},
    },
  };

  const nMarcarCierre = {
    id: randomUUID(),
    name: "Marcar Cierre Enviado",
    type: "n8n-nodes-base.redis",
    typeVersion: 1,
    position: [armarPos[0] + 544, armarPos[1] + 752],
    parameters: {
      operation: "set",
      key: KEY_EXPR,
      value: "=1",
      expire: true,
      ttl: 86400,
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 1000,
    credentials: { redis: REDIS_CRED },
  };

  const nFinCierreMarcado = {
    id: randomUUID(),
    name: "Fin - Cierre Marcado",
    type: "n8n-nodes-base.noOp",
    typeVersion: 1,
    position: [armarPos[0] + 816, armarPos[1] + 752],
    parameters: {},
  };

  wf.nodes.push(nIfMarcar, nMarcarCierre, nFinCierreMarcado);

  const connArmar = wf.connections["Armar Mensajes"];
  if (!connArmar || connArmar.main?.[0]?.length !== 2) {
    throw new Error('"Armar Mensajes" no tiene las 2 conexiones esperadas -- revisar a mano.');
  }
  connArmar.main[0].push({ node: nIfMarcar.name, type: "main", index: 0 });

  wf.connections[nIfMarcar.name] = {
    main: [[{ node: nMarcarCierre.name, type: "main", index: 0 }]],
  };
  wf.connections[nMarcarCierre.name] = {
    main: [[{ node: nFinCierreMarcado.name, type: "main", index: 0 }]],
  };

  console.log('Rama nueva agregada: "Armar Mensajes" -> "¿Marcar Cierre Enviado?" -> "Marcar Cierre Enviado" -> "Fin - Cierre Marcado".');

  // ========== PUT ==========
  const allowedSettingsKeys = [
    "saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
    "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder",
  ];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => allowedSettingsKeys.includes(k)));

  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: JSON.stringify(body) });
  console.log("Actualizado. Nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  // ========== Verificacion post-aplicacion ==========
  const fresh = await api(`/workflows/${WORKFLOW_ID}`);
  let ok = true;
  const check = (label, cond) => { console.log(label + ":", cond ? "OK" : "ALGO NO CUADRA"); ok = ok && cond; };

  const fSplit = fresh.nodes.find((n) => n.name === "Dividir y Etiquetar Sub-preguntas");
  check('"envio" exige pregunta concreta', fSplit?.parameters.options.systemMessage.includes('pregunta CONCRETA sobre si hacen envíos'));

  const fBuscarCierre = fresh.nodes.find((n) => n.name === "Buscar Cierre Reciente (Sub-pregunta)");
  check('Nodo "Buscar Cierre Reciente (Sub-pregunta)" existe', !!fBuscarCierre);

  const fConocLibreConn = fresh.connections["Buscar en Conocimiento Libre (Sin Match)"];
  check('"Buscar en Conocimiento Libre" -> "Buscar Cierre Reciente"', fConocLibreConn?.main?.[0]?.[0]?.node === "Buscar Cierre Reciente (Sub-pregunta)");

  const fCierreConn = fresh.connections["Buscar Cierre Reciente (Sub-pregunta)"];
  check('"Buscar Cierre Reciente" -> "Consolidar Dato Resuelto"', fCierreConn?.main?.[0]?.[0]?.node === "Consolidar Dato Resuelto");

  const fConsolidar = fresh.nodes.find((n) => n.name === "Consolidar Dato Resuelto");
  check('"Consolidar Dato Resuelto" chequea redis en cierre', fConsolidar?.parameters.jsCode.includes("Buscar Cierre Reciente (Sub-pregunta)"));
  check('"Consolidar Dato Resuelto" expone omitir', fConsolidar?.parameters.jsCode.includes("es_cierre_nuevo: esCierreNuevo"));

  const fMarcarResuelto = fresh.nodes.find((n) => n.name === "Marcar Resuelto o No Resuelto");
  check('"Marcar Resuelto o No Resuelto" respeta omitir', fMarcarResuelto?.parameters.jsCode.includes("const omitir = $('Consolidar Dato Resuelto').item.json.omitir"));

  const fArmar = fresh.nodes.find((n) => n.name === "Armar Mensajes");
  check('"Armar Mensajes" filtra omitidas', fArmar?.parameters.jsCode.includes("todas.filter((p) => !p.omitir)"));
  check('"Armar Mensajes" expone necesitaMarcarCierre', fArmar?.parameters.jsCode.includes("necesitaMarcarCierre,"));

  const fArmarConn = fresh.connections["Armar Mensajes"];
  check('"Armar Mensajes" -> "¿Marcar Cierre Enviado?"', (fArmarConn?.main?.[0] || []).some((c) => c.node === "¿Marcar Cierre Enviado?"));

  const fIfMarcar = fresh.nodes.find((n) => n.name === "¿Marcar Cierre Enviado?");
  check('Nodo "¿Marcar Cierre Enviado?" existe', !!fIfMarcar);

  const fMarcarCierreNode = fresh.nodes.find((n) => n.name === "Marcar Cierre Enviado");
  check('Nodo "Marcar Cierre Enviado" (redis set) existe', fMarcarCierreNode?.parameters.operation === "set" && fMarcarCierreNode?.parameters.ttl === 86400);

  if (!ok) {
    console.error("\nALGUNA VERIFICACION FALLO -- revisar a mano antes de dar por bueno el fix.");
    process.exit(1);
  }
  console.log("\nTodo OK.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
