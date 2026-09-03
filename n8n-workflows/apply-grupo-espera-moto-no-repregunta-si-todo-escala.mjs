// Fix (2026-09-03) -- GRUPO ESPERANDO LA MOTO: el bot re-preguntaba la moto
// arriba de un escalado silencioso.
// ---------------------------------------------------------------------------
// Caso real conv 3263 (+5492645529968, "Luis"), ejecucion n8n 95380.
// Grupo "Tapa CDI 125 + Cilindro 120" pineado en estado `esperando_moto`
// (bienvenida NO fresca). El cliente escribio:
//   "Claro a mi no me sirve como se q no me estan estafando"
// `Dividir y Etiquetar Sub-preguntas` lo parte bien:
//   - "A mi no me sirve"               -> otro
//   - "Como se que no me estan estafando?" -> negocio
// Ninguna resuelve con datos -> las dos ESCALAN en nota privada (correcto).
// Pero `Parsear Sub-preguntas` (rama grupo esperando moto, PUT 1 / 2b) tiene:
//   if (!fresca && (hayNegocio || hayEnvio) && !hayReenvio)
//       out.push({ categoria: 'repregunta_moto' })
// -> se dispara por el SOLO HECHO de que exista un pedazo `negocio`, sin
// mirar si ese pedazo se contesto o se escalo. Resultado: el cliente dice
// "como se que no me estafan?" y el bot responde "para que moto lo estas
// buscando?". Desubicado. Es la recaida del principio ya fijado el 28/08
// ([[fix-bot-grupo-esperando-moto-consulta-ajena]]): la re-pregunta de la
// moto va SOLO cuando el negocio se resolvio.
//
// Fix (0 nodos nuevos, 1 edicion en `Armar Mensajes`): copia la red de
// seguridad que ya existe para el "cierre". Si el unico pedazo "resuelto" es
// la re-pregunta de la moto Y ademas hay algo sin resolver (toda la rafaga
// escala), se suprime la re-pregunta -> escalado en silencio, sin mensaje al
// cliente. La re-pregunta se sigue mandando cuando ademas contestamos algo
// real (ej. "mandan a Misiones?" -> respuesta de envio + "para que moto?").
//
// Uso:
//   node apply-grupo-espera-moto-no-repregunta-si-todo-escala.mjs --dry
//   node apply-grupo-espera-moto-no-repregunta-si-todo-escala.mjs
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.APIKEY_N8N || process.env.API_KEY_N8N || process.env.N8N_KEY;
if (!API_KEY) throw new Error("Falta APIKEY_N8N en el entorno");
const DRY = process.argv.includes("--dry");
const EXPECTED_VERSION = "46aac983-06db-49fd-a160-f97cde2d0ac1";
const OUT_DIR = new URL("./", import.meta.url);
const NODE = "Armar Mensajes";

async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, { ...options, headers: { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json", ...(options.headers || {}) } });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) { console.error("ERROR", res.status, JSON.stringify(body, null, 2)); throw new Error(`API ${path} => ${res.status}`); }
  return body;
}

const ANCHOR = `const candidatas = piezas.filter(
  (p) => p.resuelto && p.mensaje && !((haySinResolverReal || hayInformativasResueltas) && p.categoria === 'cierre')
);`;

const REPLACEMENT = `// 2026-09-03 (conv 3263): grupo esperando la moto -- si el UNICO pedazo "resuelto" es la
// re-pregunta de la moto y ademas hay algo sin resolver (toda la rafaga escala), NO
// mandamos la re-pregunta. Preguntar "para que moto?" arriba de un escalado silencioso
// (ej. cliente dijo "como se que no me estafan") es desubicado. La re-pregunta se manda
// solo si tambien contestamos algo real (envio/negocio/precio resuelto).
const hayOtraInfoResuelta = piezas.some(
  (p) => p.resuelto && p.mensaje && p.categoria !== 'cierre' && p.categoria !== 'repregunta_moto'
);
const suprimirRepreguntaMoto = haySinResolverReal && !hayOtraInfoResuelta;

const candidatas = piezas.filter(
  (p) => p.resuelto && p.mensaje
    && !((haySinResolverReal || hayInformativasResueltas) && p.categoria === 'cierre')
    && !(suprimirRepreguntaMoto && p.categoria === 'repregunta_moto')
);`;

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}?_cb=${Date.now()}-${Math.random()}`);
  console.log("workflow:", wf.name, "| nodos:", wf.nodes.length, "| versionId:", wf.versionId);
  if (wf.nodes.length < 400) throw new Error(`Solo ${wf.nodes.length} nodos -- el GET devolvio una version cacheada vieja, abortar`);
  if (wf.versionId !== EXPECTED_VERSION) { console.warn(`\n  AVISO: versionId ${wf.versionId} != esperado ${EXPECTED_VERSION}\n`); if (!DRY) throw new Error("versionId no coincide"); }
  writeFileSync(new URL("./workflow_backup_pre-grupo-espera-moto-no-repregunta_2026-09-03.json", OUT_DIR), JSON.stringify(wf, null, 0));

  const n = wf.nodes.find((x) => x.name === NODE);
  if (!n) throw new Error(`Falta el nodo "${NODE}"`);
  const code = n.parameters.jsCode;
  if (code.includes("suprimirRepreguntaMoto")) throw new Error("El fix ya parece aplicado (suprimirRepreguntaMoto presente)");
  if (!code.includes(ANCHOR)) throw new Error("No encontre el bloque `candidatas` esperado en Armar Mensajes -- abortar");
  n.parameters.jsCode = code.replace(ANCHOR, REPLACEMENT);

  const sk = ["saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder"];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => sk.includes(k)));
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  if (DRY) {
    writeFileSync(new URL("./workflow_grupo-espera-moto-no-repregunta_resultante_2026-09-03.json", OUT_DIR), JSON.stringify(wf, null, 2));
    console.log("\n[DRY] Armar Mensajes -- nuevo jsCode:\n");
    console.log(n.parameters.jsCode);
    return;
  }
  const raw = JSON.stringify(body);
  let ascii = ""; for (let i = 0; i < raw.length; i++) { const cc = raw.charCodeAt(i); ascii += cc > 0x7f ? "\\u" + cc.toString(16).padStart(4, "0") : raw[i]; }
  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: ascii });
  console.log("PUT ok. nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const f = await api(`/workflows/${WORKFLOW_ID}?_cb=${Date.now()}`);
  const fn = f.nodes.find((x) => x.name === NODE);
  const checks = [
    ["nodos == pre-fix", f.nodes.length === wf.nodes.length],
    ["define suprimirRepreguntaMoto", fn.parameters.jsCode.includes("const suprimirRepreguntaMoto = haySinResolverReal && !hayOtraInfoResuelta;")],
    ["candidatas filtra repregunta_moto", fn.parameters.jsCode.includes("!(suprimirRepreguntaMoto && p.categoria === 'repregunta_moto')")],
    ["sigue la red anti-cierre", fn.parameters.jsCode.includes("p.categoria === 'cierre'")],
  ];
  let ok = true;
  for (const [l, v] of checks) { console.log(v ? "  OK  " : "  FALLA", l); if (!v) ok = false; }
  console.log(ok ? "\nFix aplicado. Rollback: restore version " + EXPECTED_VERSION : "\nREVISAR. Rollback: restore version " + EXPECTED_VERSION);
}
main().catch((e) => { console.error(e); process.exit(1); });
