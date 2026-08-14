// Fix: cuando hay un kit pineado y llega una rafaga que mezcla una pregunta de
// compatibilidad con OTRA cosa (precio, envio, negocio, u otra pregunta), el bot
// resolvia/escalaba SOLO la parte de compatibilidad -- el resto del mensaje quedaba
// enterrado en el texto crudo de la nota de escalado, sin resolverse ni escalarse
// aparte. Caso real: +5493875911890 (contacto 1940, conv 1940) escribio en la misma
// rafaga "Le va. Ala Gilera smash / 2017 / Y leva para calle no tiene??" -- solo se
// extrajo y proceso la pregunta de compatibilidad (Gilera Smash 2017), la pregunta
// "para calle" nunca se resolvio ni escalo por separado.
//
// Fix: "Extraer Pregunta Compatibilidad" ahora tambien devuelve `resto_mensaje` (el
// mensaje del cliente sin la frase de compatibilidad, tal cual lo escribio). Si ese
// resto tiene contenido real, se reusa el MISMO partidor de sub-preguntas de la Fase 6
// ("Dividir y Etiquetar Sub-preguntas" -> resolver lo que se sepa -> escalar lo que no)
// en paralelo a la resolucion/escalado de la compatibilidad -- no se duplica logica,
// se reusa el pipeline que ya existia para sin_match.
//
// Nodos nuevos: "¿Hay Resto Adicional en la Rafaga?" (if), "Fin - Sin Resto
// Compatibilidad" (noOp).
// Nodos modificados: "Extraer Pregunta Compatibilidad" (prompt), "Parsear Pregunta
// Compatibilidad" (parsea resto_mensaje), "Preparar Contexto Sub-preguntas" (resuelve
// que texto le pasa al partidor: el resto de compatibilidad si vino de ahi, o el texto
// completo de siempre en cualquier otro caso), "Dividir y Etiquetar Sub-preguntas"
// (usa el texto ya resuelto en vez de leer directo de los nodos de mas atras).
// Reconexion: "¿Es Compatibilidad Con Modelo?" (rama true) ahora abre en paralelo hacia
// "Buscar Compatibilidad del Kit" (como antes) Y hacia el chequeo de resto nuevo.
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-rafaga-compatibilidad-resto_2026-08-14.json", import.meta.url);

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

const OLD_SYSTEM_MSG = "=El cliente ya esta hablando sobre el kit \"{{ $json.kit_nombre }}\". Del mensaje del cliente, determina si esta preguntando por la compatibilidad de ESE kit con un modelo de moto puntual (por ejemplo: si anda, si sirve, si entra, si es compatible). Respondé UNICAMENTE con un JSON valido, sin texto adicional, con este formato exacto:\n{\"es_compatibilidad\": true o false, \"modelo_moto\": \"...\"}\n\nes_compatibilidad debe ser true SOLO si la pregunta es explicitamente sobre si el kit anda/sirve/entra/es compatible con una moto puntual. Cualquier otra cosa (precio, envio, saludo, agradecimiento, u otro tema) es false.\n\nmodelo_moto es el modelo de moto que menciona, tal cual lo escribio. Si no menciona ningun modelo con claridad, dejalo como string vacio \"\". No inventes un modelo que no este en el mensaje.";

const NEW_SYSTEM_MSG = "=El cliente ya esta hablando sobre el kit \"{{ $json.kit_nombre }}\". Del mensaje del cliente, determina si esta preguntando por la compatibilidad de ESE kit con un modelo de moto puntual (por ejemplo: si anda, si sirve, si entra, si es compatible). Respondé UNICAMENTE con un JSON valido, sin texto adicional, con este formato exacto:\n{\"es_compatibilidad\": true o false, \"modelo_moto\": \"...\", \"resto_mensaje\": \"...\"}\n\nes_compatibilidad debe ser true SOLO si la pregunta es explicitamente sobre si el kit anda/sirve/entra/es compatible con una moto puntual. Cualquier otra cosa (precio, envio, saludo, agradecimiento, u otro tema) es false.\n\nmodelo_moto es el modelo de moto que menciona, tal cual lo escribio. Si no menciona ningun modelo con claridad, dejalo como string vacio \"\". No inventes un modelo que no este en el mensaje.\n\nresto_mensaje: copiá el mensaje del cliente TAL CUAL lo escribio, pero sacando UNICAMENTE la frase/oracion puntual que pregunta por la compatibilidad -- dejá el resto del texto sin modificar, palabra por palabra, no resumas ni reformules ni agregues nada. Si es_compatibilidad es false, o si el mensaje completo es solamente sobre la compatibilidad y no queda nada mas, dejalo como string vacio \"\". Nunca inventes contenido que el cliente no escribio.";

