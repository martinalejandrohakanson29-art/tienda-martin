// Fix (2026-09-03) -- grupo esperando la moto: un saludo pelado ya no dispara
// la re-pregunta "¿qué marca y modelo es tu moto?".
// ---------------------------------------------------------------------------
// Caso real: conv 2991 (+5492964505229, "Jonny"). El bot mando la bienvenida
// del combo (que ya pide la moto) y quedo esperando la moto. 14 min despues el
// cliente escribio solo "Buen día". `Extraer Tema Negocio (Grupo)` lo
// clasifico "nada" (correcto: su prompt mete "saluda" dentro de "nada"), y el
// destino de "nada" es `¿Es Cierre? (Grupo)`[1] -> `Preparar Repregunta Modelo
// (Grupo)` -> re-pregunta la moto. Ademas incrementa el contador
// `repregunta_modelo_grupo_intentos` (3 nudges sin la moto => escala).
//
// Fix (1 prompt + 1 code + 3 nodos nuevos, 0 borrados):
//  1. `Extraer Tema Negocio (Grupo)` (prompt): categoria nueva "saludo" = el
//     cliente SOLO saluda, sin nombrar la moto ni pedir nada. Se saca "saluda"
//     de la definicion de "nada".
//  2. `Parsear Tema Negocio (Grupo)` (jsCode): "saludo" entra en la whitelist y
//     se expone `es_saludo`.
//  3. `¿Es Solo Saludo? (Grupo)` (If) intercalado en `¿Es Cierre? (Grupo)`[1]:
//       - saludo -> `Enviar Saludo Corto (Grupo)` ("Hola bro! Acá andamos.")
//                   -> `Fin - Saludo Corto Grupo` (no re-pregunta, no toca el
//                   contador, el pin sigue esperando la moto).
//       - resto  -> `Preparar Repregunta Modelo (Grupo)` (sin cambios).
// Decision de comportamiento confirmada con Martin: "Saluda de vuelta, sin
// re-pedir la moto".
//
// Uso:
//   node apply-grupo-espera-moto-saludo-no-repregunta.mjs --dry
//   node apply-grupo-espera-moto-saludo-no-repregunta.mjs
import { writeFileSync } from "fs";
import { randomUUID } from "crypto";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.APIKEY_N8N || process.env.API_KEY_N8N || process.env.N8N_KEY;
if (!API_KEY) throw new Error("Falta APIKEY_N8N en el entorno");
const DRY = process.argv.includes("--dry");
const EXPECTED_VERSION = "69232233-03b6-441c-8944-38dd2843b8e5";
const OUT_DIR = new URL("./", import.meta.url);

