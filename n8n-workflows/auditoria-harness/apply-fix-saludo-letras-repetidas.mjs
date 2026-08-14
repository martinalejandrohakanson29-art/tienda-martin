// Fix: el cliente +5493515334045 escribio "Holaa" (con una "a" de mas, tipico
// al escribir informal por WhatsApp) y el bot no respondio NADA -- ni un
// mensaje, ni escalado al equipo (ejecucion 74490, 2026-08-14 00:28 conv 1936).
//
// Causa: en "Clasificar Mensaje (sin IA)", la regla de "saludo sin pedido
// especifico" exige que, tras sacar stopwords de relleno (hola, buenas,
// gracias, etc.), no quede ningun token de "contenido". El set de stopwords
// tiene "hola" pero no variantes con letras repetidas ("holaa", "holaaa",
// "buenass", "graciaas"), asi que esas variantes sobreviven como si fueran
// palabras de contenido real, la regla de saludo falla, y el mensaje cae a
// tipo "sin_match". Desde ahi entra al pipeline de IA que separa
// sub-preguntas: la IA (correctamente) no encuentra ninguna pregunta en un
// simple saludo -> partes: []. El nodo "Separar Pedazos" (Split Out) recibe 0
// items y TODO lo que sigue -- incluido el camino de escalado al equipo, que
// depende de que llegue al menos 1 pieza sin resolver -- nunca se ejecuta.
// El cliente queda en silencio total.
//
// Fix: la funcion tokens() (usada SOLO para este chequeo de saludo, no para
// el matching de plantilla exacta de kits) ahora colapsa letras repetidas
// consecutivas antes de comparar contra STOPWORDS, asi "holaa" -> "hola" y
// cae en la lista de relleno como corresponde.
//
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-saludo-letras-repetidas_2026-08-14.json", import.meta.url);

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

const NODE_NAME = "Clasificar Mensaje (sin IA)";

const OLD_SNIPPET = `function tokens(txt) {
  const plano = normalizar(txt).replace(/[^a-z0-9]+/g, ' ');
  const vistos = new Set();
  for (const t of plano.split(' ')) {
    if (t.length < 3 || STOPWORDS.has(t)) continue;
    vistos.add(t.replace(/s$/, ''));
  }
  return [...vistos];
}`;

const NEW_SNIPPET = `function tokens(txt) {
  const plano = normalizar(txt).replace(/[^a-z0-9]+/g, ' ');
  const vistos = new Set();
  for (const t of plano.split(' ')) {
    // colapsa letras repetidas (holaa -> hola, graciaas -> gracias) para que
    // el saludo escrito informal no quede como si fuera palabra de contenido
    const base = t.replace(/(.)\\1+/g, '$1');
    if (base.length < 3 || STOPWORDS.has(base)) continue;
    vistos.add(base.replace(/s$/, ''));
  }
  return [...vistos];
}`;

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const node = wf.nodes.find((n) => n.name === NODE_NAME);
  if (!node) throw new Error(`No se encontro el nodo "${NODE_NAME}"`);
  const code = node.parameters.jsCode || "";
  if (!code.includes(OLD_SNIPPET)) {
    throw new Error(`El jsCode de "${NODE_NAME}" no contiene el snippet esperado -- puede que ya se haya tocado. Revisar a mano antes de seguir.`);
  }
  node.parameters.jsCode = code.replace(OLD_SNIPPET, NEW_SNIPPET);
  console.log(`jsCode de "${NODE_NAME}" actualizado.`);

  const allowedSettingsKeys = [
    "saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
    "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder",
  ];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => allowedSettingsKeys.includes(k)));

  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: JSON.stringify(body) });
  console.log("Actualizado. Nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const fresh = await api(`/workflows/${WORKFLOW_ID}`);
  const freshNode = fresh.nodes.find((n) => n.name === NODE_NAME);
  const freshCode = freshNode?.parameters.jsCode || "";
  const ok = freshCode.includes(NEW_SNIPPET) && !freshCode.includes(OLD_SNIPPET);
  console.log(`Verificacion "${NODE_NAME}":`, ok ? "OK" : "ALGO NO CUADRA");
  console.log(ok ? "Fix aplicado correctamente." : "REVISAR A MANO, algo no quedo como se esperaba.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