const OLD_PARSEAR_CODE = "let esCompatibilidad = false, modeloMoto = '';\ntry {\n  const raw = ($json.output || '{}').toString().trim();\n  const clean = raw.replace(/```json|```/g, '').trim();\n  const parsed = JSON.parse(clean);\n  esCompatibilidad = parsed.es_compatibilidad === true;\n  modeloMoto = (parsed.modelo_moto || '').toString().trim();\n} catch (e) {}\n\nconst escapar = (s) => s.replace(/'/g, \"''\");\n\nreturn [{\n  json: {\n    es_compatibilidad: esCompatibilidad,\n    modelo_moto: modeloMoto,\n    modelo_moto_sql: escapar(modeloMoto),\n    kit_id: $('Parsear Kit Pineado').item.json.kit_id,\n    kit_nombre: $('Parsear Kit Pineado').item.json.kit_nombre,\n  }\n}];\n";

const NEW_PARSEAR_CODE = "let esCompatibilidad = false, modeloMoto = '', restoMensaje = null;\ntry {\n  const raw = ($json.output || '{}').toString().trim();\n  const clean = raw.replace(/```json|```/g, '').trim();\n  const parsed = JSON.parse(clean);\n  esCompatibilidad = parsed.es_compatibilidad === true;\n  modeloMoto = (parsed.modelo_moto || '').toString().trim();\n  if (esCompatibilidad) restoMensaje = (parsed.resto_mensaje || '').toString().trim();\n} catch (e) {}\n\nconst escapar = (s) => s.replace(/'/g, \"''\");\n\nreturn [{\n  json: {\n    es_compatibilidad: esCompatibilidad,\n    modelo_moto: modeloMoto,\n    modelo_moto_sql: escapar(modeloMoto),\n    resto_mensaje: restoMensaje,\n    kit_id: $('Parsear Kit Pineado').item.json.kit_id,\n    kit_nombre: $('Parsear Kit Pineado').item.json.kit_nombre,\n  }\n}];\n";

const OLD_CONTEXTO_CODE = "let kitId = null, kitNombre = null;\ntry {\n  const k = $('Parsear Kit Pineado').item.json;\n  if (k && k.kit_id) { kitId = k.kit_id; kitNombre = k.kit_nombre || null; }\n} catch (e) {}\n\nreturn [{ json: { kit_id: kitId, kit_nombre: kitNombre } }];\n";

const NEW_CONTEXTO_CODE = "let kitId = null, kitNombre = null;\ntry {\n  const k = $('Parsear Kit Pineado').item.json;\n  if (k && k.kit_id) { kitId = k.kit_id; kitNombre = k.kit_nombre || null; }\n} catch (e) {}\n\nlet textoParaDividir = null;\ntry {\n  const c = $('Parsear Pregunta Compatibilidad').item.json;\n  if (c && typeof c.resto_mensaje === 'string') textoParaDividir = c.resto_mensaje;\n} catch (e) {}\nif (textoParaDividir === null) {\n  textoParaDividir = $('Clasificar Mensaje (sin IA)').item.json.resto_mensaje || $('Unir Mensajes').item.json.texto_completo;\n}\n\nreturn [{ json: { kit_id: kitId, kit_nombre: kitNombre, texto_para_dividir: textoParaDividir } }];\n";

const OLD_DIVIDIR_TEXT = "={{ $('Clasificar Mensaje (sin IA)').item.json.resto_mensaje || $('Unir Mensajes').item.json.texto_completo }}";
const NEW_DIVIDIR_TEXT = "={{ $json.texto_para_dividir }}";

