// Fix (2026-09-03) -- LOOP INFINITO: el bot mando 40 veces la misma bienvenida
// del pack final (una cada ~8s) a conv 3266 (+5493735563199, "Sanchez").
// ---------------------------------------------------------------------------
// Ejecucion real 95313. El cliente mando pegados la variante ("recorrido
// corto", del contexto) + un resto ("cambiar el cilindro y la tapa, tengo que
// cambiar la biela?"). Camino:
//   ... -> ¿Grupo Sin Modelo? -> ¿Grupo Compatibilidad Universal? ->
//   Resolver Variante Sin Moto -> ¿Variante Sin Moto Resuelta? ->
//   Marcar Pack Final Pineado -> Enviar Bienvenida Pack Final ->
//   ¿Hay Resto Para Resolver? (Variante)  [resto_mensaje NO vacio -> true]
//   -> Traer Ultimo Mensaje Nuestro -> ... -> ¿Grupo Compatibilidad Universal?
//   -> ... -> Enviar Bienvenida Pack Final -> ¿Hay Resto...  (otra vez)
// `¿Hay Resto Para Resolver? (Variante)` chequea SOLO
// `$('Unir Mensajes').item.json.resto_mensaje` -- un valor estatico que nunca
// cambia entre iteraciones -> loop sin condicion de corte. Solo paro cuando la
// app devolvio "Bad Gateway" en el envio #40 y n8n mato la ejecucion.
// Los fixes previos (`saltea-reloop`, `no-reescala-la-variante`) movieron el
// destino del re-loop pero NUNCA agregaron una guarda de "ya pase por aca".
//
// Fix (0 nodos nuevos, 1 edicion): `¿Hay Resto Para Resolver? (Variante)` ahora
// exige ADEMAS `{{ $runIndex }} === 0` -- la 2da vez que el nodo se alcanza en
// la misma ejecucion (siempre por el loop; su unico input es `Enviar Bienvenida
// Pack Final`) la condicion da falso y corta. Sin Redis, sin TTL, sin estado
// entre rafagas.
//
// Uso:
//   node apply-fix-loop-resto-variante-pack-final.mjs --dry
//   node apply-fix-loop-resto-variante-pack-final.mjs
import { writeFileSync } from "fs";
import { randomUUID } from "crypto";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.APIKEY_N8N || process.env.API_KEY_N8N || process.env.N8N_KEY;
if (!API_KEY) throw new Error("Falta APIKEY_N8N en el entorno");
const DRY = process.argv.includes("--dry");
const EXPECTED_VERSION = "95435fcf-0fed-4077-8eb8-5eda4438b391";
const OUT_DIR = new URL("./", import.meta.url);

async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, { ...options, headers: { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json", ...(options.headers || {}) } });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) { console.error("ERROR", res.status, JSON.stringify(body, null, 2)); throw new Error(`API ${path} => ${res.status}`); }
  return body;
}

const NODE = "¿Hay Resto Para Resolver? (Variante)";

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}?_cb=${Date.now()}-${Math.random()}`);
  console.log("workflow:", wf.name, "| nodos:", wf.nodes.length, "| versionId:", wf.versionId);
  if (wf.versionId !== EXPECTED_VERSION) { console.warn(`\n  AVISO: versionId ${wf.versionId} != esperado ${EXPECTED_VERSION}\n`); if (!DRY) throw new Error("versionId no coincide"); }
  writeFileSync(new URL("./workflow_backup_pre-fix-loop-resto-variante_2026-09-03.json", OUT_DIR), JSON.stringify(wf, null, 0));

  const n = wf.nodes.find((x) => x.name === NODE);
  if (!n) throw new Error(`Falta el nodo "${NODE}"`);
  const conds = n.parameters.conditions.conditions;
  if (conds.length !== 1) throw new Error(`Esperaba 1 condicion en "${NODE}", hay ${conds.length} -- ¿ya se aplico / cambio?`);
  if (!JSON.stringify(conds[0]).includes("resto_mensaje")) throw new Error("La condicion existente no es la de resto_mensaje -- abortar");

  conds.push({
    id: randomUUID(),
    leftValue: "={{ $runIndex }}",
    rightValue: 0,
    operator: { type: "number", operation: "equals" },
  });
  n.parameters.conditions.combinator = "and";

  const sk = ["saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder"];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => sk.includes(k)));
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  if (DRY) {
    writeFileSync(new URL("./workflow_fix-loop-resto-variante_resultante_2026-09-03.json", OUT_DIR), JSON.stringify(wf, null, 2));
    console.log("\n[DRY] condicion nueva:", JSON.stringify(n.parameters.conditions, null, 1));
    return;
  }
  const raw = JSON.stringify(body);
  let ascii = ""; for (let i = 0; i < raw.length; i++) { const cc = raw.charCodeAt(i); ascii += cc > 0x7f ? "\\u" + cc.toString(16).padStart(4, "0") : raw[i]; }
  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: ascii });
  console.log("PUT ok. nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const f = await api(`/workflows/${WORKFLOW_ID}?_cb=${Date.now()}`);
  const fn = f.nodes.find((x) => x.name === NODE);
  const cc = fn.parameters.conditions.conditions;
  const checks = [
    ["tiene 2 condiciones", cc.length === 2],
    ["combinator = and", fn.parameters.conditions.combinator === "and"],
    ["sigue la condicion resto_mensaje", cc.some((c) => JSON.stringify(c).includes("resto_mensaje"))],
    ["nueva condicion $runIndex === 0", cc.some((c) => JSON.stringify(c).includes("$runIndex") && c.rightValue === 0)],
  ];
  let ok = true;
  for (const [l, v] of checks) { console.log(v ? "  OK  " : "  FALLA", l); if (!v) ok = false; }
  console.log(ok ? "\nFix aplicado." : "\nREVISAR. Rollback: restore version " + EXPECTED_VERSION);
}
main().catch((e) => { console.error(e); process.exit(1); });