async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, { ...options, headers: { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json", ...(options.headers || {}) } });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) { console.error("ERROR", res.status, JSON.stringify(body, null, 2)); throw new Error(`API ${path} => ${res.status}`); }
  return body;
}
const rep = (s, a, b) => { if (!s.includes(a)) throw new Error(`ancla no encontrada: ${a.slice(0, 90)}`); return s.split(a).join(b); };

const OLD_CATS =
  '- "cierre": el cliente hace un comentario de cierre o agradecimiento que no pide nada real (ej. "dale", "gracias", "genial", "buenísimo", "apenas tenga la plata les mando", "a la tarde me llegó") -- no hace falta contestarle nada.\n' +
  '- "nada": no hay NINGÚN pedido real que resolver -- el cliente solo habla de su moto, hace un comentario sobre ella, saluda, o repite algo que ya se contestó. Si pide un precio o un dato concreto de algo, NO es "nada".';
const NEW_CATS =
  '- "cierre": el cliente hace un comentario de cierre o agradecimiento que no pide nada real (ej. "dale", "gracias", "genial", "buenísimo", "apenas tenga la plata les mando", "a la tarde me llegó") -- no hace falta contestarle nada.\n' +
  '- "saludo": el cliente SOLO saluda y nada más (ej. "hola", "buen día", "buenas", "buenas tardes", "buenas noches", "qué tal", "cómo andás") -- sin nombrar su moto, sin pedir nada, sin mencionar ningún producto. Si además del saludo dice o pide cualquier otra cosa (la moto, un producto, un precio, un dato), NO es "saludo".\n' +
  '- "nada": no hay NINGÚN pedido real que resolver -- el cliente solo habla de su moto, hace un comentario sobre ella, o repite algo que ya se contestó. Si pide un precio o un dato concreto de algo, NO es "nada".';

const OLD_FMT = '{"clasificacion": "negocio" o "precio" o "otro" o "cierre" o "nada", "temas":';
const NEW_FMT = '{"clasificacion": "negocio" o "precio" o "otro" o "cierre" o "saludo" o "nada", "temas":';
const OLD_TEMAS = 'Si clasificacion es "otro", "cierre" o "nada", temas es [].';
const NEW_TEMAS = 'Si clasificacion es "otro", "cierre", "saludo" o "nada", temas es [].';

const OLD_WL = "if (['negocio', 'precio', 'otro', 'cierre', 'nada'].includes(parsed.clasificacion)) clasificacion = parsed.clasificacion;";
const NEW_WL = "if (['negocio', 'precio', 'otro', 'cierre', 'saludo', 'nada'].includes(parsed.clasificacion)) clasificacion = parsed.clasificacion;";
const OLD_RET = "es_cierre: clasificacion === 'cierre', es_mayorista:";
const NEW_RET = "es_cierre: clasificacion === 'cierre', es_saludo: clasificacion === 'saludo', es_mayorista:";

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}?_cb=${Date.now()}-${Math.random()}`);
  console.log("workflow:", wf.name, "| nodos:", wf.nodes.length, "| versionId:", wf.versionId);
  if (wf.versionId !== EXPECTED_VERSION) { console.warn(`\n  AVISO: versionId ${wf.versionId} != esperado ${EXPECTED_VERSION}\n`); if (!DRY) throw new Error("versionId no coincide"); }
  writeFileSync(new URL("./workflow_backup_pre-grupo-saludo-no-repregunta_2026-09-03.json", OUT_DIR), JSON.stringify(wf, null, 0));

  const N = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
  for (const n of ["Extraer Tema Negocio (Grupo)", "Parsear Tema Negocio (Grupo)", "¿Es Cierre? (Grupo)", "Preparar Repregunta Modelo (Grupo)", "Enviar Saludo Generico"]) if (!N[n]) throw new Error(`Falta el nodo "${n}"`);
  const IF_NAME = "¿Es Solo Saludo? (Grupo)", SEND_NAME = "Enviar Saludo Corto (Grupo)", FIN_NAME = "Fin - Saludo Corto Grupo";
  if (N[IF_NAME] || N[SEND_NAME]) throw new Error("Nodos nuevos ya existen -- ¿fix ya aplicado?");

  // sanity: la conexión que interceptamos
  const cCierre = wf.connections["¿Es Cierre? (Grupo)"];
  if (cCierre?.main?.[1]?.[0]?.node !== "Preparar Repregunta Modelo (Grupo)") throw new Error("¿Es Cierre? (Grupo)[1] no apunta a Preparar Repregunta Modelo (Grupo) -- abortar");

  // 1. prompt
  {
    const p = N["Extraer Tema Negocio (Grupo)"];
    let sm = p.parameters.options.systemMessage;
    sm = rep(sm, OLD_CATS, NEW_CATS);
    sm = rep(sm, OLD_FMT, NEW_FMT);
    sm = rep(sm, OLD_TEMAS, NEW_TEMAS);
    p.parameters.options.systemMessage = sm;
  }
  // 2. parser
  {
    const p = N["Parsear Tema Negocio (Grupo)"];
    let js = p.parameters.jsCode;
    js = rep(js, OLD_WL, NEW_WL);
    js = rep(js, OLD_RET, NEW_RET);
    p.parameters.jsCode = js;
  }
  // 3. nodos nuevos
  const sendGen = N["Enviar Saludo Generico"];
  const sendNode = JSON.parse(JSON.stringify(sendGen));
  sendNode.id = randomUUID();
  sendNode.name = SEND_NAME;
  sendNode.position = [2400, 2980];
  sendNode.parameters.jsonBody =
    "={{ JSON.stringify({ conversation_id: $('Webhook1').item.json.body.conversation.messages[0].conversation_id, account_id: $('Webhook1').item.json.body.account.id, content: 'Hola bro! Acá andamos.', origen: 'saludo_corto_grupo_2_0', contacto: ($('Webhook1').item.json.body.conversation?.meta?.sender?.name || $('Webhook1').item.json.body.sender?.name || ''), foto_url: null }) }}";

  const ifNode = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
        conditions: [{ id: randomUUID(), leftValue: "={{ $json.es_saludo }}", rightValue: true, operator: { type: "boolean", operation: "equals" } }],
        combinator: "and",
      },
      options: {},
    },
    id: randomUUID(), name: IF_NAME, type: "n8n-nodes-base.if", typeVersion: 2.2, position: [2400, 2800],
  };
  const finNode = { parameters: {}, id: randomUUID(), name: FIN_NAME, type: "n8n-nodes-base.noOp", typeVersion: 1, position: [2620, 3060] };

  wf.nodes.push(ifNode, sendNode, finNode);

  // rewire
  wf.connections["¿Es Cierre? (Grupo)"].main[1] = [{ node: IF_NAME, type: "main", index: 0 }];
  wf.connections[IF_NAME] = {
    main: [
      [{ node: SEND_NAME, type: "main", index: 0 }],
      [{ node: "Preparar Repregunta Modelo (Grupo)", type: "main", index: 0 }],
    ],
  };
  wf.connections[SEND_NAME] = { main: [[{ node: FIN_NAME, type: "main", index: 0 }]] };

  const sk = ["saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder"];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => sk.includes(k)));
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  if (DRY) {
    writeFileSync(new URL("./workflow_grupo-saludo-no-repregunta_resultante_2026-09-03.json", OUT_DIR), JSON.stringify(wf, null, 2));
    console.log("\n[DRY] cambios preparados, sin PUT. nodos ->", wf.nodes.length);
    return;
  }
  const raw = JSON.stringify(body);
  let ascii = ""; for (let i = 0; i < raw.length; i++) { const cc = raw.charCodeAt(i); ascii += cc > 0x7f ? "\\u" + cc.toString(16).padStart(4, "0") : raw[i]; }
  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: ascii });
  console.log("PUT ok. nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const f = await api(`/workflows/${WORKFLOW_ID}?_cb=${Date.now()}`);
  const fN = Object.fromEntries(f.nodes.map((n) => [n.name, n]));
  const c = f.connections;
  const checks = [
    ['prompt tiene categoría "saludo"', fN["Extraer Tema Negocio (Grupo)"].parameters.options.systemMessage.includes('"saludo": el cliente SOLO saluda')],
    ['prompt: "nada" ya no dice "saluda"', !fN["Extraer Tema Negocio (Grupo)"].parameters.options.systemMessage.includes("comentario sobre ella, saluda, o repite")],
    ["parser: whitelist con saludo", fN["Parsear Tema Negocio (Grupo)"].parameters.jsCode.includes("'cierre', 'saludo', 'nada'")],
    ["parser: expone es_saludo", fN["Parsear Tema Negocio (Grupo)"].parameters.jsCode.includes("es_saludo: clasificacion === 'saludo'")],
    ["¿Es Cierre? (Grupo)[1] -> " + IF_NAME, c["¿Es Cierre? (Grupo)"].main[1][0].node === IF_NAME],
    [IF_NAME + "[0] -> " + SEND_NAME, c[IF_NAME].main[0][0].node === SEND_NAME],
    [IF_NAME + "[1] -> Preparar Repregunta Modelo (Grupo)", c[IF_NAME].main[1][0].node === "Preparar Repregunta Modelo (Grupo)"],
    [SEND_NAME + " -> " + FIN_NAME, c[SEND_NAME].main[0][0].node === FIN_NAME],
    [SEND_NAME + " manda saludo corto", fN[SEND_NAME].parameters.jsonBody.includes("Hola bro! Ac\\u00e1 andamos.") || fN[SEND_NAME].parameters.jsonBody.includes("Hola bro! Acá andamos.")],
  ];
  let ok = true;
  for (const [l, v] of checks) { console.log(v ? "  OK  " : "  FALLA", l); if (!v) ok = false; }
  console.log(ok ? "\nFix aplicado." : "\nREVISAR. Rollback: restore version " + EXPECTED_VERSION);
}
main().catch((e) => { console.error(e); process.exit(1); });
