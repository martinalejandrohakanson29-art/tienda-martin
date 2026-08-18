// Feat: cuando "Identificar Necesidad" (17/8) confirma un kit detectado por lenguaje natural
// (sin plantilla exacta, "kit_confiado"), en vez de mandar un texto corto redactado por IA
// ("Dale, el combo de tapa CDI + cilindro 120, no?") ahora manda la MISMA bienvenida con foto
// que ya usan las plantillas exactas (mensaje_bienvenida + foto_url de kits_publicidad) --
// mismo mensaje para cualquier kit, sin hardcodear ninguno.
//
// Pedido explicito de Martin (18/8), charlado antes de aplicar:
// 1. Aplica a las 3 ramas donde Identificar Necesidad confirma un kit: pregunta directa (conv
//    2129, +5493549539614), cilindrada sola, y compatibilidad ya resuelta con una moto nombrada.
// 2. Como la bienvenida ya trae el precio completo, la pregunta de "precio" de la Fase 6 deja de
//    contestarse aparte cuando la bienvenida se acaba de mandar (mismo criterio que ya usan las
//    plantillas exactas via "kit_recien_confirmado").
// 3. Como la bienvenida ya termina preguntando "para que moto lo estas buscando?", la repregunta
//    puntual de marca/modelo (feat del 18/8, "Redactar Repregunta Modelo") se suprime cuando la
//    bienvenida se acaba de mandar en este mismo mensaje -- sigue igual que antes para cuando el
//    kit ya estaba pineado de una conversacion mas vieja (ahi la bienvenida no se acaba de mandar,
//    hace falta preguntar).
//
// Por que se clona "Enviar Saludo Kit" en vez de reusarlo directo: ese nodo es compartido por 2
// origenes existentes (plantilla exacta sin resto / con resto del mismo tema) y sus salidas fijas
// (Fin - Saludo Kit Enviado, Marcar Kit Pineado) asumen esos origenes -- "Marcar Kit Pineado" lee
// el kit_id de "Clasificar Mensaje (sin IA)" (null para este camino, ver el gotcha de
// precio-redundante-y-orden en CHATWOOT-BOT-CONTEXTO.md) y "Fin - Saludo Kit Enviado" no encadena
// a nada mas -- agregarle salidas nuevas para este origen habria roto el camino de plantilla
// exacta "sin resto" (99% de los casos), que hoy termina justo despues del saludo sin seguir a
// "Extraer Pregunta Compatibilidad". Se clona un HTTP Request identico pero con salida propia,
// encadenado ANTES de "Extraer Pregunta Compatibilidad" para garantizar orden determinista (mismo
// patron que Fase 10: "el saludo siempre sale antes que cualquier otra respuesta").
//
// Reemplaza por completo el mecanismo de "confirmacion" agregado hoy mismo en
// apply-fix-orden-confirmacion-directa.mjs (el tronco compartido Chequear Confirmacion Pendiente /
// Debe Confirmar Kit? / Enviar Confirmacion Kit, y su clon privado) -- ya no hace falta "confirmar"
// con un texto aparte, la bienvenida con foto YA es la confirmacion. Se borran los 8 nodos que
// quedan huerfanos.
//
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";
import { randomUUID } from "crypto";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-feat-bienvenida-identificar-necesidad_2026-08-18.json", import.meta.url);

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

const CHECK_CODE = "let esNuevo = false;\ntry { $('Preparar Pin desde Identificacion').item; esNuevo = true; } catch (e) {}\nreturn [{ json: { ...$json, es_kit_recien_identificado: esNuevo } }];\n";

