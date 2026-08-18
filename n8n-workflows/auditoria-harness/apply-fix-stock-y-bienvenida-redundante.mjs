// Dos fixes relacionados, encontrados auditando en vivo la conv 2074 (+5493834963190):
// escribio "Te queda" preguntando si hay stock de un kit del que ya se habia hablado (Kit 1,
// plantilla del 17/8 -- el pin de Redis por alguna razon ya no estaba). El bot lo interpreto mal
// en dos niveles:
//
// 1. "Identificar Necesidad" (feat 17/8) tomo "Te queda" como interes nuevo (kit_confiado) y
//    mando la bienvenida completa con foto (feat 18/8) -- pitch de venta entero como respuesta a
//    una pregunta de dos palabras sobre disponibilidad.
// 2. En paralelo, "Te queda" cayo en la categoria "otro" del partidor de sub-preguntas, no
//    encontro nada en el detalle del kit, y escalo al equipo -- que confirmo "sisi, hay en
//    stock" y recien ahi el bot le mando al cliente la respuesta real.
//
// Charlado con Martin: como todo lo que esta publicitado con plantilla de Meta Ads esta
// efectivamente en stock (no se publicita algo sin stock), la pregunta de disponibilidad SIEMPRE
// se puede contestar que si, sin escalar nunca y sin mandar la bienvenida de nuevo.
//
// Cambio A -- categoria "stock" nueva en el partidor de sub-preguntas (Fase 6), mismo patron que
// "cierre" (18/8): respuesta fija, nunca escala, no agrega nodos nuevos.
//   - "Dividir y Etiquetar Sub-preguntas": bullet "stock" nueva, con el mismo condicional de
//     kit_id que ya usa "precio".
//   - "Parsear Sub-preguntas": "stock" a la whitelist + mismo guard que "precio" (sin kit_id, cae
//     a "otro").
//   - "Consolidar Dato Resuelto": rama "stock" -> texto fijo "Si, tenemos stock.", sin buscar
//     nada.
//   - "Armar Mensajes": "stock" al mapa de prioridad (justo despues de "precio").
//
// Cambio B -- tipo nuevo "kit_stock" en "Identificar Necesidad", para no mandar la bienvenida
// cuando el mensaje es SOLO una pregunta de disponibilidad sobre un kit ya identificable por el
// historial (no un pedido de informacion nueva).
//   - "Identificar Necesidad" (prompt): tipo "kit_stock" nuevo, distinto de "kit_confiado".
//   - "Parsear Identificar Necesidad": "kit_stock" valida kit_id igual que "kit_confiado".
//   - "¿Qué Identificó?" (switch): rama nueva "Kit Stock" (tipo === 'kit_stock').
//   - Nodo nuevo "Preparar Pin desde Identificacion (Stock)": CLON identico de "Preparar Pin
//     desde Identificacion", pero con nombre distinto a proposito -- "¿Es Kit Recien
//     Identificado?" chequea especificamente el nombre "Preparar Pin desde Identificacion" para
//     decidir si viene de Identificar Necesidad (y por lo tanto manda bienvenida). Al usar un
//     nombre distinto para el clon, ese chequeo da false para el camino de stock, y
//     "¿Viene de Identificar Necesidad?" lo manda derecho a "Extraer Pregunta Compatibilidad" sin
//     bienvenida -- mismo comportamiento que el camino de "kit ya pineado de antes", que nunca
//     tuvo bienvenida. El pin en Redis se sigue refrescando igual (via "Refrescar Kit Pineado",
//     que no depende de cual de los dos nodos "Preparar Pin..." disparo la ejecucion).
//   - Sin tocar "¿Es Kit Recien Identificado?", "¿Viene de Identificar Necesidad?", "Buscar
//     Bienvenida Kit Identificado" ni "Enviar Saludo Kit (Identificar Necesidad)" -- se
//     reutilizan tal cual gracias al chequeo por nombre de nodo que ya tenian.
//
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";
import { randomUUID } from "crypto";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-stock-y-bienvenida-redundante_2026-08-18.json", import.meta.url);

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

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const nodeByName = (name) => {
    const n = wf.nodes.find((x) => x.name === name);
    if (!n) throw new Error(`No se encontro el nodo "${name}"`);
    return n;
  };

  // ========== Cambio A: categoria "stock" en el partidor de sub-preguntas ==========

  const splitNode = nodeByName("Dividir y Etiquetar Sub-preguntas");
  let sys = splitNode.parameters.options.systemMessage;

  sys = replaceOnce(
    sys,
    `Para cada parte, asigná una categoría de esta lista cerrada: "precio", "envio", "negocio", "cierre", "otro".`,
    `Para cada parte, asigná una categoría de esta lista cerrada: "precio", "stock", "envio", "negocio", "cierre", "otro".`,
    "intro categorias"
  );

  sys = replaceOnce(
    sys,
    `así que NUNCA uses "precio" -- cualquier pregunta de precio en este caso va como "otro".' }}\n- "envio":`,
    `así que NUNCA uses "precio" -- cualquier pregunta de precio en este caso va como "otro".' }}\n- "stock": pregunta si hay stock, si queda, o si está disponible el kit YA IDENTIFICADO en la charla (ej. "te queda", "hay stock", "tenés disponible", "queda alguno", "sigue disponible"). Como todo lo que publicitamos está efectivamente en stock, la respuesta siempre es que sí -- nunca escala, ya está resuelta de por sí. {{ $json.kit_id !== null ? 'En esta charla SÍ hay un kit ya identificado, así que "stock" es válido.' : 'En esta charla NO hay ningún kit identificado todavía, así que NUNCA uses "stock" -- cualquier pregunta de disponibilidad en este caso va como "otro".' }}\n- "envio":`,
    "bullet stock"
  );

  sys = replaceOnce(
    sys,
    `"categoria": "precio|envio|negocio|cierre|otro"`,
    `"categoria": "precio|stock|envio|negocio|cierre|otro"`,
    "formato json"
  );

  splitNode.parameters.options.systemMessage = sys;
  console.log('Prompt de "Dividir y Etiquetar Sub-preguntas" actualizado (categoria "stock" agregada).');

  const parsearSub = nodeByName("Parsear Sub-preguntas");
  parsearSub.parameters.jsCode = replaceOnce(
    parsearSub.parameters.jsCode,
    `const categoriasValidas = ['precio', 'envio', 'negocio', 'cierre', 'otro'];`,
    `const categoriasValidas = ['precio', 'stock', 'envio', 'negocio', 'cierre', 'otro'];`,
    "whitelist Parsear Sub-preguntas"
  );
  parsearSub.parameters.jsCode = replaceOnce(
    parsearSub.parameters.jsCode,
    `if (categoria === 'precio' && !kitId) categoria = 'otro';\n    return { texto: ((p && p.texto) || '').toString().trim(), categoria };`,
    `if (categoria === 'precio' && !kitId) categoria = 'otro';\n    if (categoria === 'stock' && !kitId) categoria = 'otro';\n    return { texto: ((p && p.texto) || '').toString().trim(), categoria };`,
    "guard stock sin kit_id"
  );
  console.log('Code de "Parsear Sub-preguntas" actualizado.');

  const consolidarNode = nodeByName("Consolidar Dato Resuelto");
  consolidarNode.parameters.jsCode = replaceOnce(
    consolidarNode.parameters.jsCode,
    `if (categoria === 'precio') {
  const r = $('Buscar Precio Kit Pineado').item.json;
  if (r && r.precio != null) dato = 'Precio: ' + r.precio;
} else if (categoria === 'envio') {`,
    `if (categoria === 'precio') {
  const r = $('Buscar Precio Kit Pineado').item.json;
  if (r && r.precio != null) dato = 'Precio: ' + r.precio;
} else if (categoria === 'stock') {
  dato = 'Sí, tenemos stock.';
} else if (categoria === 'envio') {`,
    "rama stock en Consolidar Dato Resuelto"
  );
  console.log('Code de "Consolidar Dato Resuelto" actualizado (rama "stock" agregada).');

  const armarMensajes = nodeByName("Armar Mensajes");
  armarMensajes.parameters.jsCode = replaceOnce(
    armarMensajes.parameters.jsCode,
    `const prioridad = { precio: 0, envio: 1, negocio: 2, otro: 3 };`,
    `const prioridad = { precio: 0, stock: 1, envio: 2, negocio: 3, otro: 4 };`,
    "prioridad Armar Mensajes"
  );
  console.log('Code de "Armar Mensajes" actualizado (prioridad "stock" agregada).');

  // ========== Cambio B: tipo "kit_stock" en Identificar Necesidad (sin bienvenida) ==========

  const identificarNode = nodeByName("Identificar Necesidad");
  let idSys = identificarNode.parameters.options.systemMessage;

  idSys = replaceOnce(
    idSys,
    `{"tipo": "saludo" | "kit_confiado" | "candidatos" | "ninguno", "kit_id": numero o null, "candidatos": [{"kit_id": numero, "nombre": "..."}], "mensaje": "..."}`,
    `{"tipo": "saludo" | "kit_confiado" | "kit_stock" | "candidatos" | "ninguno", "kit_id": numero o null, "candidatos": [{"kit_id": numero, "nombre": "..."}], "mensaje": "..."}`,
    "formato json Identificar Necesidad"
  );

  idSys = replaceOnce(
    idSys,
    `Nunca más de una oración.\n- "candidatos":`,
    `Nunca más de una oración. Si el mensaje SOLO pregunta por stock/disponibilidad de un kit que ya se puede identificar por el historial (ej. "te queda", "hay stock", "tenés disponible"), no es "kit_confiado" -- es "kit_stock" (ver abajo).\n- "kit_stock": el mensaje SOLO pregunta si hay stock, si queda, o si está disponible un kit que ya se puede identificar por el historial de la charla (ej. "te queda", "hay stock", "tenés disponible", "queda alguno") -- no es un pedido de información nueva ni la primera vez que se menciona ese kit en la charla. Como todo lo que publicitamos está efectivamente en stock, la respuesta a esto siempre es que sí -- no hace falta escalar ni redactar nada acá, otro paso ya se encarga. kit_id: el id de ESE kit, mismo criterio de confianza que "kit_confiado", tiene que ser un id real de la lista, nunca inventado. candidatos: []. mensaje: "". Si no podés identificar a qué kit se refiere ni por el historial, no es "kit_stock" -- es "ninguno".\n- "candidatos":`,
    "bullet kit_stock"
  );

  identificarNode.parameters.options.systemMessage = idSys;
  console.log('Prompt de "Identificar Necesidad" actualizado (tipo "kit_stock" agregado).');

  const parsearIdentificar = nodeByName("Parsear Identificar Necesidad");
  parsearIdentificar.parameters.jsCode = replaceOnce(
    parsearIdentificar.parameters.jsCode,
    `const tiposValidos = ['saludo', 'kit_confiado', 'candidatos', 'ninguno'];`,
    `const tiposValidos = ['saludo', 'kit_confiado', 'kit_stock', 'candidatos', 'ninguno'];`,
    "whitelist Parsear Identificar Necesidad"
  );
  parsearIdentificar.parameters.jsCode = replaceOnce(
    parsearIdentificar.parameters.jsCode,
    `if (tipo === 'kit_confiado') {\n    const id = Number(parsed.kit_id);`,
    `if (tipo === 'kit_confiado' || tipo === 'kit_stock') {\n    const id = Number(parsed.kit_id);`,
    "validacion kit_id kit_stock"
  );
  console.log('Code de "Parsear Identificar Necesidad" actualizado.');

  // --- Switch "¿Qué Identificó?": nueva rama "Kit Stock" ---
  const switchNode = nodeByName("¿Qué Identificó?");
  const rules = switchNode.parameters.rules.values;
  if (rules.length !== 3 || rules[0].outputKey !== "Kit Confiado" || rules[1].outputKey !== "Candidatos" || rules[2].outputKey !== "Saludo") {
    throw new Error('"¿Qué Identificó?" no tiene la forma esperada (3 reglas: Kit Confiado, Candidatos, Saludo) -- revisar a mano.');
  }
  const nuevaReglaStock = {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
      conditions: [{
        id: randomUUID(),
        leftValue: "={{ $json.tipo }}",
        rightValue: "kit_stock",
        operator: { type: "string", operation: "equals", name: "filter.operator.equals" },
      }],
      combinator: "and",
    },
    renameOutput: true,
    outputKey: "Kit Stock",
  };
  rules.splice(1, 0, nuevaReglaStock); // justo despues de "Kit Confiado"
  console.log('"¿Qué Identificó?" actualizado (regla "Kit Stock" agregada en posicion 1).');

  // Reconectar salidas del switch: se inserta un output nuevo en la posicion 1, todo lo que
  // estaba en 1+ se corre un lugar.
  const switchConns = wf.connections["¿Qué Identificó?"];
  const mainOut = switchConns.main;
  if (mainOut.length !== 4) {
    throw new Error('"¿Qué Identificó?" no tiene 4 salidas (3 reglas + fallback) -- revisar a mano.');
  }
  const [outKitConfiado, outCandidatos, outSaludo, outNinguno] = mainOut;

  // --- Nodo nuevo: clon de "Preparar Pin desde Identificacion" con nombre distinto a proposito ---
  const original = nodeByName("Preparar Pin desde Identificacion");
  const nPinStock = {
    id: randomUUID(),
    name: "Preparar Pin desde Identificacion (Stock)",
    type: original.type,
    typeVersion: original.typeVersion,
    position: [original.position[0], original.position[1] + 180],
    parameters: { jsCode: original.parameters.jsCode },
  };
  wf.nodes.push(nPinStock);

  wf.connections[nPinStock.name] = { main: [[{ node: "Parsear Kit Pineado", type: "main", index: 0 }]] };

  switchConns.main = [
    outKitConfiado,
    [{ node: nPinStock.name, type: "main", index: 0 }],
    outCandidatos,
    outSaludo,
    outNinguno,
  ];
  console.log('Conexiones de "¿Qué Identificó?" actualizadas (5 salidas: Kit Confiado, Kit Stock, Candidatos, Saludo, Ninguno).');

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
  check('"Dividir y Etiquetar Sub-preguntas" tiene "stock"', fSplit?.parameters.options.systemMessage.includes('"stock"'));

  const fParsearSub = fresh.nodes.find((n) => n.name === "Parsear Sub-preguntas");
  check('"Parsear Sub-preguntas" tiene "stock" en whitelist', fParsearSub?.parameters.jsCode.includes("'stock'"));

  const fConsolidar = fresh.nodes.find((n) => n.name === "Consolidar Dato Resuelto");
  check('"Consolidar Dato Resuelto" tiene rama stock', fConsolidar?.parameters.jsCode.includes("categoria === 'stock'"));

  const fArmar = fresh.nodes.find((n) => n.name === "Armar Mensajes");
  check('"Armar Mensajes" tiene prioridad stock', fArmar?.parameters.jsCode.includes("stock: 1"));

  const fIdentificar = fresh.nodes.find((n) => n.name === "Identificar Necesidad");
  check('"Identificar Necesidad" tiene tipo kit_stock', fIdentificar?.parameters.options.systemMessage.includes('"kit_stock"'));

  const fParsearId = fresh.nodes.find((n) => n.name === "Parsear Identificar Necesidad");
  check('"Parsear Identificar Necesidad" valida kit_stock', fParsearId?.parameters.jsCode.includes("tipo === 'kit_stock'"));

  const fSwitch = fresh.nodes.find((n) => n.name === "¿Qué Identificó?");
  const fRules = fSwitch?.parameters.rules.values || [];
  check('"¿Qué Identificó?" tiene 4 reglas con Kit Stock en pos 1', fRules.length === 4 && fRules[1].outputKey === "Kit Stock" && fRules[1].conditions.conditions[0].rightValue === "kit_stock");

  const fPinStock = fresh.nodes.find((n) => n.name === "Preparar Pin desde Identificacion (Stock)");
  check('Nodo "Preparar Pin desde Identificacion (Stock)" existe', !!fPinStock && fPinStock.parameters.jsCode === original.parameters.jsCode);

  const fSwitchConns = fresh.connections["¿Qué Identificó?"];
  check('Conexion switch -> Preparar Pin desde Identificacion (Stock)', (fSwitchConns.main?.[1] || []).some((c) => c.node === "Preparar Pin desde Identificacion (Stock)"));
  check('Conexion switch -> Preparar Pin desde Identificacion (Kit Confiado, sin tocar)', (fSwitchConns.main?.[0] || []).some((c) => c.node === "Preparar Pin desde Identificacion"));
  check('Conexion switch -> Enviar Repregunta Candidatos (Propuesta) (pos 2)', (fSwitchConns.main?.[2] || []).some((c) => c.node === "Enviar Repregunta Candidatos (Propuesta)"));
  check('Conexion switch -> Enviar Saludo Generico (pos 3)', (fSwitchConns.main?.[3] || []).some((c) => c.node === "Enviar Saludo Generico"));
  check('Conexion switch -> Preparar Contexto Sub-preguntas (fallback, pos 4)', (fSwitchConns.main?.[4] || []).some((c) => c.node === "Preparar Contexto Sub-preguntas"));

  const fPinStockConns = fresh.connections["Preparar Pin desde Identificacion (Stock)"];
  check('Conexion Preparar Pin desde Identificacion (Stock) -> Parsear Kit Pineado', (fPinStockConns?.main?.[0] || []).some((c) => c.node === "Parsear Kit Pineado"));

  console.log(ok ? "\nTodos los cambios aplicados y verificados correctamente." : "\nREVISAR A MANO, algo no quedo como se esperaba.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
