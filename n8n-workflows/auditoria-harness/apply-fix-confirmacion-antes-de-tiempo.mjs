// Frena la confirmacion prematura de kit + la respuesta generica de "otra
// cosa" cuando "Identificar Necesidad" confia un kit en el mismo mensaje en
// que el cliente nombra una moto puntual, y esa moto no tiene NINGUN dato
// (ni compatible ni incompatible) ni en `compatibilidades` ni en el
// `detalle` del kit.
//
// Caso real que disparo esto: +5493813657644 (conv 2119, 2026-08-18 07:18).
// El cliente escribio "Que kit me recomendas para ponerle a una honda
// stomr" + "Yo la tengo echa 150 pero quiero agrandarla mas" como primeros
// mensajes de la charla. "Identificar Necesidad" cruzo "150"+"agrandar" con
// el alias "potenciar 150" del Kit 3 (KIT POTENCIADO 220cc) y broadcasteo
// DOS mensajes dando el kit por bueno:
//   1) "Enviar Confirmacion Kit (Propuesta)": "Dale, para agrandar la 150
//      te conviene el kit potenciado 220cc, ¿no?" -- se manda de inmediato,
//      apenas se identifica el kit, SIN ESPERAR a que corra el chequeo de
//      compatibilidad (que ya existe y ya funciona bien).
//   2) La categoria "otro" del partidor de sub-preguntas (Fase 6) tambien
//      contesto usando el `detalle` del kit ("Para agrandarla mas... Ese es
//      el que te sirve"), en paralelo, sin saber que la pregunta de
//      compatibilidad de al lado seguia sin resolver.
// Mientras tanto, la pregunta real ("¿anda en una Honda Storm?") escalo en
// silencio como corresponde -- pero quedo sin responder, y el cliente ya
// tenia "confirmado" un kit que el propio `detalle` del kit ni siquiera
// menciona como compatible.
//
// Decidido con Martin: cuando el mensaje nombra una moto puntual (no solo
// la cilindrada) Y no hay NINGUN dato de esa moto (ni compatible ni
// incompatible), el bot no debe asumir ningun kit -- se frena ahi. En
// cualquier otro caso (no nombra moto, o SI hay dato) sigue exactamente
// igual que hoy.
//
// Cambio 1 -- confirmacion de "Identificar Necesidad":
//   Hoy "¿Qué Identificó?" dispara "Enviar Confirmacion Kit (Propuesta)" en
//   paralelo e inmediato, sin esperar el chequeo de compatibilidad (que
//   corre en OTRA rama paralela, sin conexion entre ambas). Se saca esa
//   conexion directa y se agrega un nodo nuevo, "Chequear Confirmacion
//   Pendiente", conectado desde los 4 puntos de salida del chequeo de
//   compatibilidad donde SI corresponde confirmar (no aplica pregunta de
//   compatibilidad / cilindrada sola sin marca / hay dato ya confirmado /
//   el detalle del kit resuelve) -- pero NO desde el quinto punto (el
//   detalle no resuelve nada, "compatible: null"), que es exactamente el
//   caso a frenar. Ese nodo chequea con el mismo patron try/catch que ya
//   usa "kit_recien_confirmado" si esta ejecucion viene realmente de
//   "Identificar Necesidad" (y no del camino viejo de "kit ya pineado de
//   antes", que reusa los mismos nodos de compatibilidad pero nunca tuvo
//   este paso de confirmacion) antes de dejar pasar el envio.
//
// Cambio 2 -- respuesta "otro" del partidor de sub-preguntas:
//   "Preparar Contexto Sub-preguntas" ahora expone `compat_modelo_pendiente`
//   (true si el mensaje nombra una moto puntual -- esto se sabe de
//   inmediato, sin esperar a que se resuelva, asi que no hay condicion de
//   carrera). "Consolidar Dato Resuelto" ya no usa el `detalle` del kit
//   para la categoria "otro" cuando esa bandera esta prendida -- sigue
//   probando `conocimiento_libre` como siempre. Esto aplica en cualquier
//   caso con una moto puntual mencionada (se resuelva o no la
//   compatibilidad), no solo cuando el kit se acaba de identificar: evita
//   que la respuesta generica compita con la respuesta especifica de
//   compatibilidad en cualquier escenario.
//
// No se toca nada mas: sin moto puntual, o con dato (compatible o no), la
// confirmacion sigue mandandose igual que hoy. El camino de "kit ya
// pineado de antes" (Fase 2/3) tampoco cambia.
//
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";
import { randomUUID } from "crypto";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-confirmacion-antes-de-tiempo_2026-08-18.json", import.meta.url);

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

