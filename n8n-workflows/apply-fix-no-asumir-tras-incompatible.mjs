// Fix (2026-08-27): el bot dejaba de asumir cosas que no sabe despues de un
// "no tenemos nada para tu moto".
//
// Caso real: conv 2277 / David Sandoval (+5493482272506). El equipo le dijo por
// nota privada que no tenemos nada para potenciar su Honda Wave NF; 30 min
// despues el cliente pregunto "un aproximado" y el bot contesto "El precio es
// de $84.999" -- el precio del Kit 170 que seguia pineado en Redis, para un
// producto que le acabamos de decir que no tenemos para el.
//
// Dos agujeros encadenados:
//  1. Cuando el equipo responde "no es compatible" por nota privada y el kit es
//     SIMPLE (no grupo), el workflow guardaba en compatibilidades y avisaba al
//     cliente, pero NUNCA marcaba `incompatible_reciente`. Solo la rama grupo lo
//     hacia (drift grupo vs kit simple de siempre). Idem la rama de "no
//     compatible" resuelta directo de la base (`Es Realmente Compatible? -> Fin`).
//  2. El partidor de sub-preguntas (precio/stock/otro) nunca miraba
//     `incompatible_reciente`: `Buscar Precio Kit Pineado` contesta el precio del
//     kit pineado sin ningun chequeo.
//
// Cambios:
//  P1a. Nodo IF nuevo `Es Compatible? (Actualizar Pin Simple)` colgado de
//       `Guardar en Compatibilidades`: si el equipo dijo NO, marca
//       `incompatible_reciente` (reusa `Marcar Incompatibilidad Reciente
//       (Respuesta Equipo)`). No toca el pin (evita re-welcome).
//  P1b. `Es Realmente Compatible? (main false)` ahora tambien dispara un nodo
//       nuevo `Marcar Incompatibilidad Reciente (Kit Simple)`.
//  P2.  Nodo redis nuevo `Leer Incompatibilidad Reciente (Rafaga)` en serie
//       antes de `Preparar Contexto Sub-preguntas`; ese nodo y `Parsear
//       Sub-preguntas` propagan el flag y, si la incompatibilidad reciente es
//       del MISMO kit pineado, anulan `kit_id` -> precio/stock/otro caen a
//       "otro" y escalan en vez de auto-responder.
//  P3.  `Chequear Insiste Pese a Incompatibilidad`: el nombre del kit para la
//       nota ahora tambien se busca en `packs` (antes solo `grupos`).
//
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.APIKEY_N8N || process.env.API_KEY_N8N || process.env.N8N_KEY;
if (!API_KEY) throw new Error("Falta APIKEY_N8N en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-no-asumir-tras-incompatible_2026-08-27.json", import.meta.url);
const REDIS_CRED = { redis: { id: "ZUlkjSz8R2bmmO2f", name: "Redis account 2" } };
const PHONE_KEY_INBOUND =
  "($('Webhook1').item.json.body.conversation.messages[0].sender.phone_number || ('conv-' + $('Webhook1').item.json.body.conversation.messages[0].conversation_id))";

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

function replaceOnce(code, oldStr, newStr, label) {
  if (!code.includes(oldStr)) throw new Error(`Anchor no encontrado (${label}) -- revisar a mano`);
  const parts = code.split(oldStr);
  if (parts.length !== 2) throw new Error(`Anchor ambiguo (${label}) -- aparece ${parts.length - 1} veces`);
  return parts.join(newStr);
}