function buildNewNodes() {
  const hayResto = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [
          {
            id: "c2b2d6c1-4f11-4a2b-9c1e-2a8b1c9d2a01",
            leftValue: "={{ $('Parsear Pregunta Compatibilidad').item.json.resto_mensaje }}",
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
    position: [6100, 500],
    id: "c2b2d6c1-4f11-4a2b-9c1e-2a8b1c9d2a02",
    name: "¿Hay Resto Adicional en la Rafaga?",
  };

  const finSinResto = {
    parameters: {},
    type: "n8n-nodes-base.noOp",
    typeVersion: 1,
    position: [6370, 780],
    id: "c2b2d6c1-4f11-4a2b-9c1e-2a8b1c9d2a03",
    name: "Fin - Sin Resto Compatibilidad",
  };

  return { hayResto, finSinResto };
}

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const nodeByName = (name) => {
    const n = wf.nodes.find((x) => x.name === name);
    if (!n) throw new Error(`No se encontro el nodo "${name}"`);
    return n;
  };

  const extraer = nodeByName("Extraer Pregunta Compatibilidad");
  if (extraer.parameters.options?.systemMessage !== OLD_SYSTEM_MSG) {
    throw new Error('El systemMessage de "Extraer Pregunta Compatibilidad" no es el esperado -- revisar a mano.');
  }
  extraer.parameters.options.systemMessage = NEW_SYSTEM_MSG;

  const parsear = nodeByName("Parsear Pregunta Compatibilidad");
  if (parsear.parameters.jsCode !== OLD_PARSEAR_CODE) {
    throw new Error('El jsCode de "Parsear Pregunta Compatibilidad" no es el esperado -- revisar a mano.');
  }
  parsear.parameters.jsCode = NEW_PARSEAR_CODE;

  const contexto = nodeByName("Preparar Contexto Sub-preguntas");
  if (contexto.parameters.jsCode !== OLD_CONTEXTO_CODE) {
    throw new Error('El jsCode de "Preparar Contexto Sub-preguntas" no es el esperado -- revisar a mano.');
  }
  contexto.parameters.jsCode = NEW_CONTEXTO_CODE;

  const dividir = nodeByName("Dividir y Etiquetar Sub-preguntas");
  if (dividir.parameters.text !== OLD_DIVIDIR_TEXT) {
    throw new Error('El text de "Dividir y Etiquetar Sub-preguntas" no es el esperado -- revisar a mano.');
  }
  dividir.parameters.text = NEW_DIVIDIR_TEXT;

  for (const name of ["¿Hay Resto Adicional en la Rafaga?", "Fin - Sin Resto Compatibilidad"]) {
    if (wf.nodes.some((n) => n.name === name)) {
      throw new Error(`Ya existe un nodo llamado "${name}" -- puede que este fix ya se haya aplicado. Revisar a mano.`);
    }
  }

  const esCompatIf = wf.connections["¿Es Compatibilidad Con Modelo?"];
  if (!esCompatIf) throw new Error('No se encontro la conexion de "¿Es Compatibilidad Con Modelo?"');
  const trueBranch = esCompatIf.main?.[0] || [];
  const alreadyGoesToBuscar = trueBranch.some((c) => c.node === "Buscar Compatibilidad del Kit");
  if (!alreadyGoesToBuscar || trueBranch.length !== 1) {
    throw new Error('La rama true de "¿Es Compatibilidad Con Modelo?" no tiene la forma esperada (solo -> "Buscar Compatibilidad del Kit") -- puede que ya se haya tocado. Revisar a mano.');
  }

  const { hayResto, finSinResto } = buildNewNodes();
  wf.nodes.push(hayResto, finSinResto);

  // Fan-out: la rama true de "¿Es Compatibilidad Con Modelo?" ahora tambien dispara el chequeo de resto, en paralelo a "Buscar Compatibilidad del Kit".
  esCompatIf.main[0] = [
    { node: "Buscar Compatibilidad del Kit", type: "main", index: 0 },
    { node: "¿Hay Resto Adicional en la Rafaga?", type: "main", index: 0 },
  ];

  wf.connections["¿Hay Resto Adicional en la Rafaga?"] = {
    main: [
      [{ node: "Preparar Contexto Sub-preguntas", type: "main", index: 0 }],
      [{ node: "Fin - Sin Resto Compatibilidad", type: "main", index: 0 }],
    ],
  };

  const allowedSettingsKeys = [
    "saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
    "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder",
  ];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => allowedSettingsKeys.includes(k)));

  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: JSON.stringify(body) });
  console.log("Actualizado. Nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const fresh = await api(`/workflows/${WORKFLOW_ID}`);
  const checks = [
    ["Extraer Pregunta Compatibilidad", (n) => n.parameters.options?.systemMessage === NEW_SYSTEM_MSG],
    ["Parsear Pregunta Compatibilidad", (n) => n.parameters.jsCode === NEW_PARSEAR_CODE],
    ["Preparar Contexto Sub-preguntas", (n) => n.parameters.jsCode === NEW_CONTEXTO_CODE],
    ["Dividir y Etiquetar Sub-preguntas", (n) => n.parameters.text === NEW_DIVIDIR_TEXT],
  ];
  let ok = true;
  for (const [name, check] of checks) {
    const n = fresh.nodes.find((x) => x.name === name);
    const nodeOk = !!n && check(n);
    console.log(`Verificacion "${name}":`, nodeOk ? "OK" : "ALGO NO CUADRA");
    ok = ok && nodeOk;
  }
  const freshNames = new Set(fresh.nodes.map((n) => n.name));
  const nuevosOk = ["¿Hay Resto Adicional en la Rafaga?", "Fin - Sin Resto Compatibilidad"].every((n) => freshNames.has(n));
  console.log("Nodos nuevos presentes:", nuevosOk ? "OK" : "FALTA ALGUNO");
  const rewireOk = fresh.connections["¿Es Compatibilidad Con Modelo?"]?.main?.[0]?.some((c) => c.node === "¿Hay Resto Adicional en la Rafaga?");
  console.log("Rewire fan-out:", rewireOk ? "OK" : "ALGO NO CUADRA");
  console.log((ok && nuevosOk && rewireOk) ? "Fix aplicado correctamente." : "REVISAR A MANO.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
