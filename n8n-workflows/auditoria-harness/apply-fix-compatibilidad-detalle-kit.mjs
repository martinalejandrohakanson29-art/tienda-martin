// Fix: la escalada de compatibilidad ("Extraer Pregunta Compatibilidad" -> "Buscar
// Compatibilidad del Kit") solo mira la tabla `compatibilidades` (respuestas previas
// confirmadas por el equipo) -- nunca el campo `detalle` de `kits_publicidad`, que
// muchas veces YA trae la lista de modelos compatibles/no compatibles escrita a mano.
// Caso real que lo destapo: +5493875911890 (contacto 1940, conv 1940) pregunto si el
// Kit 8 anda en su Gilera Smash 2017 -- el `detalle` del kit ya dice "para 110 chinos
// de recorrido corto (Smash, Nevada, Trip, Blitz, Siam Q, City Plus)" y aun asi escalo
// a un humano en vez de contestar solo.
//
// Fix: si no hay dato en `compatibilidades`, antes de escalar se agrega un paso de IA
// acotada que lee SOLO el `detalle` del kit pineado (nunca inventa) y dice si el
// modelo mencionado queda compatible/no compatible/no esta claro. Si el detalle no
// alcanza para decidir, se sigue escalando a un humano como antes -- `compatibilidades`
// sigue siendo la fuente de mayor prioridad (dato ya confirmado por una persona).
//
// Nodos nuevos: "Buscar Detalle Kit Pineado" (postgres), "Evaluar Compatibilidad desde
// Detalle" (agent) + su modelo "DeepSeek Chat Model - Detalle Compatibilidad",
// "Parsear Compatibilidad desde Detalle" (code), "¿Detalle Resuelve Compatibilidad?" (if).
// Reconexion: "¿Hay Dato de Compatibilidad?" (rama false) ahora entra a este tramo nuevo
// en vez de ir directo a "¿Ya Hay Pregunta Pendiente?"; el tramo nuevo sale hacia
// "Preparar Respuesta Compatibilidad" (si resuelve) o "¿Ya Hay Pregunta Pendiente?"
// (si no resuelve, mismo camino de escalado de siempre).
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-compatibilidad-detalle-kit_2026-08-14.json", import.meta.url);

const POSTGRES_CRED = { id: "65YYZNhTfBBheEpo", name: "Postgres account" };
const DEEPSEEK_CRED = { id: "6uiYD2nzluzyDXnZ", name: "DeepSeek account" };

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

