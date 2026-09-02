// Fix: el resto de la rafaga tras resolver la variante ya no re-escala la propia
// respuesta de variante (2026-09-02)
// ---------------------------------------------------------------------------
// Caso real conv 3223 (+5493516884434). El cliente venia en grupo 1 esperando
// corto/largo; mando pegados "Recorrido corto es" + "De que parte son ?".
// El bot resolvio la variante (mando la bienvenida del pack, $99.000) y contesto
// la direccion, pero ADEMAS escalo al equipo la nota "El cliente pregunto algo
// que todavia no supimos ubicar: 'Recorrido corto es'" -- la misma frase que
// acababa de usar para resolver. Ejecucion n8n #94390.
//
// Causa: al entrar a la maquina de sub-preguntas por el camino de "resto tras
// variante", `Preparar Contexto Sub-preguntas` arma `texto_para_dividir` con
// `Clasificar Mensaje.resto_mensaje || Unir Mensajes.texto_completo`. El primero
// viene vacio en este camino -> agarra el TEXTO COMPLETO, re-incluyendo
// "Recorrido corto es", que cae en "otro", no se resuelve y se escala.
//
// Cambios (0 nodos nuevos, 0 rewiring, 2 ediciones de jsCode):
//  1. `Preparar Contexto Sub-preguntas`: si la variante se acaba de resolver
//     en esta corrida (`Marcar Pack Final Pineado` existe), usar
//     `Unir Mensajes.resto_mensaje` como texto a dividir (lo que realmente sobro).
//  2. `Parsear Sub-preguntas` (rama NO grupo): red de seguridad -- si el pack se
//     acaba de confirmar (`kitRecienConfirmado`) y queda un pedazo corto que solo
//     nombra corto/largo y no es pregunta, se descarta (para el caso raro de que
//     el cliente mande la variante como 2do mensaje y no como 1ro).
//
// Uso: node apply-fix-resto-variante-no-reescala-la-variante.mjs [--dry]
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta APIKEY_N8N");
const DRY = process.argv.includes("--dry");
const OUT_DIR = new URL("./", import.meta.url);

async function api(path, options = {}) {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${API_URL}${path}${!options.method || options.method === "GET" ? `${sep}_cb=${Date.now()}-${Math.random()}` : ""}`;
  const res = await fetch(url, { ...options, headers: { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json", "Cache-Control": "no-cache", ...(options.headers || {}) } });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) { console.error("ERROR", res.status, body); throw new Error(`API ${path} => ${res.status}`); }
  return body;
}
async function getFresh(min) {
  for (let i = 0; i < 40; i++) { const wf = await api(`/workflows/${WORKFLOW_ID}`); if (wf.nodes.length >= min) return wf; console.log(`  cache stale (${wf.nodes.length}), reintento ${i + 1}`); }
  throw new Error("GET siempre devolvio version vieja");
}
const rep = (s, a, b) => { if (!s.includes(a)) throw new Error(`ancla no encontrada:\n${a}`); if (s.split(a).length > 2) throw new Error(`ancla ambigua: ${a}`); return s.split(a).join(b); };
const node = (wf, name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`Falta nodo "${name}"`); return n; };

async function main() {
  const wf = await getFresh(459);
  console.log("workflow:", wf.name, "| nodos:", wf.nodes.length, "| versionId:", wf.versionId);
  writeFileSync(new URL("./workflow_backup_pre-fix-resto-variante-no-reescala_2026-09-02.json", OUT_DIR), JSON.stringify(wf, null, 0));
  const ROLLBACK = wf.versionId;

  // 1. Preparar Contexto Sub-preguntas: camino "resto tras variante" -> resto_mensaje
  const ctx = node(wf, "Preparar Contexto Sub-preguntas");
  ctx.parameters.jsCode = rep(ctx.parameters.jsCode,
    "if (textoParaDividir === null) {\n  textoParaDividir = $('Clasificar Mensaje (sin IA)').item.json.resto_mensaje || $('Unir Mensajes').item.json.texto_completo;\n}",
    "if (textoParaDividir === null) {\n" +
    "  // 2026-09-02 (conv 3223): si la variante se acaba de resolver en esta corrida, el\n" +
    "  // texto que sobra es solo lo que vino pegado DESPUES de la respuesta de variante --\n" +
    "  // no el texto completo (que re-incluiria 'Recorrido corto es' y lo escalaria).\n" +
    "  try {\n" +
    "    $('Marcar Pack Final Pineado').item;\n" +
    "    textoParaDividir = $('Unir Mensajes').item.json.resto_mensaje || '';\n" +
    "  } catch (e) {}\n" +
    "}\n" +
    "if (textoParaDividir === null) {\n" +
    "  textoParaDividir = $('Clasificar Mensaje (sin IA)').item.json.resto_mensaje || $('Unir Mensajes').item.json.texto_completo;\n" +
    "}");

  // 2. Parsear Sub-preguntas (rama NO grupo): red de seguridad corto/largo tras confirmar pack
  const psp = node(wf, "Parsear Sub-preguntas");
  psp.parameters.jsCode = rep(psp.parameters.jsCode,
    "  .filter((p) => p.texto.length > 0)\n  .filter((p) => !(p.categoria === 'precio' && kitRecienConfirmado))",
    "  .filter((p) => p.texto.length > 0)\n" +
    "  .filter((p) => !(p.categoria === 'precio' && kitRecienConfirmado))\n" +
    "  // 2026-09-02 (conv 3223): si el pack se acaba de confirmar y queda un pedazo corto\n" +
    "  // que solo nombra corto/largo y no es pregunta, es la propia respuesta de variante\n" +
    "  // que se colo -> se descarta (no se escala).\n" +
    "  .filter((p) => !(kitRecienConfirmado && p.categoria === 'otro'\n" +
    "    && p.texto.trim().split(/\\s+/).length <= 4\n" +
    "    && /\\b(corto|corta|largo|larga)\\b/i.test(p.texto)\n" +
    "    && !/\\?/.test(p.texto)))");

  console.log("\n--- Preparar Contexto Sub-preguntas (fragmento) ---");
  console.log(ctx.parameters.jsCode.split("let cierreRecienteRaw")[0].slice(-700));
  console.log("\n--- Parsear Sub-preguntas (fragmento) ---");
  console.log(psp.parameters.jsCode.split("const limpio = partes")[1].split("return [{ json: { partes: limpio")[0]);
  if (DRY) { console.log("\n[DRY] rollback:", ROLLBACK); return; }

  const sk = ["saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder"];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => sk.includes(k)));
  const raw = JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings });
  let ascii = ""; for (let i = 0; i < raw.length; i++) { const cc = raw.charCodeAt(i); ascii += cc > 0x7f ? "\\u" + cc.toString(16).padStart(4, "0") : raw[i]; }
  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: ascii });
  console.log("PUT ok. nodos:", updated.nodes.length);

  const f = await getFresh(459);
  const ok1 = node(f, "Preparar Contexto Sub-preguntas").parameters.jsCode.includes("Marcar Pack Final Pineado').item;\n    textoParaDividir = $('Unir Mensajes').item.json.resto_mensaje");
  const ok2 = node(f, "Parsear Sub-preguntas").parameters.jsCode.includes("es la propia respuesta de variante");
  console.log((ok1 && ok2) ? "  OK  aplicado. Rollback: " + ROLLBACK : `  FALLA 1=${ok1} 2=${ok2}. Rollback: ` + ROLLBACK);
}
main().catch((e) => { console.error(e); process.exit(1); });