function addConn(connections, from, toNode, fromIndex = 0, toIndex = 0) {
  connections[from] = connections[from] || { main: [] };
  const main = connections[from].main;
  while (main.length <= fromIndex) main.push([]);
  main[fromIndex].push({ node: toNode, type: "main", index: toIndex });
}

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup guardado. Nodos actuales:", wf.nodes.length);

  const nodeByName = (n) => {
    const found = wf.nodes.find((x) => x.name === n);
    if (!found) throw new Error(`No existe el nodo "${n}"`);
    return found;
  };
  // Algunos nodos empiezan con "¿" -- lo evitamos en el codigo buscando por substring.
  const resolveName = (substr) => {
    const matches = wf.nodes.filter((x) => x.name.includes(substr));
    if (matches.length !== 1) throw new Error(`resolveName("${substr}") encontro ${matches.length} nodos`);
    return matches[0].name;
  };
  const conns = wf.connections;
  const NAME_ES_REALMENTE_COMPAT = resolveName("Es Realmente Compatible?");
  const NAME_MARCAR_INCOMPAT_EQUIPO = "Marcar Incompatibilidad Reciente (Respuesta Equipo)";
  console.log("Resuelto:", JSON.stringify(NAME_ES_REALMENTE_COMPAT));

  // --------------------------------------------------------------------------
  // P3 -- Chequear Insiste Pese a Incompatibilidad: nombre tambien desde packs
  // --------------------------------------------------------------------------
  {
    const node = nodeByName("Chequear Insiste Pese a Incompatibilidad");
    const OLD =
      "const grupos2 = ($('Buscar Kits Activos').item.json.grupos) || [];\n" +
      "const grupoNombre = incompatGrupoId !== null ? (grupos2.find((g) => g.id === incompatGrupoId)?.nombre || '') : '';";
    const NEW =
      "const grupos2 = ($('Buscar Kits Activos').item.json.grupos) || [];\n" +
      "const packs2 = ($('Buscar Kits Activos').item.json.packs) || [];\n" +
      "// 2026-08-27: el flag incompatible_reciente ahora tambien lo setean las ramas de\n" +
      "// kit SIMPLE (Marcar Incompatibilidad Reciente (Kit Simple) / (Respuesta Equipo)).\n" +
      "// El match por id de arriba ya sirve para packs; solo faltaba el nombre para la nota.\n" +
      "const grupoNombre = incompatGrupoId !== null ? ((grupos2.find((g) => g.id === incompatGrupoId)?.nombre) || (packs2.find((p) => p.id === incompatGrupoId)?.nombre) || '') : '';";
    node.parameters.jsCode = replaceOnce(node.parameters.jsCode, OLD, NEW, "P3 Chequear Insiste");
    console.log("P3 OK -- Chequear Insiste Pese a Incompatibilidad");
  }

  // --------------------------------------------------------------------------
  // P2 -- leer incompatible_reciente por rafaga y propagarlo al partidor
  // --------------------------------------------------------------------------
  {
    const leerRafaga = {
      parameters: {
        operation: "get",
        propertyName: "incompatible_raw",
        key: `=incompatible_reciente:{{ ${PHONE_KEY_INBOUND} }}`,
        options: {},
      },
      id: "a1b2c3d4-e5f6-47a8-9b0c-incompatrafaga1",
      name: "Leer Incompatibilidad Reciente (Rafaga)",
      type: "n8n-nodes-base.redis",
      typeVersion: 1,
      position: [8130, 0],
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 1000,
      credentials: REDIS_CRED,
    };
    wf.nodes.push(leerRafaga);

    // insertar en serie: Buscar Cierre Reciente (Rafaga) -> [nuevo] -> Preparar Contexto Sub-preguntas
    const c = conns["Buscar Cierre Reciente (Rafaga)"].main[0];
    const idx = c.findIndex((x) => x.node === "Preparar Contexto Sub-preguntas");
    if (idx === -1) throw new Error("Buscar Cierre Reciente (Rafaga) ya no apunta a Preparar Contexto Sub-preguntas");
    c.splice(idx, 1);
    addConn(conns, "Buscar Cierre Reciente (Rafaga)", "Leer Incompatibilidad Reciente (Rafaga)");
    addConn(conns, "Leer Incompatibilidad Reciente (Rafaga)", "Preparar Contexto Sub-preguntas");

    // Preparar Contexto Sub-preguntas: exponer incompatible_raw
    const prep = nodeByName("Preparar Contexto Sub-preguntas");
    prep.parameters.jsCode = replaceOnce(
      prep.parameters.jsCode,
      "let cierreRecienteRaw = null;\ntry {\n  cierreRecienteRaw = $('Buscar Cierre Reciente (Rafaga)').item.json.cierre_reciente_raw;\n} catch (e) {}",
      "let cierreRecienteRaw = null;\ntry {\n  cierreRecienteRaw = $('Buscar Cierre Reciente (Rafaga)').item.json.cierre_reciente_raw;\n} catch (e) {}\n\nlet incompatibleRaw = null;\ntry {\n  incompatibleRaw = $('Leer Incompatibilidad Reciente (Rafaga)').item.json.incompatible_raw;\n} catch (e) {}",
      "P2 Preparar Contexto (leer)"
    );
    prep.parameters.jsCode = replaceOnce(
      prep.parameters.jsCode,
      "ultimo_mensaje_nuestro: ultimoMensajeNuestro, cierre_reciente_raw: cierreRecienteRaw } }];",
      "ultimo_mensaje_nuestro: ultimoMensajeNuestro, cierre_reciente_raw: cierreRecienteRaw, incompatible_raw: incompatibleRaw } }];",
      "P2 Preparar Contexto (return)"
    );

    // Parsear Sub-preguntas: bloquear el kit si la incompatibilidad reciente es del mismo kit
    const parse = nodeByName("Parsear Sub-preguntas");
    parse.parameters.jsCode = replaceOnce(
      parse.parameters.jsCode,
      "const cierreRecienteRaw = $('Preparar Contexto Sub-preguntas').item.json.cierre_reciente_raw;",
      "const cierreRecienteRaw = $('Preparar Contexto Sub-preguntas').item.json.cierre_reciente_raw;\n" +
        "// 2026-08-27: si al cliente ya le dijimos que este mismo kit no es compatible / no lo\n" +
        "// tenemos para su moto, no auto-respondemos precio/stock/detalle de ese kit -> anulamos\n" +
        "// kit_id para que caiga en 'otro' y escale (ver feedback-bot-aliviador-mensajes).\n" +
        "const incompatibleRaw = $('Preparar Contexto Sub-preguntas').item.json.incompatible_raw;\n" +
        "let kitBloqueadoPorIncompat = false;\n" +
        "try {\n" +
        "  const pi = typeof incompatibleRaw === 'string' ? JSON.parse(incompatibleRaw) : incompatibleRaw;\n" +
        "  if (pi && pi.grupo_id && kitId && Number(pi.grupo_id) === Number(kitId)) kitBloqueadoPorIncompat = true;\n" +
        "} catch (e) {}\n" +
        "const kitIdEfectivo = kitBloqueadoPorIncompat ? null : kitId;",
      "P2 Parsear Sub-preguntas (guard)"
    );
    parse.parameters.jsCode = replaceOnce(
      parse.parameters.jsCode,
      "    if (categoria === 'precio' && !kitId) categoria = 'otro';\n    if (categoria === 'stock' && !kitId) categoria = 'otro';",
      "    if (categoria === 'precio' && !kitIdEfectivo) categoria = 'otro';\n    if (categoria === 'stock' && !kitIdEfectivo) categoria = 'otro';",
      "P2 Parsear Sub-preguntas (downgrade)"
    );
    parse.parameters.jsCode = replaceOnce(
      parse.parameters.jsCode,
      "texto_sql: escapar(p.texto), kit_id: kitId, kit_nombre: kitNombre, cierre_reciente_raw: cierreRecienteRaw }));",
      "texto_sql: escapar(p.texto), kit_id: kitIdEfectivo, kit_nombre: kitNombre, cierre_reciente_raw: cierreRecienteRaw }));",
      "P2 Parsear Sub-preguntas (propagar)"
    );
    console.log("P2 OK -- Leer Incompatibilidad Reciente (Rafaga) + partidor de sub-preguntas");
  }

  // --------------------------------------------------------------------------
  // P1a -- rama respuesta-equipo, kit SIMPLE, "no compatible" -> marcar flag
  // --------------------------------------------------------------------------
  {
    const ifSimple = {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
          conditions: [
            {
              id: "cmp-simple-01",
              leftValue: "={{ $('Parsear Respuesta Equipo').item.json.compatible }}",
              rightValue: true,
              operator: { type: "boolean", operation: "equals" },
            },
          ],
          combinator: "and",
        },
        options: {},
      },
      id: "b2c3d4e5-f6a7-48b9-8c0d-actualizapinsi",
      name: "Es Compatible? (Actualizar Pin Simple)",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [3024, 224],
    };
    const finCompatSimple = {
      parameters: {},
      id: "c3d4e5f6-a7b8-49c0-8d1e-fincompatsimp1",
      name: "Fin - Compatible Simple (Pin Intacto)",
      type: "n8n-nodes-base.noOp",
      typeVersion: 1,
      position: [3280, 128],
    };
    wf.nodes.push(ifSimple, finCompatSimple);
    addConn(conns, "Guardar en Compatibilidades", "Es Compatible? (Actualizar Pin Simple)");
    addConn(conns, "Es Compatible? (Actualizar Pin Simple)", "Fin - Compatible Simple (Pin Intacto)", 0, 0);
    addConn(conns, "Es Compatible? (Actualizar Pin Simple)", "Marcar Incompatibilidad Reciente (Respuesta Equipo)", 1, 0);
    console.log("P1a OK -- Es Compatible? (Actualizar Pin Simple)");
  }

  // --------------------------------------------------------------------------
  // P1b -- rama "no compatible" resuelta directo de la base -> marcar flag
  // --------------------------------------------------------------------------
  {
    const marcarKitSimple = {
      parameters: {
        operation: "set",
        key: `=incompatible_reciente:{{ ${PHONE_KEY_INBOUND} }}`,
        value:
          "={{ JSON.stringify({ grupo_id: $('Parsear Pregunta Compatibilidad').item.json.kit_id, modelo_moto: $('Parsear Pregunta Compatibilidad').item.json.modelo_moto }) }}",
        expire: true,
        ttl: 21600,
      },
      id: "d4e5f6a7-b8c9-40d1-8e2f-marcarkitsimp1",
      name: "Marcar Incompatibilidad Reciente (Kit Simple)",
      type: "n8n-nodes-base.redis",
      typeVersion: 1,
      position: [7696, 1120],
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 1000,
      credentials: REDIS_CRED,
    };
    wf.nodes.push(marcarKitSimple);
    addConn(conns, NAME_ES_REALMENTE_COMPAT, "Marcar Incompatibilidad Reciente (Kit Simple)", 1, 0);
    console.log("P1b OK -- Marcar Incompatibilidad Reciente (Kit Simple)");
  }

  // --------------------------------------------------------------------------
  const allowedSettingsKeys = [
    "saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
    "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder",
  ];
  const settings = Object.fromEntries(
    Object.entries(wf.settings || {}).filter(([k]) => allowedSettingsKeys.includes(k))
  );
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: JSON.stringify(body) });
  console.log("Actualizado. Nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  // Verificacion
  const fresh = await api(`/workflows/${WORKFLOW_ID}`);
  const has = (n) => fresh.nodes.some((x) => x.name === n);
  const checks = [
    ["nodo Leer Incompatibilidad Reciente (Rafaga)", has("Leer Incompatibilidad Reciente (Rafaga)")],
    ["nodo Es Compatible? (Actualizar Pin Simple)", has("Es Compatible? (Actualizar Pin Simple)")],
    ["nodo Marcar Incompatibilidad Reciente (Kit Simple)", has("Marcar Incompatibilidad Reciente (Kit Simple)")],
    [
      "Parsear Sub-preguntas usa kitIdEfectivo",
      fresh.nodes.find((x) => x.name === "Parsear Sub-preguntas")?.parameters.jsCode.includes("kitIdEfectivo"),
    ],
    [
      "Preparar Contexto expone incompatible_raw",
      fresh.nodes.find((x) => x.name === "Preparar Contexto Sub-preguntas")?.parameters.jsCode.includes("incompatible_raw"),
    ],
    [
      "Chequear Insiste mira packs2",
      fresh.nodes.find((x) => x.name === "Chequear Insiste Pese a Incompatibilidad")?.parameters.jsCode.includes("packs2"),
    ],
    [
      "Buscar Cierre Reciente (Rafaga) -> Leer Incompatibilidad Reciente (Rafaga)",
      fresh.connections["Buscar Cierre Reciente (Rafaga)"].main[0].some(
        (x) => x.node === "Leer Incompatibilidad Reciente (Rafaga)"
      ),
    ],
    [
      "Leer Incompatibilidad Reciente (Rafaga) -> Preparar Contexto Sub-preguntas",
      fresh.connections["Leer Incompatibilidad Reciente (Rafaga)"]?.main[0].some(
        (x) => x.node === "Preparar Contexto Sub-preguntas"
      ),
    ],
    [
      "Es Realmente Compatible? (false) -> Marcar Incompatibilidad Reciente (Kit Simple)",
      fresh.connections[NAME_ES_REALMENTE_COMPAT].main[1].some(
        (x) => x.node === "Marcar Incompatibilidad Reciente (Kit Simple)"
      ),
    ],
  ];
  let allOk = true;
  for (const [label, ok] of checks) {
    console.log(ok ? "  OK  " : "  FALLA", label);
    if (!ok) allOk = false;
  }
  console.log(allOk ? "\nFix aplicado correctamente." : "\nREVISAR A MANO -- algo no quedo bien.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
