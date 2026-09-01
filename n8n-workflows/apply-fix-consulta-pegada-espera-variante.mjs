// Grupo/kit esperando la variante (corto/largo): una consulta pegada en la misma rafaga
// ya no se descarta -- se contesta (o se escala) igual que el "esperando la moto" de conv 3078.
// -----------------------------------------------------------------------------------------------
// Caso real: conv 3153 (+5492625419260, "Joacoo"). Kit 120 pineado, esperando corto/largo.
// El cliente mando en una rafaga: "Sinceramente no Bro jaja / Tendria q averiguarme.. porque
// me interesa el kit" + "Yo soy de Gral Alvear, Mza. cuantos dias tarda Aprox?".
// `Resolver Variante` (IA) devolvio `espera_respuesta: true` -> el workflow se fue a
// `Fin - Cliente Aviso Que Responde (Variante)` y corto TODO ahi. La pregunta de envio
// ("cuantos dias tarda") quedo sin respuesta y sin nota. Ejecucion n8n #92969.
//
// Fix: la rama `¿Cliente Va a Responder Luego? (Variante)` = true, antes de ir al silencio,
// pasa el texto de la rafaga por un clasificador (mismo prompt/parser que
// `Extraer/Parsear Tema Negocio (Esperando Variante)`, ya probado). Si hay una consulta de
// precio / negocio-envio / "otro" real, se responde o se escala reusando los nodos terminales
// que ya existen (`Enviar Precio Grupo`, `Buscar Info Negocio (Esperando Variante)`,
// `Registrar Pendiente Negocio (Esperando Variante)`). Si no hay nada mas ("nada"), cae al
// mismo silencio de hoy (`Fin - Cliente Aviso Que Responde (Variante)`). El pin sigue
// esperando la variante, no se toca. El camino "eligio corto/largo" queda intacto.
//
// 5 nodos nuevos (440 -> 445). Reusa el modelo `DeepSeek Chat Model - Tema Negocio (Esperando
// Variante)` (una salida ai_languageModel puede alimentar 2 agentes).
//
// Uso:
//   node apply-fix-consulta-pegada-espera-variante.mjs --dry
//   node apply-fix-consulta-pegada-espera-variante.mjs
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.APIKEY_N8N || process.env.API_KEY_N8N || process.env.N8N_KEY;
if (!API_KEY) throw new Error("Falta APIKEY_N8N en el entorno");
const DRY = process.argv.includes("--dry");
const OUT_DIR = new URL("./", import.meta.url);

async function api(path, options = {}) {
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

async function getFresh() {
  for (let i = 0; i < 40; i++) {
    const wf = await api(`/workflows/${WORKFLOW_ID}`);
    if (wf.nodes && wf.nodes.length >= 440) return wf;
    console.log(`  (GET devolvio ${wf.nodes && wf.nodes.length} nodos - cache stale, reintento ${i + 1})`);
  }
  throw new Error("el GET siempre devolvio una version vieja del workflow");
}

function cryptoRandomId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; const v = c === "x" ? r : (r & 0x3) | 0x8; return v.toString(16);
  });
}

