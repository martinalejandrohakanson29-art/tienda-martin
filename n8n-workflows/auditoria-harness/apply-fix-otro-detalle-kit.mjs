// Fix: las sub-preguntas categoria "otro" (Fase 6) solo se resuelven contra
// `conocimiento_libre` (lo que el equipo ya enseño antes) -- nunca miran el campo
// `detalle` del kit pineado, aunque muchas veces la respuesta ya esta escrita ahi.
// Caso real que lo destapo: +5493491508217 (contacto/conv 1977), Kit 8 pineado, rafaga
// con "Es recorrido corto?" entre otras preguntas -- cayo en "otro", no se resolvio, y
// escalo al equipo. El `detalle` del Kit 8 ya dice "para 110 chinos de recorrido corto
// ... si la moto es 110 de recorrido largo existe la opcion de cilindro largo".
//
// Fix: mismo patron que el fix de compatibilidad-detalle-kit, pero aplicado a la rama
// "otro" del partidor de sub-preguntas. Antes de buscar en `conocimiento_libre`, un paso
// de IA acotada nuevo ("Responder Otro desde Detalle Kit") lee SOLO el `detalle` del kit
// pineado (nunca inventa) y dice si contesta la pregunta puntual. Si resuelve, se usa ese
// dato y no se busca en `conocimiento_libre`. Si no resuelve (detalle vacio, no
// relacionado, o no alcanza), sigue el camino de siempre: `conocimiento_libre` y despues
// escalado silencioso si tampoco hay nada ahi.
//
// Nodos nuevos: "Buscar Detalle Kit Pineado (Sub-pregunta)" (postgres), "Responder Otro
// desde Detalle Kit" (agent) + su modelo "DeepSeek Chat Model - Detalle Otro", "Parsear
// Respuesta Otro desde Detalle" (code).
// Reconexion: "Buscar Info Negocio (Negocio)" ahora entra a este tramo nuevo en vez de ir
// directo a "Buscar en Conocimiento Libre (Sin Match)"; el tramo nuevo sale hacia ese
// mismo nodo de siempre (que ahora tambien gatea en SQL "no resuelto por detalle").
// "Consolidar Dato Resuelto" (code) ahora prioriza el dato del detalle sobre
// `conocimiento_libre` en la rama "otro".
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-otro-detalle-kit_2026-08-14.json", import.meta.url);

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
      query: "SELECT k.detalle\nFROM (SELECT 1) seed\nLEFT JOIN kits_publicidad k\n  ON '{{ $('Separar Pedazos').item.json.categoria }}' = 'otro' AND k.id = {{ $('Separar Pedazos').item.json.kit_id || 0 }} AND k.detalle IS NOT NULL AND k.detalle <> '';",
      options: {},
    },
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [10630, 400],
    id: "c2b2d6c1-4f1e-4b9a-9c2d-2f8b2c9d2a01",
    name: "Buscar Detalle Kit Pineado (Sub-pregunta)",
    alwaysOutputData: true,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    credentials: { postgres: POSTGRES_CRED },
  };

  const responderOtro = {
    parameters: {
      promptType: "define",
      text: "=Pregunta suelta del cliente: {{ $('Separar Pedazos').item.json.texto }}\n\nDetalle/ficha técnica del kit (puede venir vacío si no aplica): {{ $json.detalle }}",
      options: {
        systemMessage: "Tenés el texto de detalle/ficha técnica de un kit de repuestos de moto (puede venir vacío) y una pregunta suelta de un cliente sobre ese kit -- medidas, qué incluye, piezas, versiones, etc. NUNCA sobre si el kit anda en tal modelo de moto puntual (eso se maneja en otro paso aparte, ignorá esas preguntas acá). Determiná, usando ÚNICAMENTE el texto del detalle (nunca inventes ni asumas nada que no esté ahí), si ese texto contesta la pregunta puntual del cliente.\n\nRespondé ÚNICAMENTE con un JSON válido, sin texto adicional, con este formato exacto:\n{\"resuelto\": true o false, \"dato\": \"...\"}\n\n- \"resuelto\": true solo si el detalle da información suficiente y clara para contestar esa pregunta puntual. false si el detalle viene vacío, no menciona nada relacionado, o no alcanza para responder con certeza -- ante la duda, false.\n- \"dato\": si resuelto es true, el dato puntual tomado del texto que contesta la pregunta (corto, sin agregar nada que no esté en el detalle). Si resuelto es false, string vacío.",
      },
    },
    type: "@n8n/n8n-nodes-langchain.agent",
    typeVersion: 2,
    position: [10900, 400],
    id: "c2b2d6c1-4f1e-4b9a-9c2d-2f8b2c9d2a02",
    name: "Responder Otro desde Detalle Kit",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
  };

  const modeloOtro = {
    parameters: {
      model: "deepseek-v4-flash",
      options: { temperature: 0, timeout: 25000, maxRetries: 2 },
    },
    type: "@n8n/n8n-nodes-langchain.lmChatDeepSeek",
    typeVersion: 1,
    position: [10900, 650],
    id: "c2b2d6c1-4f1e-4b9a-9c2d-2f8b2c9d2a03",
    name: "DeepSeek Chat Model - Detalle Otro",
    credentials: { deepSeekApi: DEEPSEEK_CRED },
  };

  const parsearOtro = {
    parameters: {
      mode: "runOnceForEachItem",
      jsCode: "let resuelto = false, dato = '';\ntry {\n  const raw = ($json.output || '{}').toString().trim();\n  const clean = raw.replace(/```json|```/g, '').trim();\n  const parsed = JSON.parse(clean);\n  if (parsed.resuelto === true) resuelto = true;\n  dato = (parsed.dato || '').toString().trim();\n  if (!dato) resuelto = false;\n} catch (e) {}\n\nreturn { json: { resuelto, dato } };\n",
    },
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [11170, 400],
    id: "c2b2d6c1-4f1e-4b9a-9c2d-2f8b2c9d2a04",
    name: "Parsear Respuesta Otro desde Detalle",
  };

  return { buscarDetalle, responderOtro, modeloOtro, parsearOtro };
}

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  for (const name of ["Buscar Detalle Kit Pineado (Sub-pregunta)", "Responder Otro desde Detalle Kit", "DeepSeek Chat Model - Detalle Otro", "Parsear Respuesta Otro desde Detalle"]) {
    if (wf.nodes.some((n) => n.name === name)) {
      throw new Error(`Ya existe un nodo llamado "${name}" -- puede que este fix ya se haya aplicado. Revisar a mano.`);
    }
  }

  const negocioConn = wf.connections["Buscar Info Negocio (Negocio)"];
  if (!negocioConn) throw new Error('No se encontro la conexion de "Buscar Info Negocio (Negocio)"');
  const nextNode = negocioConn.main?.[0]?.[0]?.node;
  if (nextNode !== "Buscar en Conocimiento Libre (Sin Match)") {
    throw new Error(`"Buscar Info Negocio (Negocio)" apunta a "${nextNode}", no a "Buscar en Conocimiento Libre (Sin Match)" -- puede que ya se haya tocado. Revisar a mano.`);
  }

  const conocimientoLibreNode = wf.nodes.find((n) => n.name === "Buscar en Conocimiento Libre (Sin Match)");
  if (!conocimientoLibreNode) throw new Error('No se encontro el nodo "Buscar en Conocimiento Libre (Sin Match)"');
  const oldQuery = conocimientoLibreNode.parameters.query;
  const marker = "ON '{{ $('Separar Pedazos').item.json.categoria }}' = 'otro';";
  if (!oldQuery.includes(marker)) {
    throw new Error('La query de "Buscar en Conocimiento Libre (Sin Match)" no tiene el ON esperado -- puede que ya se haya tocado. Revisar a mano.');
  }
  conocimientoLibreNode.parameters.query = oldQuery.replace(
    marker,
    "ON '{{ $('Separar Pedazos').item.json.categoria }}' = 'otro' AND '{{ $('Parsear Respuesta Otro desde Detalle').item.json.resuelto }}' != 'true';"
  );

  const consolidarNode = wf.nodes.find((n) => n.name === "Consolidar Dato Resuelto");
  if (!consolidarNode) throw new Error('No se encontro el nodo "Consolidar Dato Resuelto"');
  const oldCode = consolidarNode.parameters.jsCode;
  const oldElse = "} else {\n  const r = $('Buscar en Conocimiento Libre (Sin Match)').item.json;\n  if (r && r.respuesta != null) dato = r.respuesta;\n}";
  if (!oldCode.includes(oldElse)) {
    throw new Error('El bloque "else" de "Consolidar Dato Resuelto" no coincide con lo esperado -- puede que ya se haya tocado. Revisar a mano.');
  }
  const newElse = "} else {\n  const detalle = $('Parsear Respuesta Otro desde Detalle').item.json;\n  if (detalle && detalle.resuelto === true && detalle.dato) {\n    dato = detalle.dato;\n  } else {\n    const r = $('Buscar en Conocimiento Libre (Sin Match)').item.json;\n    if (r && r.respuesta != null) dato = r.respuesta;\n  }\n}";
  consolidarNode.parameters.jsCode = oldCode.replace(oldElse, newElse);

  const { buscarDetalle, responderOtro, modeloOtro, parsearOtro } = buildNodes();
  wf.nodes.push(buscarDetalle, responderOtro, modeloOtro, parsearOtro);

  // Rewire: "Buscar Info Negocio (Negocio)" -> "Buscar Detalle Kit Pineado (Sub-pregunta)" (antes iba directo a "Buscar en Conocimiento Libre (Sin Match)")
  negocioConn.main[0] = [{ node: "Buscar Detalle Kit Pineado (Sub-pregunta)", type: "main", index: 0 }];

  wf.connections["Buscar Detalle Kit Pineado (Sub-pregunta)"] = {
    main: [[{ node: "Responder Otro desde Detalle Kit", type: "main", index: 0 }]],
  };
  wf.connections["DeepSeek Chat Model - Detalle Otro"] = {
    ai_languageModel: [[{ node: "Responder Otro desde Detalle Kit", type: "ai_languageModel", index: 0 }]],
  };
  wf.connections["Responder Otro desde Detalle Kit"] = {
    main: [[{ node: "Parsear Respuesta Otro desde Detalle", type: "main", index: 0 }]],
  };
  wf.connections["Parsear Respuesta Otro desde Detalle"] = {
    main: [[{ node: "Buscar en Conocimiento Libre (Sin Match)", type: "main", index: 0 }]],
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
  const allThere = ["Buscar Detalle Kit Pineado (Sub-pregunta)", "Responder Otro desde Detalle Kit", "DeepSeek Chat Model - Detalle Otro", "Parsear Respuesta Otro desde Detalle"].every((n) => freshNames.has(n));
  const rewired = fresh.connections["Buscar Info Negocio (Negocio)"]?.main?.[0]?.[0]?.node === "Buscar Detalle Kit Pineado (Sub-pregunta)";
  console.log("Nodos nuevos presentes:", allThere ? "OK" : "FALTA ALGUNO");
  console.log("Rewire:", rewired ? "OK" : "ALGO NO CUADRA");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