const OLD_CONTEXTO_CODE =
  "let kitId = null, kitNombre = null;\ntry {\n  const k = $('Parsear Kit Pineado').item.json;\n  if (k && k.kit_id) { kitId = k.kit_id; kitNombre = k.kit_nombre || null; }\n} catch (e) {}\n\nlet kitRecienConfirmado = false;\ntry {\n  $('Marcar Kit Pineado').item;\n  kitRecienConfirmado = true;\n} catch (e) {}\n\nlet textoParaDividir = null;\ntry {\n  const c = $('Parsear Pregunta Compatibilidad').item.json;\n  if (c && typeof c.resto_mensaje === 'string') textoParaDividir = c.resto_mensaje;\n} catch (e) {}\nif (textoParaDividir === null) {\n  textoParaDividir = $('Clasificar Mensaje (sin IA)').item.json.resto_mensaje || $('Unir Mensajes').item.json.texto_completo;\n}\n\nreturn [{ json: { kit_id: kitId, kit_nombre: kitNombre, texto_para_dividir: textoParaDividir, kit_recien_confirmado: kitRecienConfirmado } }];\n";

const NEW_CONTEXTO_CODE =
  "let kitId = null, kitNombre = null;\ntry {\n  const k = $('Parsear Kit Pineado').item.json;\n  if (k && k.kit_id) { kitId = k.kit_id; kitNombre = k.kit_nombre || null; }\n} catch (e) {}\n\nlet kitRecienConfirmado = false;\ntry {\n  $('Marcar Kit Pineado').item;\n  kitRecienConfirmado = true;\n} catch (e) {}\n\nlet compatModeloPendiente = false;\ntry {\n  const c = $('Parsear Pregunta Compatibilidad').item.json;\n  if (c && c.es_compatibilidad === true && (c.modelo_moto || '').toString().trim() !== '') {\n    compatModeloPendiente = true;\n  }\n} catch (e) {}\n\nlet textoParaDividir = null;\ntry {\n  const c = $('Parsear Pregunta Compatibilidad').item.json;\n  if (c && typeof c.resto_mensaje === 'string') textoParaDividir = c.resto_mensaje;\n} catch (e) {}\nif (textoParaDividir === null) {\n  textoParaDividir = $('Clasificar Mensaje (sin IA)').item.json.resto_mensaje || $('Unir Mensajes').item.json.texto_completo;\n}\n\nreturn [{ json: { kit_id: kitId, kit_nombre: kitNombre, texto_para_dividir: textoParaDividir, kit_recien_confirmado: kitRecienConfirmado, compat_modelo_pendiente: compatModeloPendiente } }];\n";

const OLD_CONSOLIDAR_CODE =
  "const categoria = $('Separar Pedazos').item.json.categoria;\nconst texto = $('Separar Pedazos').item.json.texto;\n\nlet dato = null;\nif (categoria === 'precio') {\n  const r = $('Buscar Precio Kit Pineado').item.json;\n  if (r && r.precio != null) dato = 'Precio: ' + r.precio;\n} else if (categoria === 'envio') {\n  const kitEnvio = $('Buscar Envio Kit Pineado').item.json;\n  if (kitEnvio && kitEnvio.envio != null) {\n    dato = kitEnvio.envio;\n  } else {\n    const general = $('Buscar Info Negocio (Envio General)').item.json;\n    if (general && general.respuesta != null) dato = general.respuesta;\n  }\n} else if (categoria === 'negocio') {\n  const r = $('Buscar Info Negocio (Negocio)').item.json;\n  if (r && r.respuesta != null) dato = r.respuesta;\n} else if (categoria === 'cierre') {\n  dato = 'Dale, cualquier cosa nos escribís.';\n} else {\n  const detalle = $('Parsear Respuesta Otro desde Detalle').item.json;\n  if (detalle && detalle.resuelto === true && detalle.dato) {\n    dato = detalle.dato;\n  } else {\n    const r = $('Buscar en Conocimiento Libre (Sin Match)').item.json;\n    if (r && r.respuesta != null) dato = r.respuesta;\n  }\n}\n\nreturn { json: { texto, categoria, dato_texto: dato || 'SIN_DATO' } };\n";

