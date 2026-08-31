// Repregunta de "candidatos" sin moto: mensaje genérico corto + tope de reintentos (2026-08-31)
// -----------------------------------------------------------------------------------------------
// Caso real: conv 3082 (+5493517913933, "leito"). Entró con una imagen + "queria ese
// kit y mas una leva" (sin nombrar moto). `Identificar Necesidad` -> `candidatos` y el
// bot contestó enumerando los 3 nombres internos de kit:
//   "¿Te referís al kit 170 varillero + leva, al combo escape pwr + leva 6.40 o al kit 120 para 110?"
// Cuanto más larga la lista, más engorroso — y esos nombres no son los que el cliente
// vio en la publicidad, así que muchas veces ni le suenan.
//
// Cambios:
//  1. `Parsear Identificar Necesidad`: para tipo `candidatos` el `mensaje` deja de
//     enumerar kits y pasa a ser un texto FIJO (sin IA, sin "¿" de apertura) que pide
//     las 2 cosas que el bot necesita igual: qué kit y para qué moto.
//     -> "Tengo varios kits parecidos. Decime para qué moto es y qué kit estás
//         buscando, así te confirmo cuál es y te paso el precio."
//     (systemMessage del agente ajustado para que ya no redacte esa lista.)
//  2. El camino "el cliente NO dijo la moto" (`¿Hay Modelo Mencionado (Candidatos)?` =
//     false) gana un tope: contador Redis `repregunta_candidatos_intentos:{tel}` (TTL
//     24h). Tras 2 repreguntas sin que aclare -> escala UNA vez al equipo (nota privada
//     + fila en `preguntas_sin_match_pendientes`), con flag `candidatos_escalado:{tel}`
//     para no repetir la nota. Mismo patrón que el tope de la rama variante.
//  El camino "el cliente SÍ dijo la moto" (reduce por compatibilidad) queda intacto.
//
// 9 nodos nuevos (440 -> 449). Sin tocar el resto del árbol.
//
// Uso:
//   node apply-repregunta-candidatos-generica-y-tope.mjs --dry
//   node apply-repregunta-candidatos-generica-y-tope.mjs
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.APIKEY_N8N || process.env.API_KEY_N8N || process.env.N8N_KEY;
if (!API_KEY) throw new Error("Falta APIKEY_N8N en el entorno");
const DRY = process.argv.includes("--dry");
const OUT_DIR = new URL("./", import.meta.url);

const REDIS_CRED = { redis: { id: "ZUlkjSz8R2bmmO2f", name: "Redis account 2" } };
const PG_CRED = { postgres: { id: "65YYZNhTfBBheEpo", name: "Postgres account" } };
const TEL = "($('Webhook1').item.json.body.conversation.messages[0].sender.phone_number || ('conv-' + $('Webhook1').item.json.body.conversation.messages[0].conversation_id))";
const CONV = "$('Webhook1').item.json.body.conversation.messages[0].conversation_id";

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
const rep = (s, a, b) => { if (!s.includes(a)) throw new Error(`ancla no encontrada: ${a.slice(0, 90)}`); if (s.split(a).length > 2) throw new Error(`ancla ambigua: ${a.slice(0, 90)}`); return s.split(a).join(b); };

async function getFresh() {
  for (let i = 0; i < 40; i++) {
    const wf = await api(`/workflows/${WORKFLOW_ID}`);
    if (wf.nodes && wf.nodes.length >= 440) return wf;
    console.log(`  (GET devolvió ${wf.nodes && wf.nodes.length} nodos — cache stale, reintento ${i + 1})`);
  }
  throw new Error("el GET siempre devolvió una versión vieja del workflow");
}

const MENSAJE_FIJO = "Tengo varios kits parecidos. Decime para qué moto es y qué kit estás buscando, así te confirmo cuál es y te paso el precio.";