async function main() {
  const wf = await getFresh();
  console.log("workflow:", wf.name, "| nodos:", wf.nodes.length, "| versionId:", wf.versionId, "| updatedAt:", wf.updatedAt);
  writeFileSync(new URL("./workflow_backup_pre-consulta-pegada-espera-variante_2026-09-01.json", OUT_DIR), JSON.stringify(wf, null, 0));
  const ROLLBACK = wf.versionId;

  const N = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
  for (const req of [
    "¿Cliente Va a Responder Luego? (Variante)",
    "Fin - Cliente Avisó Que Responde (Variante)",
    "Extraer Tema Negocio (Esperando Variante)",
    "Parsear Tema Negocio (Esperando Variante)",
    "DeepSeek Chat Model - Tema Negocio (Esperando Variante)",
    "Enviar Precio Grupo",
    "Buscar Info Negocio (Esperando Variante)",
    "Registrar Pendiente Negocio (Esperando Variante)",
  ]) if (!N[req]) throw new Error(`Falta el nodo "${req}"`);

  // ---- nodos nuevos: mini-clasificador de "consulta pegada" -------------------------------
  const P0 = N["Fin - Cliente Avisó Que Responde (Variante)"].position; // [1088, 3620]
  const X = P0[0], Y = P0[1] + 260;

  const agente = JSON.parse(JSON.stringify(N["Extraer Tema Negocio (Esperando Variante)"]));
  const parser = JSON.parse(JSON.stringify(N["Parsear Tema Negocio (Esperando Variante)"]));

  const ifNode = (name, expr, position) => ({
    id: cryptoRandomId(),
    name,
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position,
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [{
          id: cryptoRandomId(),
          leftValue: `={{ ${expr} }}`,
          rightValue: true,
          operator: { type: "boolean", operation: "equals" },
        }],
        combinator: "and",
      },
      options: {},
    },
  });

  const nuevos = [
    {
      id: cryptoRandomId(),
      name: "Extraer Consulta Pegada (Espera Variante)",
      type: agente.type,
      typeVersion: agente.typeVersion,
      position: [X, Y],
      parameters: JSON.parse(JSON.stringify(agente.parameters)),
    },
    {
      id: cryptoRandomId(),
      name: "Parsear Consulta Pegada (Espera Variante)",
      type: parser.type,
      typeVersion: parser.typeVersion,
      position: [X + 240, Y],
      parameters: JSON.parse(JSON.stringify(parser.parameters)),
    },
    ifNode("¿Consulta Pegada: Precio? (Espera Variante)", "$json.es_precio === true", [X + 480, Y]),
    ifNode("¿Consulta Pegada: Negocio? (Espera Variante)", "$json.es_negocio === true", [X + 720, Y + 120]),
    ifNode("¿Consulta Pegada: Otro? (Espera Variante)", "$json.es_otro === true", [X + 960, Y + 240]),
  ];
  for (const n of nuevos) if (N[n.name]) throw new Error(`El nodo "${n.name}" ya existe`);
  wf.nodes.push(...nuevos);

  // ---- rewire ---------------------------------------------------------------------------
  const C = wf.connections;
  const one = (node) => [{ node, type: "main", index: 0 }];

  // ¿Cliente Va a Responder Luego? (Variante) [true] -> clasificador (antes: -> Fin silencio)
  C["¿Cliente Va a Responder Luego? (Variante)"].main[0] = one("Extraer Consulta Pegada (Espera Variante)");

  C["Extraer Consulta Pegada (Espera Variante)"] = { main: [one("Parsear Consulta Pegada (Espera Variante)")] };
  C["Parsear Consulta Pegada (Espera Variante)"] = { main: [one("¿Consulta Pegada: Precio? (Espera Variante)")] };
  C["¿Consulta Pegada: Precio? (Espera Variante)"] = { main: [
    one("Enviar Precio Grupo"),                              // true  -> precio del combo
    one("¿Consulta Pegada: Negocio? (Espera Variante)"),     // false
  ] };
  C["¿Consulta Pegada: Negocio? (Espera Variante)"] = { main: [
    one("Buscar Info Negocio (Esperando Variante)"),         // true  -> envio/ubicacion/etc
    one("¿Consulta Pegada: Otro? (Espera Variante)"),        // false
  ] };
  C["¿Consulta Pegada: Otro? (Espera Variante)"] = { main: [
    one("Registrar Pendiente Negocio (Esperando Variante)"), // true  -> escala nota privada
    one("Fin - Cliente Avisó Que Responde (Variante)"),      // false -> "nada": silencio como hoy
  ] };

  // el modelo ya existente alimenta tambien al agente nuevo
  const lm = C["DeepSeek Chat Model - Tema Negocio (Esperando Variante)"];
  if (!lm.ai_languageModel) lm.ai_languageModel = [[]];
  lm.ai_languageModel[0].push({ node: "Extraer Consulta Pegada (Espera Variante)", type: "ai_languageModel", index: 0 });

  // ---- PUT ----------------------------------------------------------------------------
  const sk = ["saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder"];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => sk.includes(k)));
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  if (DRY) {
    writeFileSync(new URL("./workflow_consulta-pegada-espera-variante_resultante_2026-09-01.json", OUT_DIR), JSON.stringify(wf, null, 2));
    console.log("\n[DRY] nodos resultantes:", wf.nodes.length);
    console.log("[DRY] rollback versionId:", ROLLBACK);
    return;
  }

  const raw = JSON.stringify(body);
  let ascii = ""; for (let i = 0; i < raw.length; i++) { const cc = raw.charCodeAt(i); ascii += cc > 0x7f ? "\\u" + cc.toString(16).padStart(4, "0") : raw[i]; }
  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: ascii });
  console.log("PUT ok. nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const f = await getFresh();
  const fC = f.connections;
  const checks = [
    ["5 nodos nuevos", ["Extraer Consulta Pegada (Espera Variante)", "Parsear Consulta Pegada (Espera Variante)", "¿Consulta Pegada: Precio? (Espera Variante)", "¿Consulta Pegada: Negocio? (Espera Variante)", "¿Consulta Pegada: Otro? (Espera Variante)"].every((n) => f.nodes.some((x) => x.name === n))],
    ["true -> clasificador", fC["¿Cliente Va a Responder Luego? (Variante)"].main[0][0].node === "Extraer Consulta Pegada (Espera Variante)"],
    ["precio true -> Enviar Precio Grupo", fC["¿Consulta Pegada: Precio? (Espera Variante)"].main[0][0].node === "Enviar Precio Grupo"],
    ["negocio true -> Buscar Info Negocio", fC["¿Consulta Pegada: Negocio? (Espera Variante)"].main[0][0].node === "Buscar Info Negocio (Esperando Variante)"],
    ["otro true -> Registrar Pendiente", fC["¿Consulta Pegada: Otro? (Espera Variante)"].main[0][0].node === "Registrar Pendiente Negocio (Esperando Variante)"],
    ["otro false -> Fin silencio", fC["¿Consulta Pegada: Otro? (Espera Variante)"].main[1][0].node === "Fin - Cliente Avisó Que Responde (Variante)"],
    ["modelo alimenta agente nuevo", fC["DeepSeek Chat Model - Tema Negocio (Esperando Variante)"].ai_languageModel[0].some((c) => c.node === "Extraer Consulta Pegada (Espera Variante)")],
  ];
  let ok = true;
  for (const [l, v] of checks) { console.log(v ? "  OK  " : "  FALLA", l); if (!v) ok = false; }
  console.log(ok ? "\nAplicado. Rollback: restore version " + ROLLBACK : "\nREVISAR. Rollback: restore version " + ROLLBACK);
}

main().catch((e) => { console.error(e); process.exit(1); });
