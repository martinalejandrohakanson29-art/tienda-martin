// Envío NO se descarta en la rama "grupo esperando la moto" (2026-08-31)
// -------------------------------------------------------------------
// Caso real: conv 3078 (+5493758433040, Gabriel). Entró por plantilla del
// grupo "Combo 110 a 120 + Codo y carbu" + "Envian a misiones" pegado en la
// misma ráfaga. PUT 1 mandó el "Envian a misiones" a la máquina de
// sub-preguntas, `Dividir y Etiquetar` lo clasificó bien como `envio`, y
// `Parsear Sub-preguntas` (rama grupo esperando_moto, bienvenida fresca) lo
// DESCARTÓ (junto a precio/stock) asumiendo que "Envío gratis a todo el pais"
// de la bienvenida ya lo cubre.
//
// El cliente casi siempre pregunta algo puntual ("mandan a Misiones?",
// "llegan a mi pueblo?") y esa línea fija no lo contesta de verdad. Fix:
// `envio` deja de descartarse en esa rama — se responde SIEMPRE, con el mismo
// trato que `negocio` (kit_id null -> cae al fallback
// "Buscar Info Negocio (Envio General)" que ya maneja `Consolidar Dato
// Resuelto`). precio/stock siguen igual (silencio si la bienvenida es fresca:
// ahí el dato va completo y explícito).
//
// Solo toca 1 nodo (`Parsear Sub-preguntas`), 4 reemplazos de texto. Sin nodos
// nuevos, sin rewiring. `Consolidar Dato Resuelto` ya maneja `envio`,
// `Armar Mensajes` ya tiene `envio` en su mapa de prioridad.
//
// Uso:
//   node apply-envio-no-descarta-grupo-esperando-moto.mjs --dry
//   node apply-envio-no-descarta-grupo-esperando-moto.mjs
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.APIKEY_N8N || process.env.API_KEY_N8N || process.env.N8N_KEY;
if (!API_KEY) throw new Error("Falta APIKEY_N8N en el entorno");
const DRY = process.argv.includes("--dry");
const EXPECTED_VERSION = "4deb07fd-7ff4-45db-838c-0d80b93684a1"; // rollback target
const OUT_DIR = new URL("./", import.meta.url);

async function api(path, options = {}) {
  // cache-buster: el proxy delante de la API de n8n cachea el GET del workflow
  // por URL y llega a servir una versión de días atrás.
  const sep = path.includes("?") ? "&" : "?";
  const url = `${API_URL}${path}${options.method && options.method !== "GET" ? "" : `${sep}_cb=${Date.now()}-${Math.random()}`}`;
  const res = await fetch(url, {
    ...options,
    headers: { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json", "Cache-Control": "no-cache", ...(options.headers || {}) },
  });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) { console.error("ERROR", res.status, JSON.stringify(body, null, 2)); throw new Error(`API ${path} => ${res.status}`); }
  return body;
}
const rep = (s, a, b) => { if (!s.includes(a)) throw new Error(`ancla no encontrada: ${a.slice(0, 80)}`); if (s.split(a).length > 2) throw new Error(`ancla ambigua: ${a.slice(0, 80)}`); return s.split(a).join(b); };

async function getFresh() {
  for (let i = 0; i < 40; i++) {
    const wf = await api(`/workflows/${WORKFLOW_ID}`);
    if (wf.nodes.length >= 400) return wf;
    console.log(`  (GET devolvió ${wf.nodes.length} nodos — cache stale, reintento ${i + 1})`);
  }
  throw new Error("el GET siempre devolvió una versión vieja del workflow");
}

