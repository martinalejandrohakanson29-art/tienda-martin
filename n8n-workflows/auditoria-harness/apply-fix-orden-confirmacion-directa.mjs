// Fix de orden: encontrado auditando en vivo la conv 2129 (+5493549539614, contacto Agus Lb),
// mensaje real: "Hola bueno dia amigo una pregunta que sale el kit ese 120 con tapa cdi" -- nombra
// el kit Y pregunta precio en el mismo mensaje, sin plantilla exacta ni kit pineado de antes.
//
// "Identificar Necesidad" (feat del 17/8) lo resuelve como kit_confiado (Kit 8) y arma su propia
// confirmacion corta SIN precio ("Dale, el combo de tapa CDI + cilindro 120 con la corona de
// regalo, no?") -- a proposito, para no repetir el precio (ver nota en
// CHATWOOT-BOT-CONTEXTO.md). En paralelo, el partidor de sub-preguntas (Fase 6) categoriza la
// pregunta como "precio" y redacta la respuesta real ("...sale $175.000 en recorrido corto...").
// Las dos ramas corren en PARALELO desde "Es Compatibilidad Con Modelo?" (false, no nombra un
// modelo puntual) -- "Chequear Confirmacion Pendiente" y "Preparar Contexto Sub-preguntas" son
// hermanas, sin orden garantizado. En la ejecucion real, el precio salio ANTES que la
// confirmacion del kit -- el cliente vio primero un precio sin contexto y recien despues se
// entero de que kit se estaba hablando.
//
// Mismo patron de bug que "precio redundante y orden" (14/8), pero la Identificar Necesidad (17/8)
// nunca heredo la proteccion de orden que sí tiene el camino de plantilla exacta (alli "Enviar
// Saludo Kit" corre obligatoriamente antes de "Marcar Kit Pineado").
//
// Por que NO se reusa el "Chequear Confirmacion Pendiente" / "Debe Confirmar Kit?" / "Enviar
// Confirmacion Kit (Propuesta)" existentes para forzar el orden: esos 3 nodos son un tronco
// COMPARTIDO por otros dos orígenes ("Compatibilidad Sin Marca/Modelo?" -- cilindrada sola -- y
// "Es Realmente Compatible?" -- compatibilidad ya resuelta). Si se encadenara "Preparar Contexto
// Sub-preguntas" a la salida de ese tronco compartido, se dispararia una SEGUNDA vez en el camino
// de "Es Realmente Compatible?" (que YA dispara "Preparar Contexto Sub-preguntas" aparte, via
// "Hay Resto Adicional en la Rafaga?", para el resto de la rafaga) -- duplicando la respuesta.
// Por eso se clona un tronco chico y privado, usado SOLO por esta rama especifica (sin modelo,
// pregunta directa), dejando el tronco compartido original intacto para las otras dos ramas.
//
// Fix: "Es Compatibilidad Con Modelo?" (false) ahora pasa PRIMERO por un chequeo/envio de
// confirmacion privado y despues recien sigue a "Preparar Contexto Sub-preguntas" -- en las dos
// salidas (se confirmo o no hacia falta confirmar). Garantiza que si hay que confirmar el kit,
// esa confirmacion siempre sale antes que cualquier respuesta de sub-pregunta.
//
// Pendiente relacionado, no resuelto en este fix (documentado en CHATWOOT-BOT-CONTEXTO.md): la
// rama "Compatibilidad Sin Marca/Modelo?" (cilindrada sola) tiene la misma carrera de 3 vias
// (repregunta de modelo + resto de la rafaga + confirmacion de kit) -- no reproducida todavia en
// una conversacion real, se deja para cuando aparezca un caso concreto.
//
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";
import { randomUUID } from "crypto";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-orden-confirmacion-directa_2026-08-18.json", import.meta.url);

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