const NEW_CONSOLIDAR_CODE =
  "const categoria = $('Separar Pedazos').item.json.categoria;\nconst texto = $('Separar Pedazos').item.json.texto;\n\nlet dato = null;\nif (categoria === 'precio') {\n  const r = $('Buscar Precio Kit Pineado').item.json;\n  if (r && r.precio != null) dato = 'Precio: ' + r.precio;\n} else if (categoria === 'envio') {\n  const kitEnvio = $('Buscar Envio Kit Pineado').item.json;\n  if (kitEnvio && kitEnvio.envio != null) {\n    dato = kitEnvio.envio;\n  } else {\n    const general = $('Buscar Info Negocio (Envio General)').item.json;\n    if (general && general.respuesta != null) dato = general.respuesta;\n  }\n} else if (categoria === 'negocio') {\n  const r = $('Buscar Info Negocio (Negocio)').item.json;\n  if (r && r.respuesta != null) dato = r.respuesta;\n} else if (categoria === 'cierre') {\n  dato = 'Dale, cualquier cosa nos escribís.';\n} else {\n  let compatModeloPendiente = false;\n  try {\n    compatModeloPendiente = $('Preparar Contexto Sub-preguntas').item.json.compat_modelo_pendiente === true;\n  } catch (e) {}\n\n  const detalle = compatModeloPendiente ? null : $('Parsear Respuesta Otro desde Detalle').item.json;\n  if (!compatModeloPendiente && detalle && detalle.resuelto === true && detalle.dato) {\n    dato = detalle.dato;\n  } else {\n    const r = $('Buscar en Conocimiento Libre (Sin Match)').item.json;\n    if (r && r.respuesta != null) dato = r.respuesta;\n  }\n}\n\nreturn { json: { texto, categoria, dato_texto: dato || 'SIN_DATO' } };\n";

const CHEQUEAR_CONFIRMACION_CODE =
  "let debeConfirmar = false;\nlet mensaje = '';\ntry {\n  $('Preparar Pin desde Identificacion').item;\n  debeConfirmar = true;\n  mensaje = ($('Parsear Identificar Necesidad').item.json.mensaje || '').toString();\n} catch (e) {}\n\nreturn [{ json: { debe_confirmar: debeConfirmar, mensaje } }];\n";