async function main() {
  const wf = await getFresh();
  console.log("workflow:", wf.name, "| nodos:", wf.nodes.length, "| versionId:", wf.versionId, "| updatedAt:", wf.updatedAt);
  if (wf.versionId !== EXPECTED_VERSION) {
    console.warn(`\n  AVISO: versionId ${wf.versionId} != esperado ${EXPECTED_VERSION}\n`);
    if (!DRY && !process.argv.includes("--force")) throw new Error("versionId no coincide (usar --force si es esperado)");
  }
  writeFileSync(new URL("./workflow_backup_pre-envio-no-descarta_2026-08-31.json", OUT_DIR), JSON.stringify(wf, null, 0));

  const N = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
  if (!N["Parsear Sub-preguntas"]) throw new Error('Falta el nodo "Parsear Sub-preguntas"');

  let j = N["Parsear Sub-preguntas"].parameters.jsCode;

  // 1. declarar hayEnvio
  j = rep(j,
    "  let hayReenvio = false, hayNegocio = false, hayOtro = false;",
    "  let hayReenvio = false, hayNegocio = false, hayEnvio = false, hayOtro = false;");

  // 2. sacar 'envio' del bloque precio/stock y darle su propia rama (= trato de 'negocio')
  j = rep(j,
    "    if (['precio', 'stock', 'envio'].includes(p.categoria)) {\n" +
    "      if (fresca) continue;                    // bienvenida recien mandada -> ya lo cubre (silencio)\n" +
    "      if (hayReenvio) continue;\n" +
    "      hayReenvio = true;\n" +
    "      out.push({ texto: p.texto, categoria: 'reenvio_bienvenida' }); // la bienvenida ya re-pregunta la moto\n" +
    "    } else if (p.categoria === 'negocio') {",
    "    if (p.categoria === 'envio') {\n" +
    "      // el cliente casi siempre pregunta algo puntual (\"mandan a Misiones?\", \"llegan a mi pueblo?\")\n" +
    "      // y la linea fija \"envio gratis a todo el pais\" de la bienvenida no lo contesta de verdad.\n" +
    "      // Se responde SIEMPRE (kit_id null -> fallback \"Buscar Info Negocio (Envio General)\" en\n" +
    "      // Consolidar Dato Resuelto). Mismo trato que 'negocio'.\n" +
    "      hayEnvio = true;\n" +
    "      out.push({ texto: p.texto, categoria: 'envio' });\n" +
    "    } else if (['precio', 'stock'].includes(p.categoria)) {\n" +
    "      if (fresca) continue;                    // bienvenida recien mandada -> ya lo cubre (silencio)\n" +
    "      if (hayReenvio) continue;\n" +
    "      hayReenvio = true;\n" +
    "      out.push({ texto: p.texto, categoria: 'reenvio_bienvenida' }); // la bienvenida ya re-pregunta la moto\n" +
    "    } else if (p.categoria === 'negocio') {");

  // 3. si contestamos envío, no rutear al extractor de modelo
  j = rep(j,
    "  const ruteoMoto = !fresca && hayOtro && !hayNegocio && !hayReenvio;",
    "  const ruteoMoto = !fresca && hayOtro && !hayNegocio && !hayEnvio && !hayReenvio;");

  // 4. envío (igual que negocio) re-pregunta la moto cuando la bienvenida no es fresca
  j = rep(j,
    "  if (!fresca && hayNegocio && !hayReenvio) {\n    out.push({ texto: '', categoria: 'repregunta_moto' });\n  }",
    "  if (!fresca && (hayNegocio || hayEnvio) && !hayReenvio) {\n    out.push({ texto: '', categoria: 'repregunta_moto' });\n  }");

  N["Parsear Sub-preguntas"].parameters.jsCode = j;

  const sk = ["saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder"];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => sk.includes(k)));
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  if (DRY) {
    writeFileSync(new URL("./workflow_envio-no-descarta_resultante_2026-08-31.json", OUT_DIR), JSON.stringify(wf, null, 2));
    console.log("\n[DRY] jsCode nuevo de Parsear Sub-preguntas:\n");
    console.log(j);
    return;
  }

  const raw = JSON.stringify(body);
  let ascii = ""; for (let i = 0; i < raw.length; i++) { const cc = raw.charCodeAt(i); ascii += cc > 0x7f ? "\\u" + cc.toString(16).padStart(4, "0") : raw[i]; }
  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: ascii });
  console.log("PUT ok. nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const f = await getFresh();
  const code = f.nodes.find((n) => n.name === "Parsear Sub-preguntas").parameters.jsCode;
  const checks = [
    ["declara hayEnvio", code.includes("hayEnvio = false, hayOtro")],
    ["rama envio propia", code.includes("if (p.categoria === 'envio') {\n      // el cliente")],
    ["precio/stock ya sin envio", code.includes("} else if (['precio', 'stock'].includes(p.categoria)) {")],
    ["ruteoMoto excluye envio", code.includes("!hayNegocio && !hayEnvio && !hayReenvio")],
    ["repregunta_moto por envio", code.includes("(hayNegocio || hayEnvio) && !hayReenvio")],
    ["sin residuo viejo", !code.includes("['precio', 'stock', 'envio'].includes(p.categoria)")],
  ];
  let ok = true;
  for (const [l, v] of checks) { console.log(v ? "  OK  " : "  FALLA", l); if (!v) ok = false; }
  console.log(ok ? "\nAplicado. Rollback: restore version " + EXPECTED_VERSION : "\nREVISAR. Rollback: restore version " + EXPECTED_VERSION);
}
main().catch((e) => { console.error(e); process.exit(1); });