const NODES_TO_DELETE = [
  "Chequear Confirmacion Pendiente",
  "¿Debe Confirmar Kit?",
  "Enviar Confirmacion Kit (Propuesta)",
  "Fin - Sin Confirmar Kit",
  "Fin - Confirmacion Kit Enviada",
  "Chequear Confirmacion Antes de Sub-pregunta",
  "¿Debe Confirmar Antes de Sub-pregunta?",
  "Enviar Confirmacion Antes de Sub-pregunta",
];

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const nodeByName = (name) => {
    const n = wf.nodes.find((x) => x.name === name);
    if (!n) throw new Error(`No se encontro el nodo "${name}"`);
    return n;
  };

  // --- Verificaciones de forma esperada antes de tocar nada ---
  const parsearPineado = wf.connections["Parsear Kit Pineado"];
  const parsearTargets = (parsearPineado.main?.[0] || []).map((c) => c.node).sort();
  if (JSON.stringify(parsearTargets) !== JSON.stringify(["Extraer Pregunta Compatibilidad", "Refrescar Kit Pineado"].sort())) {
    throw new Error('"Parsear Kit Pineado" no tiene la forma esperada -- revisar a mano.');
  }

  const compatSinMarca = wf.connections["¿Compatibilidad Sin Marca/Modelo?"];
  const compatSinMarcaTrue = (compatSinMarca.main?.[0] || []).map((c) => c.node).sort();
  if (JSON.stringify(compatSinMarcaTrue) !== JSON.stringify(["Chequear Confirmacion Pendiente", "Redactar Repregunta Modelo", "¿Hay Resto Adicional en la Rafaga?"].sort())) {
    throw new Error('"¿Compatibilidad Sin Marca/Modelo?" no tiene la forma esperada -- revisar a mano.');
  }

  const esCompatConModelo = wf.connections["¿Es Compatibilidad Con Modelo?"];
  const esCompatFalse = (esCompatConModelo.main?.[1] || []).map((c) => c.node);
  if (JSON.stringify(esCompatFalse) !== JSON.stringify(["Chequear Confirmacion Antes de Sub-pregunta"])) {
    throw new Error('"¿Es Compatibilidad Con Modelo?" (false) no tiene la forma esperada -- revisar a mano.');
  }

  const esRealCompat = wf.connections["¿Es Realmente Compatible?"];
  const esRealTrue = (esRealCompat.main?.[0] || []).map((c) => c.node);
  if (JSON.stringify(esRealTrue) !== JSON.stringify(["Chequear Confirmacion Pendiente"])) {
    throw new Error('"¿Es Realmente Compatible?" (true) no tiene la forma esperada -- revisar a mano.');
  }

  const extraerCompat = nodeByName("Extraer Pregunta Compatibilidad");
  const OLD_SYSMSG_NEEDLE = 'El cliente ya esta hablando sobre el kit "{{ $json.kit_nombre }}"';
  if (!extraerCompat.parameters.options.systemMessage.includes(OLD_SYSMSG_NEEDLE)) {
    throw new Error('El systemMessage de "Extraer Pregunta Compatibilidad" no tiene el texto esperado -- revisar a mano.');
  }

  const preparaContexto = nodeByName("Preparar Contexto Sub-preguntas");
  const OLD_CONTEXTO_NEEDLE = "let kitRecienConfirmado = false;\ntry {\n  $('Marcar Kit Pineado').item;\n  kitRecienConfirmado = true;\n} catch (e) {}\n";
  if (!preparaContexto.parameters.jsCode.includes(OLD_CONTEXTO_NEEDLE)) {
    throw new Error('El jsCode de "Preparar Contexto Sub-preguntas" no tiene el bloque esperado -- revisar a mano.');
  }

  // --- Nodos nuevos ---
  const nCheck1 = {
    id: randomUUID(), name: "¿Es Kit Recien Identificado?", type: "n8n-nodes-base.code", typeVersion: 2,
    position: [5024, 50], parameters: { jsCode: CHECK_CODE },
  };
  const nIfWelcome = {
    id: randomUUID(), name: "¿Viene de Identificar Necesidad?", type: "n8n-nodes-base.if", typeVersion: 2.2,
    position: [5150, 50],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
        conditions: [{
          id: randomUUID(),
          leftValue: "={{ $json.es_kit_recien_identificado }}",
          rightValue: true,
          operator: { type: "boolean", operation: "equals" },
        }],
        combinator: "and",
      },
      options: {},
    },
  };
  const nBuscarBienvenida = {
    id: randomUUID(), name: "Buscar Bienvenida Kit Identificado", type: "n8n-nodes-base.code", typeVersion: 2,
    position: [5150, -100],
    parameters: {
      jsCode: "const kitId = $json.kit_id;\nconst kits = ($('Buscar Kits Activos').item.json.kits) || [];\nconst kit = kits.find((k) => k.id === kitId) || {};\nreturn [{ json: {\n  kit_id: kitId,\n  kit_nombre: $json.kit_nombre,\n  mensaje_bienvenida: kit.mensaje_bienvenida || '',\n  foto_url: kit.foto_url || null,\n} }];\n",
    },
  };
  const nEnviarSaludoIA = {
    id: randomUUID(), name: "Enviar Saludo Kit (Identificar Necesidad)", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2,
    position: [5300, -100],
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
      jsonBody: "={{ JSON.stringify({ conversation_id: $('Webhook1').item.json.body.conversation.messages[0].conversation_id, account_id: $('Webhook1').item.json.body.account.id, content: $json.mensaje_bienvenida, origen: 'saludo_kit_identificar_necesidad', contacto: ($('Webhook1').item.json.body.conversation?.meta?.sender?.name || $('Webhook1').item.json.body.sender?.name || ''), foto_url: $json.foto_url }) }}",
      options: { timeout: 20000 },
    },
    retryOnFail: true, maxTries: 3, waitBetweenTries: 2000,
  };
  const nCheck2 = {
    id: randomUUID(), name: "¿Es Kit Recien Identificado (Modelo)?", type: "n8n-nodes-base.code", typeVersion: 2,
    position: [5950, 300], parameters: { jsCode: CHECK_CODE },
  };
  const nIfRepregunta = {
    id: randomUUID(), name: "¿Repregunta Modelo Necesaria?", type: "n8n-nodes-base.if", typeVersion: 2.2,
    position: [6000, 300],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
        conditions: [{
          id: randomUUID(),
          leftValue: "={{ $json.es_kit_recien_identificado }}",
          rightValue: true,
          operator: { type: "boolean", operation: "equals" },
        }],
        combinator: "and",
      },
      options: {},
    },
  };

  wf.nodes.push(nCheck1, nIfWelcome, nBuscarBienvenida, nEnviarSaludoIA, nCheck2, nIfRepregunta);

  // --- Rewire ---
  // A) Parsear Kit Pineado: saca el edge directo a Extraer Pregunta Compatibilidad, entra el chequeo.
  parsearPineado.main[0] = [
    { node: "Refrescar Kit Pineado", type: "main", index: 0 },
    { node: nCheck1.name, type: "main", index: 0 },
  ];

  wf.connections[nCheck1.name] = { main: [[{ node: nIfWelcome.name, type: "main", index: 0 }]] };
  wf.connections[nIfWelcome.name] = {
    main: [
      [{ node: nBuscarBienvenida.name, type: "main", index: 0 }],
      [{ node: "Extraer Pregunta Compatibilidad", type: "main", index: 0 }],
    ],
  };
  wf.connections[nBuscarBienvenida.name] = { main: [[{ node: nEnviarSaludoIA.name, type: "main", index: 0 }]] };
  wf.connections[nEnviarSaludoIA.name] = { main: [[{ node: "Extraer Pregunta Compatibilidad", type: "main", index: 0 }]] };

  // F) Extraer Pregunta Compatibilidad ya no puede asumir que su entrada directa trae kit_nombre
  // (ahora puede venir de "Enviar Saludo Kit (Identificar Necesidad)", que devuelve la respuesta
  // HTTP de Chatwoot) -- apuntar explicito al nodo de origen real.
  extraerCompat.parameters.options.systemMessage = extraerCompat.parameters.options.systemMessage.replace(
    OLD_SYSMSG_NEEDLE,
    'El cliente ya esta hablando sobre el kit "{{ $(\'Parsear Kit Pineado\').item.json.kit_nombre }}"'
  );

  // G) ¿Compatibilidad Sin Marca/Modelo? (true): saca la confirmacion vieja, gatea la repregunta.
  compatSinMarca.main[0] = [
    { node: nCheck2.name, type: "main", index: 0 },
    { node: "¿Hay Resto Adicional en la Rafaga?", type: "main", index: 0 },
  ];
  wf.connections[nCheck2.name] = { main: [[{ node: nIfRepregunta.name, type: "main", index: 0 }]] };
  wf.connections[nIfRepregunta.name] = {
    main: [
      [], // true: bienvenida recien mandada, ya pregunto por la moto -- no repreguntar de nuevo.
      [{ node: "Redactar Repregunta Modelo", type: "main", index: 0 }],
    ],
  };

  // J) ¿Es Compatibilidad Con Modelo? (false): la confirmacion ya paso antes (bienvenida), directo.
  esCompatConModelo.main[1] = [{ node: "Preparar Contexto Sub-preguntas", type: "main", index: 0 }];

  // K) ¿Es Realmente Compatible? (true): nada que confirmar aparte, la respuesta de compatibilidad
  // ya sale por su propio camino (Preparar Respuesta Compatibilidad).
  esRealCompat.main[0] = [];

  // 2) Precio ya no se repite si la bienvenida se mando en esta misma ejecucion.
  preparaContexto.parameters.jsCode = preparaContexto.parameters.jsCode.replace(
    OLD_CONTEXTO_NEEDLE,
    OLD_CONTEXTO_NEEDLE + `try {\n  $('${nEnviarSaludoIA.name}').item;\n  kitRecienConfirmado = true;\n} catch (e) {}\n`
  );

  // --- Borrar nodos huerfanos (confirmacion vieja, ya no hace falta) ---
  wf.nodes = wf.nodes.filter((n) => !NODES_TO_DELETE.includes(n.name));
  for (const name of NODES_TO_DELETE) delete wf.connections[name];

  const allowedSettingsKeys = [
    "saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
    "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder",
  ];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => allowedSettingsKeys.includes(k)));

  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: JSON.stringify(body) });
  console.log("Actualizado. Nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const fresh = await api(`/workflows/${WORKFLOW_ID}`);
  let ok = true;
  const checkNode = (name, pred) => {
    const n = fresh.nodes.find((x) => x.name === name);
    const nodeOk = !!n && pred(n);
    console.log(`Nodo "${name}":`, nodeOk ? "OK" : "ALGO NO CUADRA");
    ok = ok && nodeOk;
  };
  checkNode(nCheck1.name, (n) => n.parameters.jsCode === CHECK_CODE);
  checkNode(nIfWelcome.name, () => true);
  checkNode(nBuscarBienvenida.name, () => true);
  checkNode(nEnviarSaludoIA.name, (n) => n.parameters.jsonBody.includes("saludo_kit_identificar_necesidad"));
  checkNode(nCheck2.name, (n) => n.parameters.jsCode === CHECK_CODE);
  checkNode(nIfRepregunta.name, () => true);
  for (const name of NODES_TO_DELETE) {
    const gone = !fresh.nodes.find((x) => x.name === name) && !fresh.connections[name];
    console.log(`Borrado "${name}":`, gone ? "OK" : "SIGUE EXISTIENDO");
    ok = ok && gone;
  }
  const c1 = JSON.stringify((fresh.connections["Parsear Kit Pineado"].main[0] || []).map((c) => c.node).sort()) === JSON.stringify(["Refrescar Kit Pineado", nCheck1.name].sort());
  const c2 = JSON.stringify((fresh.connections[nIfWelcome.name].main[1] || []).map((c) => c.node)) === JSON.stringify(["Extraer Pregunta Compatibilidad"]);
  const c3 = JSON.stringify((fresh.connections["¿Compatibilidad Sin Marca/Modelo?"].main[0] || []).map((c) => c.node).sort()) === JSON.stringify([nCheck2.name, "¿Hay Resto Adicional en la Rafaga?"].sort());
  const c4 = JSON.stringify((fresh.connections["¿Es Compatibilidad Con Modelo?"].main[1] || []).map((c) => c.node)) === JSON.stringify(["Preparar Contexto Sub-preguntas"]);
  const c5 = (fresh.connections["¿Es Realmente Compatible?"].main[0] || []).length === 0;
  const c6 = fresh.nodes.find((n) => n.name === "Extraer Pregunta Compatibilidad").parameters.options.systemMessage.includes("$('Parsear Kit Pineado').item.json.kit_nombre");
  const c7 = fresh.nodes.find((n) => n.name === "Preparar Contexto Sub-preguntas").parameters.jsCode.includes(nEnviarSaludoIA.name);
  console.log("Rewire Parsear Kit Pineado:", c1 ? "OK" : "ALGO NO CUADRA");
  console.log("Rewire Viene de Identificar Necesidad (false->compat):", c2 ? "OK" : "ALGO NO CUADRA");
  console.log("Rewire Compatibilidad Sin Marca/Modelo:", c3 ? "OK" : "ALGO NO CUADRA");
  console.log("Rewire Es Compatibilidad Con Modelo (false->contexto directo):", c4 ? "OK" : "ALGO NO CUADRA");
  console.log("Rewire Es Realmente Compatible (true vacio):", c5 ? "OK" : "ALGO NO CUADRA");
  console.log("systemMessage Extraer Pregunta Compatibilidad actualizado:", c6 ? "OK" : "ALGO NO CUADRA");
  console.log("Preparar Contexto Sub-preguntas reconoce el nuevo saludo:", c7 ? "OK" : "ALGO NO CUADRA");
  console.log((ok && c1 && c2 && c3 && c4 && c5 && c6 && c7) ? "Feat aplicada correctamente." : "REVISAR A MANO.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