const N_CHEQUEO = "Chequear Confirmacion Antes de Sub-pregunta";
const N_IF = "¿Debe Confirmar Antes de Sub-pregunta?";
const N_ENVIAR = "Enviar Confirmacion Antes de Sub-pregunta";

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const nodeByName = (name) => {
    const n = wf.nodes.find((x) => x.name === name);
    if (!n) throw new Error(`No se encontro el nodo "${name}"`);
    return n;
  };

  // Verificar forma esperada de la rama false de "¿Es Compatibilidad Con Modelo?" antes de tocar.
  const esCompatConModelo = wf.connections["¿Es Compatibilidad Con Modelo?"];
  if (!esCompatConModelo) throw new Error('No se encontro la conexion de "¿Es Compatibilidad Con Modelo?"');
  const falseBranch = esCompatConModelo.main?.[1] || [];
  const falseTargets = falseBranch.map((c) => c.node).sort();
  const esperado = ["Chequear Confirmacion Pendiente", "Preparar Contexto Sub-preguntas"].sort();
  if (JSON.stringify(falseTargets) !== JSON.stringify(esperado)) {
    throw new Error('La rama false de "¿Es Compatibilidad Con Modelo?" no tiene la forma esperada -- puede que ya se haya tocado. Revisar a mano.');
  }

  // Clonar los 3 nodos del tronco compartido de confirmacion, como tronco PRIVADO de esta rama.
  const original = {
    chequeo: nodeByName("Chequear Confirmacion Pendiente"),
    iff: nodeByName("¿Debe Confirmar Kit?"),
    enviar: nodeByName("Enviar Confirmacion Kit (Propuesta)"),
  };

  const nuevoChequeo = {
    id: randomUUID(),
    name: N_CHEQUEO,
    type: original.chequeo.type,
    typeVersion: original.chequeo.typeVersion,
    position: [6100, 360],
    parameters: JSON.parse(JSON.stringify(original.chequeo.parameters)),
  };
  const nuevoIf = {
    id: randomUUID(),
    name: N_IF,
    type: original.iff.type,
    typeVersion: original.iff.typeVersion,
    position: [6400, 360],
    parameters: JSON.parse(JSON.stringify(original.iff.parameters)),
  };
  const nuevoEnviar = {
    id: randomUUID(),
    name: N_ENVIAR,
    type: original.enviar.type,
    typeVersion: original.enviar.typeVersion,
    position: [6700, 360],
    parameters: JSON.parse(JSON.stringify(original.enviar.parameters)),
  };

  wf.nodes.push(nuevoChequeo, nuevoIf, nuevoEnviar);

  // Rewire: "¿Es Compatibilidad Con Modelo?" false -> SOLO el chequeo privado (ya no en paralelo).
  esCompatConModelo.main[1] = [{ node: N_CHEQUEO, type: "main", index: 0 }];

  wf.connections[N_CHEQUEO] = { main: [[{ node: N_IF, type: "main", index: 0 }]] };
  wf.connections[N_IF] = {
    main: [
      [{ node: N_ENVIAR, type: "main", index: 0 }],
      [{ node: "Preparar Contexto Sub-preguntas", type: "main", index: 0 }],
    ],
  };
  wf.connections[N_ENVIAR] = { main: [[{ node: "Preparar Contexto Sub-preguntas", type: "main", index: 0 }]] };

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
    [N_CHEQUEO, (n) => JSON.stringify(n.parameters) === JSON.stringify(original.chequeo.parameters)],
    [N_IF, (n) => JSON.stringify(n.parameters) === JSON.stringify(original.iff.parameters)],
    [N_ENVIAR, (n) => JSON.stringify(n.parameters) === JSON.stringify(original.enviar.parameters)],
  ];
  let ok = true;
  for (const [name, check] of checks) {
    const n = fresh.nodes.find((x) => x.name === name);
    const nodeOk = !!n && check(n);
    console.log(`Verificacion nodo "${name}":`, nodeOk ? "OK" : "ALGO NO CUADRA");
    ok = ok && nodeOk;
  }
  const rewireOk1 = JSON.stringify((fresh.connections["¿Es Compatibilidad Con Modelo?"].main[1] || []).map((c) => c.node)) === JSON.stringify([N_CHEQUEO]);
  const rewireOk2 = JSON.stringify((fresh.connections[N_CHEQUEO].main[0] || []).map((c) => c.node)) === JSON.stringify([N_IF]);
  const rewireOk3 = JSON.stringify((fresh.connections[N_IF].main[0] || []).map((c) => c.node)) === JSON.stringify([N_ENVIAR]) &&
    JSON.stringify((fresh.connections[N_IF].main[1] || []).map((c) => c.node)) === JSON.stringify(["Preparar Contexto Sub-preguntas"]);
  const rewireOk4 = JSON.stringify((fresh.connections[N_ENVIAR].main[0] || []).map((c) => c.node)) === JSON.stringify(["Preparar Contexto Sub-preguntas"]);
  // Verificar que el tronco compartido original sigue intacto (branches B y C sin tocar).
  const compatSinMarca = fresh.connections["¿Compatibilidad Sin Marca/Modelo?"];
  const rewireOk5 = (compatSinMarca.main[0] || []).some((c) => c.node === "Chequear Confirmacion Pendiente");
  const esRealCompat = fresh.connections["¿Es Realmente Compatible?"];
  const rewireOk6 = (esRealCompat.main[0] || []).some((c) => c.node === "Chequear Confirmacion Pendiente");
  console.log("Rewire (Es Compatibilidad Con Modelo false -> solo chequeo privado):", rewireOk1 ? "OK" : "ALGO NO CUADRA");
  console.log("Rewire (chequeo privado -> if privado):", rewireOk2 ? "OK" : "ALGO NO CUADRA");
  console.log("Rewire (if privado -> enviar / sub-preguntas):", rewireOk3 ? "OK" : "ALGO NO CUADRA");
  console.log("Rewire (enviar privado -> sub-preguntas):", rewireOk4 ? "OK" : "ALGO NO CUADRA");
  console.log("Tronco compartido intacto (rama B sigue usando el original):", rewireOk5 ? "OK" : "ALGO NO CUADRA");
  console.log("Tronco compartido intacto (rama C sigue usando el original):", rewireOk6 ? "OK" : "ALGO NO CUADRA");
  console.log((ok && rewireOk1 && rewireOk2 && rewireOk3 && rewireOk4 && rewireOk5 && rewireOk6) ? "Fix aplicado correctamente." : "REVISAR A MANO.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
