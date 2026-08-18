// Segunda parte del fix "confirmación antes de tiempo" (ver
// apply-fix-confirmacion-antes-de-tiempo.mjs y la entrada del mismo nombre
// en CHATWOOT-BOT-CONTEXTO.md): ese fix solo frenaba la confirmación cuando
// NO habia ningun dato de la moto (compatible === null). Pero cuando la
// compatibilidad se resuelve como NO compatible (compatible === false), la
// confirmacion ("te conviene el kit X, ¿no?") igual se mandaba -- quedaba
// contradictoria con la respuesta real ("No, el kit no es compatible con tu
// [moto]") que sale por el mismo camino.
//
// Decidido con Martin: tambien frenar la confirmacion cuando se confirma
// que NO es compatible (no solo cuando no hay dato). Y reformular el
// mensaje de "no compatible" para dejar claro que es ESE kit puntual el que
// no anda -- el bot nunca revisa el resto del catalogo, asi que no puede
// prometer "no tenemos nada para tu moto" sin arriesgarse a estar mintiendo
// (podria haber otro kit que si ande y nadie lo reviso).
//
// Cambio 1: nodo nuevo "¿Es Realmente Compatible?" (IF, compatible === true)
// insertado ENTRE los dos puntos que hoy alimentan "Chequear Confirmacion
// Pendiente" directo (`¿Hay Dato de Compatibilidad?` salida TRUE y
// `¿Detalle Resuelve Compatibilidad?` salida TRUE -- ambas disparan cuando
// HAY un valor, sea true o false) y el nodo de confirmacion. Solo la salida
// TRUE de este nuevo gate (compatible de verdad, no solo "resuelto") sigue
// a "Chequear Confirmacion Pendiente". La salida FALSE (confirmado
// incompatible) no confirma nada -- termina en un Fin nuevo, mientras
// "Preparar Respuesta Compatibilidad" (que no se toca) sigue mandando la
// respuesta real sin cambios de camino.
//
// Cambio 2: "Preparar Respuesta Compatibilidad" cambia el texto de la rama
// "no compatible" de "No, el kit no es compatible con tu X" a "No, este
// kit no es compatible con tu X. Cualquier otra consulta nos escribís." --
// dejando claro que es este kit puntual (no "no tenemos nada") y sin cerrar
// la puerta a que sigan preguntando.
//
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";
import { randomUUID } from "crypto";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-no-confirmar-si-incompatible_2026-08-18.json", import.meta.url);

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

const OLD_RESPUESTA_EXPR =
  "={{ ($json.compatible ? ('Sí, el kit es compatible con tu ' + $('Parsear Pregunta Compatibilidad').item.json.modelo_moto) : ('No, el kit no es compatible con tu ' + $('Parsear Pregunta Compatibilidad').item.json.modelo_moto)) + ($json.detalle ? (', ' + $json.detalle) : '') + '.' }}";

const NEW_RESPUESTA_EXPR =
  "={{ ($json.compatible ? ('Sí, el kit es compatible con tu ' + $('Parsear Pregunta Compatibilidad').item.json.modelo_moto) : ('No, este kit no es compatible con tu ' + $('Parsear Pregunta Compatibilidad').item.json.modelo_moto)) + ($json.detalle ? (', ' + $json.detalle) : '') + ($json.compatible ? '.' : '. Cualquier otra consulta nos escribís.') }}";

