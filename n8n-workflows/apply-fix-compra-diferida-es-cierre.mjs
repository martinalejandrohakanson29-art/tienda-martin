// Fix (2026-08-31) -- "junto plata y compro" (compra a futuro) ya no escala.
// -------------------------------------------------------------------------
// Caso real: conv 3033 (+5493854560850). Tras confirmar compatibilidad y precio
// del combo Tapa CDI + Cilindro 120, el cliente dijo "junto plata y compro".
// El prompt de `Dividir y Etiquetar Sub-preguntas` mete "cualquier cosa sobre
// pagar/reservar/retirar" en "otro" -> sin dato -> escaló con la nota engañosa
// "preguntó algo que todavía no supimos ubicar" (no preguntó nada; avisó que va
// a comprar más adelante).
//
// Fix (2 ediciones de texto, sin nodos nuevos):
//  1. `Dividir y Etiquetar Sub-preguntas` (systemMessage): se parte la regla de
//     pago/reserva/retiro. Intención INMEDIATA o que pide acción/dato ahora
//     ("te hago la transferencia", "pasame el cbu", "quiero reservarlo") sigue
//     como "otro" (escala). Aviso de compra DIFERIDA sin pedir nada
//     ("junto plata y compro", "cuando cobre lo compro") pasa a "cierre".
//  2. `Consolidar Dato Resuelto`: el texto fijo de "cierre" pasa de
//     "Dale, cualquier cosa nos escribís." a
//     "dale bro! cualquier cosa nos escribis y coordinamos.." (pedido de Martín;
//     aplica a TODOS los cierres). El anti-bucle ya existente
//     (`cierre_reciente:{tel}`, TTL 24h) evita que un "dale ok" posterior
//     dispare otra respuesta.
//
// Uso:
//   node apply-fix-compra-diferida-es-cierre.mjs --dry
//   node apply-fix-compra-diferida-es-cierre.mjs
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.APIKEY_N8N || process.env.API_KEY_N8N || process.env.N8N_KEY;
if (!API_KEY) throw new Error("Falta APIKEY_N8N en el entorno");
const DRY = process.argv.includes("--dry");
const EXPECTED_VERSION = "210b06ef-56c8-4fe2-a408-10a018d77039"; // rollback target
const OUT_DIR = new URL("./", import.meta.url);

async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, { ...options, headers: { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json", ...(options.headers || {}) } });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) { console.error("ERROR", res.status, JSON.stringify(body, null, 2)); throw new Error(`API ${path} => ${res.status}`); }
  return body;
}
const rep = (s, a, b) => { if (!s.includes(a)) throw new Error(`ancla no encontrada: ${a.slice(0, 80)}`); return s.split(a).join(b); };

const OLD_SYS =
  '(2) si el comentario expresa una intención que sí necesita una respuesta o acción nuestra ' +
  '(ej. "te dejo una seña", "quiero reservarlo", "paso a buscarlo mañana", cualquier cosa sobre pagar/reservar/retirar) -- eso va como "otro".';
const NEW_SYS =
  '(2) si el comentario expresa una intención de pago/reserva/retiro INMEDIATA, o que nos pide una acción o un dato ahora ' +
  '(ej. "te dejo una seña", "quiero reservarlo", "paso a buscarlo mañana", "te hago la transferencia", "pasame el cbu o alias") -- eso va como "otro". ' +
  'PERO si el cliente SOLAMENTE avisa que va a comprar MÁS ADELANTE / cuando pueda / cuando junte la plata, sin pedirnos nada ahora ' +
  '(ej. "junto plata y compro", "cuando cobre lo compro", "la semana que viene lo llevo", "apenas pueda lo saco") -- eso SÍ va como "cierre": ' +
  'no hay ningún dato para dar ni nada para escalar, el cliente solo está avisando.';

const OLD_CIERRE = "dato = 'Dale, cualquier cosa nos escribís.';";
const NEW_CIERRE = "dato = 'dale bro! cualquier cosa nos escribis y coordinamos..';";

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  console.log("workflow:", wf.name, "| nodos:", wf.nodes.length, "| versionId:", wf.versionId);
  if (wf.versionId !== EXPECTED_VERSION) { console.warn(`\n  AVISO: versionId ${wf.versionId} != esperado ${EXPECTED_VERSION}\n`); if (!DRY) throw new Error("versionId no coincide"); }
  writeFileSync(new URL("./workflow_backup_pre-compra-diferida_2026-08-31.json", OUT_DIR), JSON.stringify(wf, null, 0));

  const N = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
  for (const n of ["Dividir y Etiquetar Sub-preguntas", "Consolidar Dato Resuelto"]) if (!N[n]) throw new Error(`Falta el nodo "${n}"`);

  // ---- 1. prompt split sub-preguntas ----
  {
    const p = N["Dividir y Etiquetar Sub-preguntas"];
    p.parameters.options.systemMessage = rep(p.parameters.options.systemMessage, OLD_SYS, NEW_SYS);
  }
  // ---- 2. texto fijo de cierre ----
  {
    const p = N["Consolidar Dato Resuelto"];
    p.parameters.jsCode = rep(p.parameters.jsCode, OLD_CIERRE, NEW_CIERRE);
  }

  const sk = ["saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder"];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => sk.includes(k)));
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  if (DRY) {
    writeFileSync(new URL("./workflow_compra-diferida_resultante_2026-08-31.json", OUT_DIR), JSON.stringify(wf, null, 2));
    console.log("\n[DRY] cambios preparados, sin PUT.");
    return;
  }
  const raw = JSON.stringify(body);
  let ascii = ""; for (let i = 0; i < raw.length; i++) { const cc = raw.charCodeAt(i); ascii += cc > 0x7f ? "\\u" + cc.toString(16).padStart(4, "0") : raw[i]; }
  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: ascii });
  console.log("PUT ok. nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const f = await api(`/workflows/${WORKFLOW_ID}`);
  const fN = Object.fromEntries(f.nodes.map((n) => [n.name, n]));
  const checks = [
    ["systemMessage tiene la nueva regla diferida", fN["Dividir y Etiquetar Sub-preguntas"].parameters.options.systemMessage.includes("junto plata y compro")],
    ["systemMessage ya no tiene la regla vieja", !fN["Dividir y Etiquetar Sub-preguntas"].parameters.options.systemMessage.includes("cualquier cosa sobre pagar/reservar/retirar) -- eso va como")],
    ["Consolidar tiene el texto de cierre nuevo", fN["Consolidar Dato Resuelto"].parameters.jsCode.includes("dale bro! cualquier cosa nos escribis y coordinamos..")],
    ["Consolidar ya no tiene el texto viejo", !fN["Consolidar Dato Resuelto"].parameters.jsCode.includes("Dale, cualquier cosa nos escrib")],
  ];
  let ok = true;
  for (const [l, v] of checks) { console.log(v ? "  OK  " : "  FALLA", l); if (!v) ok = false; }
  console.log(ok ? "\nFix aplicado." : "\nREVISAR. Rollback: restore version " + EXPECTED_VERSION);
}
main().catch((e) => { console.error(e); process.exit(1); });
