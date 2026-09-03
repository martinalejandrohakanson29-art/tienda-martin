// Fix (2026-09-03) -- respuesta pública de un humano del equipo = pausa el bot.
// ---------------------------------------------------------------------------
// Caso real: conv 3242 (+5493812501333, "Richar"). El bot escaló en nota
// privada un "piston para ns200" (sin_match). Al otro día un humano le
// contestó al cliente EN PÚBLICO ("no tenemos nada de pistones para ns, mil
// disculpas"). 11 min después el cliente dijo "Perfecto" y el bot -- que
// nunca se había pausado en Redis -- disparó el "cierre" ("Dale bro,
// cualquier cosa nos escribís y coordinamos.").
//
// Causa: el único gate de pausa en la rama de respuesta del equipo
// (¿Hay Pregunta Pendiente?[1] -> Chequear Sin Match Antes de Pausar ->
// ¿Hay Sin Match Pendiente Tambien?) NO pausa cuando existe una pendiente
// sin_match, asumiendo que el equipo siempre contesta esas por nota privada
// (flujo de aprendizaje). Acá contestó en público = se hizo cargo de la
// charla, y el bot quedó activo. Además el panel (calcularBotPausadoDesde
// Historial) YA considera pausado cualquier reply público de un agente, así
// que el switch mostraba "Bot OFF" mientras el bot seguía hablando.
//
// Fix (2 nodos nuevos, 0 borrados): entre `¿Es Respuesta de Mi Equipo?` y
// `Buscar Preguntas Pendientes` se intercala:
//   ¿Respuesta Publica del Equipo?  (If: body.private === true -> operación "false")
//     - true  (público)  -> Marcar Bot Pausado (Equipo Publico) [Redis SET
//                            bot_pausado:{conv} = 1, TTL 30 días] -> Buscar
//                            Preguntas Pendientes
//     - false (nota priv) -> Buscar Preguntas Pendientes  (sin cambios)
// El resto de la rama de aprendizaje queda intacta; lo único que se agrega es
// el SET en Redis para los replies públicos. Se reactiva con /bot on o el
// switch del panel, igual que /bot off.
//
// Uso:
//   node apply-pausar-bot-en-respuesta-publica-equipo.mjs --dry
//   node apply-pausar-bot-en-respuesta-publica-equipo.mjs
import { writeFileSync } from "fs";
import { randomUUID } from "crypto";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.APIKEY_N8N || process.env.API_KEY_N8N || process.env.N8N_KEY;
if (!API_KEY) throw new Error("Falta APIKEY_N8N en el entorno");
const DRY = process.argv.includes("--dry");
const EXPECTED_VERSION = "9662331e-9902-4a5e-91b8-89ddd66288eb"; // rollback target
const OUT_DIR = new URL("./", import.meta.url);