function newNode({ name, type, typeVersion, position, parameters }) {
  return { id: randomUUID(), name, type, typeVersion, position, parameters };
}

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const byName = (n) => wf.nodes.find((x) => x.name === n);

  // --- Cambio 2: reformular el mensaje de "no compatible" ---
  const preparar = byName("Preparar Respuesta Compatibilidad");
  if (!preparar) throw new Error('No se encontro "Preparar Respuesta Compatibilidad"');
  const asig = preparar.parameters.assignments.assignments.find((a) => a.name === "content");
  if (!asig || asig.value !== OLD_RESPUESTA_EXPR) {
    throw new Error('La expresion de "Preparar Respuesta Compatibilidad" no coincide con lo esperado -- revisar a mano.');
  }
  asig.value = NEW_RESPUESTA_EXPR;
  console.log('Texto de "Preparar Respuesta Compatibilidad" actualizado (rama "no compatible").');

  // --- Cambio 1: no confirmar el kit si se confirma incompatible ---
  const anchor = byName("Chequear Confirmacion Pendiente");
  if (!anchor) throw new Error('No se encontro "Chequear Confirmacion Pendiente"');
  const [ax, ay] = anchor.position;

  const esRealmenteCompatible = newNode({
    name: "¿Es Realmente Compatible?",
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [ax - 250, ay - 250],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
        conditions: [
          {
            id: randomUUID(),
            leftValue: "={{ $json.compatible }}",
            rightValue: true,
            operator: { type: "boolean", operation: "equals" },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
  });

  const finNoCompatible = newNode({
    name: "Fin - Incompatible, No Confirma Kit",
    type: "n8n-nodes-base.noOp",
    typeVersion: 1,
    position: [ax - 250, ay - 50],
    parameters: {},
  });

  wf.nodes.push(esRealmenteCompatible, finNoCompatible);
  console.log('Nodos nuevos agregados: "¿Es Realmente Compatible?", "Fin - Incompatible, No Confirma Kit".');

  const conn = wf.connections;

  function removeTarget(nodeName, outputIndex, targetName) {
    const c = conn[nodeName];
    if (!c || !c.main[outputIndex]) throw new Error(`No hay salida ${outputIndex} en "${nodeName}"`);
    const antes = c.main[outputIndex].length;
    c.main[outputIndex] = c.main[outputIndex].filter((x) => x.node !== targetName);
    if (c.main[outputIndex].length !== antes - 1) {
      throw new Error(`No se encontro (o se encontro mas de una vez) "${nodeName}" -> "${targetName}" en la salida ${outputIndex}.`);
    }
  }
  function addTarget(nodeName, outputIndex, targetName) {
    const c = conn[nodeName];
    if (!c || !c.main[outputIndex]) throw new Error(`No hay salida ${outputIndex} en "${nodeName}"`);
    c.main[outputIndex].push({ node: targetName, type: "main", index: 0 });
  }

  // sacar el envio directo a "Chequear Confirmacion Pendiente" desde los dos
  // puntos que solo sabian "hay dato" (true o false), no "es compatible"
  removeTarget("¿Hay Dato de Compatibilidad?", 0, "Chequear Confirmacion Pendiente");
  removeTarget("¿Detalle Resuelve Compatibilidad?", 0, "Chequear Confirmacion Pendiente");

  // redirigir ambos al gate nuevo (que sí distingue compatible true/false)
  addTarget("¿Hay Dato de Compatibilidad?", 0, "¿Es Realmente Compatible?");
  addTarget("¿Detalle Resuelve Compatibilidad?", 0, "¿Es Realmente Compatible?");
  console.log('"¿Hay Dato de Compatibilidad?" y "¿Detalle Resuelve Compatibilidad?" ahora pasan por "¿Es Realmente Compatible?" antes de confirmar.');

  conn["¿Es Realmente Compatible?"] = {
    main: [
      [{ node: "Chequear Confirmacion Pendiente", type: "main", index: 0 }],
      [{ node: "Fin - Incompatible, No Confirma Kit", type: "main", index: 0 }],
    ],
  };
  console.log('Wiring nuevo: ¿Es Realmente Compatible? -> Chequear Confirmacion Pendiente (sí) / Fin (no).');

  const allowedSettingsKeys = [
    "saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
    "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder",
  ];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => allowedSettingsKeys.includes(k)));

  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: JSON.stringify(body) });
  console.log("Actualizado. Nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const fresh = await api(`/workflows/${WORKFLOW_ID}`);
  const freshPreparar = fresh.nodes.find((n) => n.name === "Preparar Respuesta Compatibilidad");
  const freshAsig = freshPreparar?.parameters.assignments.assignments.find((a) => a.name === "content");
  const checks = [
    fresh.nodes.some((n) => n.name === "¿Es Realmente Compatible?"),
    fresh.nodes.some((n) => n.name === "Fin - Incompatible, No Confirma Kit"),
    freshAsig?.value === NEW_RESPUESTA_EXPR,
    !fresh.connections["¿Hay Dato de Compatibilidad?"].main[0].some((c) => c.node === "Chequear Confirmacion Pendiente"),
    !fresh.connections["¿Detalle Resuelve Compatibilidad?"].main[0].some((c) => c.node === "Chequear Confirmacion Pendiente"),
    fresh.connections["¿Hay Dato de Compatibilidad?"].main[0].some((c) => c.node === "¿Es Realmente Compatible?"),
    fresh.connections["¿Detalle Resuelve Compatibilidad?"].main[0].some((c) => c.node === "¿Es Realmente Compatible?"),
    fresh.connections["¿Es Realmente Compatible?"].main[0].some((c) => c.node === "Chequear Confirmacion Pendiente"),
    fresh.connections["¿Es Realmente Compatible?"].main[1].some((c) => c.node === "Fin - Incompatible, No Confirma Kit"),
  ];
  const ok = checks.every(Boolean);
  console.log("Verificacion:", checks);
  console.log(ok ? "Fix aplicado correctamente." : "REVISAR A MANO, algo no quedo como se esperaba.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