async function main() {
  const wf = await getFresh();
  console.log("workflow:", wf.name, "| nodos:", wf.nodes.length, "| versionId:", wf.versionId, "| updatedAt:", wf.updatedAt);
  writeFileSync(new URL("./workflow_backup_pre-repregunta-candidatos_2026-08-31.json", OUT_DIR), JSON.stringify(wf, null, 0));
  const ROLLBACK = wf.versionId;

  const N = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
  for (const req of ["Parsear Identificar Necesidad", "¿Hay Modelo Mencionado (Candidatos)?", "Enviar Repregunta Candidatos (Propuesta)"])
    if (!N[req]) throw new Error(`Falta el nodo "${req}"`);

  // ---- 1. mensaje fijo en Parsear Identificar Necesidad ---------------------------------
  let pj = N["Parsear Identificar Necesidad"].parameters.jsCode;
  pj = rep(pj,
    "if (tipo === 'candidatos' && !mensaje) {\n  mensaje = `¿Te referís a ${candidatos.map((c) => c.nombre).join(' o a ')}?`;\n}",
    "if (tipo === 'candidatos') {\n  // mensaje FIJO (sin enumerar kits): pide kit + moto, que es lo que el bot necesita igual.\n  mensaje = " + JSON.stringify(MENSAJE_FIJO) + ";\n}");
  N["Parsear Identificar Necesidad"].parameters.jsCode = pj;

  // ---- 1b. systemMessage del agente: que ya no redacte la lista -------------------------
  let sm = N["Identificar Necesidad"].parameters.options.systemMessage;
  sm = rep(sm,
    'mensaje: una pregunta corta nombrando esas opciones para que el cliente aclare -- ej. "¿Te referís al kit 120 para 110 o al kit potenciado 220cc?".',
    'mensaje: "" (un paso posterior redacta una repregunta fija pidiendo kit + moto, no hace falta que la armes acá).');
  N["Identificar Necesidad"].parameters.options.systemMessage = sm;

  // ---- 2. tope de reintentos en la rama "sin moto" -------------------------------------
  const P0 = N["Enviar Repregunta Candidatos (Propuesta)"].position; // [6112, 1152]
  const X = P0[0], Y = P0[1];
  const mk = (name, type, typeVersion, parameters, position, credentials) => {
    const n = { id: undefined, name, type, typeVersion, position, parameters };
    if (credentials) n.credentials = credentials;
    return n;
  };

  const nuevos = [
    mk("Contar Intento Repregunta Candidatos", "n8n-nodes-base.redis", 1, {
      operation: "incr",
      key: `=repregunta_candidatos_intentos:{{ ${TEL} }}`,
      expire: true, ttl: 86400,
    }, [X - 260, Y + 220], REDIS_CRED),

    mk("¿Repregunta Candidatos Repetida?", "n8n-nodes-base.if", 2.2, {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [{
          id: "cand-rep-gte3",
          leftValue: "={{ Object.values($json)[0] }}",
          rightValue: 3,
          operator: { type: "number", operation: "gte" },
        }],
        combinator: "and",
      },
      options: {},
    }, [X, Y + 220]),

    mk("Leer Escalado Candidatos Previo", "n8n-nodes-base.redis", 1, {
      operation: "get",
      propertyName: "ya_escalado",
      key: `=candidatos_escalado:{{ ${TEL} }}`,
      options: {},
    }, [X + 260, Y + 340], REDIS_CRED),

    mk("¿Ya Escalado Candidatos?", "n8n-nodes-base.if", 2.2, {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [{
          id: "cand-ya-escalado",
          leftValue: "={{ $json.ya_escalado }}",
          rightValue: "",
          operator: { type: "string", operation: "notEmpty", singleValue: true },
        }],
        combinator: "and",
      },
      options: {},
    }, [X + 520, Y + 340]),

    mk("Fin - Candidatos Ya Escalado", "n8n-nodes-base.noOp", 1, {}, [X + 780, Y + 240]),

    mk("Marcar Escalado Candidatos", "n8n-nodes-base.redis", 1, {
      operation: "set",
      key: `=candidatos_escalado:{{ ${TEL} }}`,
      value: "1", expire: true, ttl: 86400,
    }, [X + 780, Y + 440], REDIS_CRED),

    mk("Registrar Pendiente Candidatos Sin Aclarar", "n8n-nodes-base.postgres", 2.5, {
      operation: "executeQuery",
      query:
        "INSERT INTO preguntas_sin_match_pendientes (conversation_id, pregunta_original)\n" +
        `VALUES ({{ ${CONV} }}, 'Cliente con pedido que parece varios kits; no aclaró cuál ni para qué moto tras repreguntar. Mensaje: {{ $('Unir Mensajes').item.json.texto_completo.replace(/'/g, "''") }}');`,
      options: {},
    }, [X + 1040, Y + 440], PG_CRED),

    mk("Preparar Nota Escalado Candidatos", "n8n-nodes-base.set", 3.4, {
      assignments: {
        assignments: [{
          id: "cand-motivo",
          name: "motivo",
          type: "string",
          value:
            "=El cliente pidió algo que puede ser uno de varios kits parecidos y, después de un par de repreguntas, no nos aclaró cuál es ni para qué moto lo quiere. Su mensaje: \"{{ $('Unir Mensajes').item.json.texto_completo }}\". Escribile directo para destrabarlo — el bot no le va a insistir más con esto.",
        }],
      },
      options: {},
    }, [X + 1300, Y + 440]),

    mk("Enviar Nota Escalado Candidatos", "n8n-nodes-base.httpRequest", 4.2, {
      method: "POST",
      url: "={{ $('Config Chatwoot').item.json.chatwoot_api }}/accounts/{{ $('Webhook1').item.json.body.account.id }}/conversations/{{ " + CONV + " }}/messages",
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: "api_access_token", value: "={{ $('Config Chatwoot').item.json.chatwoot_token }}" },
        { name: "Content-Type", value: "application/json" },
      ] },
      sendBody: true,
      specifyBody: "json",
      jsonBody: "={{ JSON.stringify({ content: $json.motivo, message_type: 'outgoing', private: true }) }}",
      options: { timeout: 20000 },
    }, [X + 1560, Y + 440]),

    mk("Fin - Escalado Candidatos", "n8n-nodes-base.noOp", 1, {}, [X + 1820, Y + 440]),
  ];

  // ids
  for (const n of nuevos) n.id = cryptoRandomId();
  wf.nodes.push(...nuevos);

  // ---- rewire ------------------------------------------------------------------------
  const C = wf.connections;
  const one = (node) => [{ node, type: "main", index: 0 }];
  // ¿Hay Modelo Mencionado (Candidatos)? [false] -> Contar Intento (antes: -> Enviar Repregunta Propuesta)
  C["¿Hay Modelo Mencionado (Candidatos)?"].main[1] = one("Contar Intento Repregunta Candidatos");
  C["Contar Intento Repregunta Candidatos"] = { main: [one("¿Repregunta Candidatos Repetida?")] };
  C["¿Repregunta Candidatos Repetida?"] = { main: [
    one("Leer Escalado Candidatos Previo"),                  // true  -> escalar
    one("Enviar Repregunta Candidatos (Propuesta)"),         // false -> repreguntar (1º/2º)
  ] };
  C["Leer Escalado Candidatos Previo"] = { main: [one("¿Ya Escalado Candidatos?")] };
  C["¿Ya Escalado Candidatos?"] = { main: [
    one("Fin - Candidatos Ya Escalado"),                     // true  -> ya se escaló, silencio
    one("Marcar Escalado Candidatos"),                       // false -> escalar ahora
  ] };
  C["Marcar Escalado Candidatos"] = { main: [one("Registrar Pendiente Candidatos Sin Aclarar")] };
  C["Registrar Pendiente Candidatos Sin Aclarar"] = { main: [one("Preparar Nota Escalado Candidatos")] };
  C["Preparar Nota Escalado Candidatos"] = { main: [one("Enviar Nota Escalado Candidatos")] };
  C["Enviar Nota Escalado Candidatos"] = { main: [one("Fin - Escalado Candidatos")] };

  // ---- PUT ---------------------------------------------------------------------------
  const sk = ["saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder"];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => sk.includes(k)));
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  if (DRY) {
    writeFileSync(new URL("./workflow_repregunta-candidatos_resultante_2026-08-31.json", OUT_DIR), JSON.stringify(wf, null, 2));
    console.log("\n[DRY] nodos resultantes:", wf.nodes.length);
    console.log("[DRY] mensaje fijo candidatos:", MENSAJE_FIJO);
    console.log("[DRY] rollback versionId:", ROLLBACK);
    return;
  }

  const raw = JSON.stringify(body);
  let ascii = ""; for (let i = 0; i < raw.length; i++) { const cc = raw.charCodeAt(i); ascii += cc > 0x7f ? "\\u" + cc.toString(16).padStart(4, "0") : raw[i]; }
  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: ascii });
  console.log("PUT ok. nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const f = await getFresh();
  const fN = Object.fromEntries(f.nodes.map((n) => [n.name, n]));
  const checks = [
    ["mensaje fijo en parser", fN["Parsear Identificar Necesidad"].parameters.jsCode.includes(MENSAJE_FIJO)],
    ["parser ya no enumera", !fN["Parsear Identificar Necesidad"].parameters.jsCode.includes("join(' o a ')")],
    ["systemMessage ajustado", fN["Identificar Necesidad"].parameters.options.systemMessage.includes("un paso posterior redacta")],
    ["9 nodos nuevos", ["Contar Intento Repregunta Candidatos", "¿Repregunta Candidatos Repetida?", "Leer Escalado Candidatos Previo", "¿Ya Escalado Candidatos?", "Fin - Candidatos Ya Escalado", "Marcar Escalado Candidatos", "Registrar Pendiente Candidatos Sin Aclarar", "Preparar Nota Escalado Candidatos", "Enviar Nota Escalado Candidatos", "Fin - Escalado Candidatos"].every((n) => fN[n])],
    ["rama false -> Contar Intento", f.connections["¿Hay Modelo Mencionado (Candidatos)?"].main[1][0].node === "Contar Intento Repregunta Candidatos"],
    ["If repetida -> Propuesta en false", f.connections["¿Repregunta Candidatos Repetida?"].main[1][0].node === "Enviar Repregunta Candidatos (Propuesta)"],
  ];
  let ok = true;
  for (const [l, v] of checks) { console.log(v ? "  OK  " : "  FALLA", l); if (!v) ok = false; }
  console.log(ok ? "\nAplicado. Rollback: restore version " + ROLLBACK : "\nREVISAR. Rollback: restore version " + ROLLBACK);
}

function cryptoRandomId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; const v = c === "x" ? r : (r & 0x3) | 0x8; return v.toString(16);
  });
}
main().catch((e) => { console.error(e); process.exit(1); });