async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, { ...options, headers: { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json", ...(options.headers || {}) } });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) { console.error("ERROR", res.status, JSON.stringify(body, null, 2)); throw new Error(`API ${path} => ${res.status}`); }
  return body;
}

const IF_NAME = "¿Respuesta Publica del Equipo?";
const SET_NAME = "Marcar Bot Pausado (Equipo Publico)";

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  console.log("workflow:", wf.name, "| nodos:", wf.nodes.length, "| versionId:", wf.versionId);
  if (wf.versionId !== EXPECTED_VERSION) { console.warn(`\n  AVISO: versionId ${wf.versionId} != esperado ${EXPECTED_VERSION}\n`); if (!DRY) throw new Error("versionId no coincide"); }
  writeFileSync(new URL("./workflow_backup_pre-pausar-respuesta-publica_2026-09-03.json", OUT_DIR), JSON.stringify(wf, null, 0));

  const N = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
  for (const n of ["¿Es Respuesta de Mi Equipo?", "Buscar Preguntas Pendientes", "Marcar Bot Pausado"]) if (!N[n]) throw new Error(`Falta el nodo "${n}"`);
  if (N[IF_NAME] || N[SET_NAME]) throw new Error("Los nodos nuevos ya existen -- ¿ya se aplicó el fix?");

  // sanity: la conexión que vamos a interceptar tiene que ser la esperada
  const conEquipo = wf.connections["¿Es Respuesta de Mi Equipo?"];
  const t0 = conEquipo?.main?.[0]?.[0];
  if (!t0 || t0.node !== "Buscar Preguntas Pendientes") throw new Error("¿Es Respuesta de Mi Equipo?[0] no apunta a Buscar Preguntas Pendientes -- abortar");

  const redisCred = N["Marcar Bot Pausado"].credentials;
  const convIdExpr = "={{ $('Webhook1').item.json.body.conversation.messages[0].conversation_id }}";

  const ifNode = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [
          {
            id: randomUUID(),
            leftValue: "={{ $json.body.private === true }}",
            rightValue: "",
            operator: { type: "boolean", operation: "false", singleValue: true },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
    id: randomUUID(),
    name: IF_NAME,
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [1264, 400],
  };

  const setNode = {
    parameters: {
      operation: "set",
      key: `=bot_pausado:{{ $('Webhook1').item.json.body.conversation.messages[0].conversation_id }}`,
      value: "1",
      expire: true,
      ttl: 2592000,
    },
    id: randomUUID(),
    name: SET_NAME,
    type: "n8n-nodes-base.redis",
    typeVersion: 1,
    position: [1264, 560],
    credentials: redisCred,
  };
  void convIdExpr;

  wf.nodes.push(ifNode, setNode);

  // rewire
  wf.connections["¿Es Respuesta de Mi Equipo?"].main[0] = [{ node: IF_NAME, type: "main", index: 0 }];
  wf.connections[IF_NAME] = {
    main: [
      [{ node: SET_NAME, type: "main", index: 0 }],           // output 0: público
      [{ node: "Buscar Preguntas Pendientes", type: "main", index: 0 }], // output 1: nota privada
    ],
  };
  wf.connections[SET_NAME] = { main: [[{ node: "Buscar Preguntas Pendientes", type: "main", index: 0 }]] };

  const sk = ["saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder"];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => sk.includes(k)));
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  if (DRY) {
    writeFileSync(new URL("./workflow_pausar-respuesta-publica_resultante_2026-09-03.json", OUT_DIR), JSON.stringify(wf, null, 2));
    console.log("\n[DRY] cambios preparados, sin PUT. nodos ->", wf.nodes.length);
    return;
  }
  const raw = JSON.stringify(body);
  let ascii = ""; for (let i = 0; i < raw.length; i++) { const cc = raw.charCodeAt(i); ascii += cc > 0x7f ? "\\u" + cc.toString(16).padStart(4, "0") : raw[i]; }
  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: ascii });
  console.log("PUT ok. nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const f = await api(`/workflows/${WORKFLOW_ID}`);
  const c = f.connections;
  const checks = [
    ["¿Es Respuesta de Mi Equipo?[0] -> " + IF_NAME, c["¿Es Respuesta de Mi Equipo?"].main[0][0].node === IF_NAME],
    [IF_NAME + "[0] -> " + SET_NAME, c[IF_NAME].main[0][0].node === SET_NAME],
    [IF_NAME + "[1] -> Buscar Preguntas Pendientes", c[IF_NAME].main[1][0].node === "Buscar Preguntas Pendientes"],
    [SET_NAME + " -> Buscar Preguntas Pendientes", c[SET_NAME].main[0][0].node === "Buscar Preguntas Pendientes"],
    ["nodo SET existe con credencial redis", !!f.nodes.find((n) => n.name === SET_NAME && n.credentials?.redis)],
  ];
  let ok = true;
  for (const [l, v] of checks) { console.log(v ? "  OK  " : "  FALLA", l); if (!v) ok = false; }
  console.log(ok ? "\nFix aplicado." : "\nREVISAR. Rollback: restore version " + EXPECTED_VERSION);
}
main().catch((e) => { console.error(e); process.exit(1); });