function newNode({ name, type, typeVersion, position, parameters, mode }) {
  const node = {
    id: randomUUID(),
    name,
    type,
    typeVersion,
    position,
    parameters,
  };
  if (mode) node.parameters.mode = mode;
  return node;
}

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const byName = (n) => wf.nodes.find((x) => x.name === n);

  // --- Cambio 2: gatear la respuesta "otro" cuando hay moto puntual en juego ---
  const contexto = byName("Preparar Contexto Sub-preguntas");
  if (!contexto) throw new Error('No se encontro "Preparar Contexto Sub-preguntas"');
  if (contexto.parameters.jsCode !== OLD_CONTEXTO_CODE) {
    throw new Error('El codigo de "Preparar Contexto Sub-preguntas" no coincide con lo esperado -- revisar a mano.');
  }
  contexto.parameters.jsCode = NEW_CONTEXTO_CODE;

  const consolidar = byName("Consolidar Dato Resuelto");
  if (!consolidar) throw new Error('No se encontro "Consolidar Dato Resuelto"');
  if (consolidar.parameters.jsCode !== OLD_CONSOLIDAR_CODE) {
    throw new Error('El codigo de "Consolidar Dato Resuelto" no coincide con lo esperado -- revisar a mano.');
  }
  consolidar.parameters.jsCode = NEW_CONSOLIDAR_CODE;

  console.log('Codigo actualizado en "Preparar Contexto Sub-preguntas" y "Consolidar Dato Resuelto".');

  // --- Cambio 1: frenar la confirmacion prematura ---
  const anchor = byName("¿Detalle Resuelve Compatibilidad?");
  if (!anchor) throw new Error('No se encontro "¿Detalle Resuelve Compatibilidad?"');
  const [ax, ay] = anchor.position;

  const chequear = newNode({
    name: "Chequear Confirmacion Pendiente",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [ax + 250, ay + 500],
    parameters: { jsCode: CHEQUEAR_CONFIRMACION_CODE },
  });

  const debeConfirmarIf = newNode({
    name: "¿Debe Confirmar Kit?",
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [ax + 500, ay + 500],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
        conditions: [
          {
            id: randomUUID(),
            leftValue: "={{ $json.debe_confirmar }}",
            rightValue: true,
            operator: { type: "boolean", operation: "equals" },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
  });

  const finSinConfirmar = newNode({
    name: "Fin - Sin Confirmar Kit",
    type: "n8n-nodes-base.noOp",
    typeVersion: 1,
    position: [ax + 750, ay + 600],
    parameters: {},
  });

  wf.nodes.push(chequear, debeConfirmarIf, finSinConfirmar);
  console.log("Nodos nuevos agregados: Chequear Confirmacion Pendiente, ¿Debe Confirmar Kit?, Fin - Sin Confirmar Kit.");

  const conn = wf.connections;

  // 1) sacar el envio directo e inmediato desde "¿Qué Identificó?"
  const queIdentifico = conn["¿Qué Identificó?"];
  if (!queIdentifico) throw new Error('No hay conexiones para "¿Qué Identificó?"');
  const kitConfiadoOut = queIdentifico.main[0];
  const antes = kitConfiadoOut.length;
  queIdentifico.main[0] = kitConfiadoOut.filter((c) => c.node !== "Enviar Confirmacion Kit (Propuesta)");
  if (queIdentifico.main[0].length !== antes - 1) {
    throw new Error('No se encontro (o se encontro mas de una vez) la conexion "¿Qué Identificó?" -> "Enviar Confirmacion Kit (Propuesta)".');
  }
  console.log('Conexion directa "¿Qué Identificó?" -> "Enviar Confirmacion Kit (Propuesta)" eliminada.');

  // 2) conectar los 4 puntos de salida donde SI corresponde confirmar
  function addTarget(nodeName, outputIndex, targetName) {
    const c = conn[nodeName];
    if (!c || !c.main[outputIndex]) throw new Error(`No hay salida ${outputIndex} en "${nodeName}"`);
    c.main[outputIndex].push({ node: targetName, type: "main", index: 0 });
  }

  addTarget("¿Es Compatibilidad Con Modelo?", 1, "Chequear Confirmacion Pendiente"); // FALSE: no es pregunta de compatibilidad con modelo
  addTarget("¿Compatibilidad Sin Marca/Modelo?", 0, "Chequear Confirmacion Pendiente"); // TRUE: cilindrada sola, sin certeza de moto
  addTarget("¿Hay Dato de Compatibilidad?", 0, "Chequear Confirmacion Pendiente"); // TRUE: ya hay dato confirmado
  addTarget("¿Detalle Resuelve Compatibilidad?", 0, "Chequear Confirmacion Pendiente"); // TRUE: el detalle resuelve
  // OJO: "¿Detalle Resuelve Compatibilidad?" salida FALSE (compatible === null,
  // sin dato) NO se conecta -- ese es exactamente el caso a frenar.
  console.log('Los 4 puntos "sigue igual que hoy" ahora tambien alimentan "Chequear Confirmacion Pendiente".');

  // 3) cablear el chequeo nuevo
  conn["Chequear Confirmacion Pendiente"] = {
    main: [[{ node: "¿Debe Confirmar Kit?", type: "main", index: 0 }]],
  };
  conn["¿Debe Confirmar Kit?"] = {
    main: [
      [{ node: "Enviar Confirmacion Kit (Propuesta)", type: "main", index: 0 }],
      [{ node: "Fin - Sin Confirmar Kit", type: "main", index: 0 }],
    ],
  };
  console.log('Wiring nuevo: Chequear Confirmacion Pendiente -> ¿Debe Confirmar Kit? -> Enviar Confirmacion Kit / Fin.');

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
    fresh.nodes.some((n) => n.name === "Chequear Confirmacion Pendiente"),
    fresh.nodes.some((n) => n.name === "¿Debe Confirmar Kit?"),
    fresh.nodes.some((n) => n.name === "Fin - Sin Confirmar Kit"),
    fresh.nodes.find((n) => n.name === "Preparar Contexto Sub-preguntas")?.parameters.jsCode === NEW_CONTEXTO_CODE,
    fresh.nodes.find((n) => n.name === "Consolidar Dato Resuelto")?.parameters.jsCode === NEW_CONSOLIDAR_CODE,
    !fresh.connections["¿Qué Identificó?"].main[0].some((c) => c.node === "Enviar Confirmacion Kit (Propuesta)"),
    fresh.connections["¿Detalle Resuelve Compatibilidad?"].main[0].some((c) => c.node === "Chequear Confirmacion Pendiente"),
    !fresh.connections["¿Detalle Resuelve Compatibilidad?"].main[1].some((c) => c.node === "Chequear Confirmacion Pendiente"),
  ];
  const ok = checks.every(Boolean);
  console.log("Verificacion:", checks);
  console.log(ok ? "Fix aplicado correctamente." : "REVISAR A MANO, algo no quedo como se esperaba.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