function buildNodes() {
  const buscarDetalle = {
    parameters: {
      operation: "executeQuery",
      query: "SELECT detalle\nFROM kits_publicidad\nWHERE id = {{ $('Parsear Pregunta Compatibilidad').item.json.kit_id }};",
      options: {},
    },
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [6640, 500],
    id: "b1a1c5b0-3e0c-4a1a-9c1d-1f7a1c9d1a01",
    name: "Buscar Detalle Kit Pineado",
    alwaysOutputData: true,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    credentials: { postgres: POSTGRES_CRED },
  };

  const evaluarDetalle = {
    parameters: {
      promptType: "define",
      text: "=Detalle del kit: {{ $json.detalle }}\n\nModelo de moto que pregunta el cliente: {{ $('Parsear Pregunta Compatibilidad').item.json.modelo_moto }}",
      options: {
        systemMessage: "Tenés el texto de detalle/ficha técnica de un kit de repuestos de moto, y el modelo de moto que preguntó un cliente. El detalle puede mencionar modelos compatibles y/o no compatibles, a veces por nombre puntual, a veces por categoría (ej. \"110 chinos de recorrido corto\", \"no compatible con Wave NF, Biz 100...\"). Determiná, usando ÚNICAMENTE el texto del detalle (nunca inventes ni asumas nada que no esté ahí), si el modelo que preguntó el cliente queda compatible, no compatible, o no se puede determinar con este texto.\n\nRespondé UNICAMENTE con un JSON valido, sin texto adicional, con este formato exacto:\n{\"compatible\": true, false o null, \"detalle\": \"...\"}\n\n- \"compatible\": true si el detalle indica con claridad que ese modelo entra en el grupo/lista de compatibles. false si indica con claridad que NO es compatible (nombrado explícitamente o pertenece a una categoría excluida). null si el detalle no da información suficiente para decidir sobre ese modelo puntual -- ante la duda, elegí null, nunca inventes ni asumas.\n- \"detalle\": si compatible es true o false, una aclaración corta y útil tomada del texto (ej. la variante que corresponde, una pieza que cambia), o string vacío si no hay nada relevante. Si compatible es null, string vacío.",
      },
    },
    type: "@n8n/n8n-nodes-langchain.agent",
    typeVersion: 2,
    position: [6910, 500],
    id: "b1a1c5b0-3e0c-4a1a-9c1d-1f7a1c9d1a02",
    name: "Evaluar Compatibilidad desde Detalle",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
  };

  const modeloDetalle = {
    parameters: {
      model: "deepseek-v4-flash",
      options: { temperature: 0, timeout: 25000, maxRetries: 2 },
    },
    type: "@n8n/n8n-nodes-langchain.lmChatDeepSeek",
    typeVersion: 1,
    position: [6910, 780],
    id: "b1a1c5b0-3e0c-4a1a-9c1d-1f7a1c9d1a03",
    name: "DeepSeek Chat Model - Detalle Compatibilidad",
    credentials: { deepSeekApi: DEEPSEEK_CRED },
  };

  const parsearDetalle = {
    parameters: {
      jsCode: "let compatible = null, detalle = '';\ntry {\n  const raw = ($json.output || '{}').toString().trim();\n  const clean = raw.replace(/```json|```/g, '').trim();\n  const parsed = JSON.parse(clean);\n  if (parsed.compatible === true) compatible = true;\n  else if (parsed.compatible === false) compatible = false;\n  detalle = (parsed.detalle || '').toString().trim();\n} catch (e) {}\n\nreturn [{ json: { compatible, detalle } }];\n",
    },
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [7180, 500],
    id: "b1a1c5b0-3e0c-4a1a-9c1d-1f7a1c9d1a04",
    name: "Parsear Compatibilidad desde Detalle",
  };

  const hayDetalleIf = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [
          {
            id: "b1a1c5b0-3e0c-4a1a-9c1d-1f7a1c9d1a05",
            leftValue: "={{ $json.compatible !== null }}",
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
    position: [7450, 500],
    id: "b1a1c5b0-3e0c-4a1a-9c1d-1f7a1c9d1a06",
    name: "¿Detalle Resuelve Compatibilidad?",
  };

  return { buscarDetalle, evaluarDetalle, modeloDetalle, parsearDetalle, hayDetalleIf };
}

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  for (const name of ["Buscar Detalle Kit Pineado", "Evaluar Compatibilidad desde Detalle", "Parsear Compatibilidad desde Detalle", "¿Detalle Resuelve Compatibilidad?"]) {
    if (wf.nodes.some((n) => n.name === name)) {
      throw new Error(`Ya existe un nodo llamado "${name}" -- puede que este fix ya se haya aplicado. Revisar a mano.`);
    }
  }

  const conditionNode = wf.connections["¿Hay Dato de Compatibilidad?"];
  if (!conditionNode) throw new Error('No se encontro la conexion de "¿Hay Dato de Compatibilidad?"');
  const falseBranch = conditionNode.main?.[1]?.[0]?.node;
  if (falseBranch !== "¿Ya Hay Pregunta Pendiente?") {
    throw new Error(`La rama false de "¿Hay Dato de Compatibilidad?" apunta a "${falseBranch}", no a "¿Ya Hay Pregunta Pendiente?" -- puede que ya se haya tocado. Revisar a mano.`);
  }

  const { buscarDetalle, evaluarDetalle, modeloDetalle, parsearDetalle, hayDetalleIf } = buildNodes();
  wf.nodes.push(buscarDetalle, evaluarDetalle, modeloDetalle, parsearDetalle, hayDetalleIf);

  // Rewire: "¿Hay Dato de Compatibilidad?" false -> "Buscar Detalle Kit Pineado" (antes iba directo a "¿Ya Hay Pregunta Pendiente?")
  conditionNode.main[1] = [{ node: "Buscar Detalle Kit Pineado", type: "main", index: 0 }];

  wf.connections["Buscar Detalle Kit Pineado"] = {
    main: [[{ node: "Evaluar Compatibilidad desde Detalle", type: "main", index: 0 }]],
  };
  wf.connections["DeepSeek Chat Model - Detalle Compatibilidad"] = {
    ai_languageModel: [[{ node: "Evaluar Compatibilidad desde Detalle", type: "ai_languageModel", index: 0 }]],
  };
  wf.connections["Evaluar Compatibilidad desde Detalle"] = {
    main: [[{ node: "Parsear Compatibilidad desde Detalle", type: "main", index: 0 }]],
  };
  wf.connections["Parsear Compatibilidad desde Detalle"] = {
    main: [[{ node: "¿Detalle Resuelve Compatibilidad?", type: "main", index: 0 }]],
  };
  wf.connections["¿Detalle Resuelve Compatibilidad?"] = {
    main: [
      [{ node: "Preparar Respuesta Compatibilidad", type: "main", index: 0 }],
      [{ node: "¿Ya Hay Pregunta Pendiente?", type: "main", index: 0 }],
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
  const freshNames = new Set(fresh.nodes.map((n) => n.name));
  const allThere = ["Buscar Detalle Kit Pineado", "Evaluar Compatibilidad desde Detalle", "DeepSeek Chat Model - Detalle Compatibilidad", "Parsear Compatibilidad desde Detalle", "¿Detalle Resuelve Compatibilidad?"].every((n) => freshNames.has(n));
  const rewired = fresh.connections["¿Hay Dato de Compatibilidad?"]?.main?.[1]?.[0]?.node === "Buscar Detalle Kit Pineado";
  console.log("Nodos nuevos presentes:", allThere ? "OK" : "FALTA ALGUNO");
  console.log("Rewire de la rama false:", rewired ? "OK" : "ALGO NO CUADRA");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
