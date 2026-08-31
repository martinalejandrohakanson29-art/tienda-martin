// PUT 2 (2026-08-31) del plan PLAN-unificar-resto-grupos.md -- version ACOTADA.
// -------------------------------------------------------------------
// Objetivo: que una pregunta de PRECIO del combo, hecha en un grupo que ya
// esta esperando corto/largo (o justo despues de confirmar compatibilidad),
// deje de escalar al equipo (o de ignorarse). Ahora se contesta con la linea
// de precio del grupo ("El <combo> sale: <corto> $X / <largo> $Y ...").
//
// Estados cubiertos (las 3 cascadas caseras que quedaron activas tras PUT 1):
//   - `(Grupo)`            via `¿Variante Sin Moto Resuelta?` [1] / compat universal
//   - `(Variante)`         via `¿Variante Resuelta?` [1]  (grupo con moto confirmada)
//   - `(Esperando Variante)` via `¿Variante Anticipada Resuelta?` [1]
//
// NO se recablea nada a la maquina de sub-preguntas (eso era la version amplia,
// descartada por lo poco uniformes que son las 3 cascadas). NO se toca la
// resolucion de variante ni los contadores de reintento.
//
// Cambios por cascada (x3):
//  1. `Extraer Tema Negocio (X)` (prompt): categoria/flag nueva `precio`.
//  2. `Parsear Tema Negocio (X)` (code): expone `es_precio` + `precio_texto`
//     (la linea de precio armada desde `chat_pack_grupos.variantes[].precio` +
//     `criterio_variante`). Si el grupo no tiene 2 variantes con precio, es_precio
//     vuelve a false y cae al camino normal.
//  3. nodo nuevo `¿Es Precio? (X)` (If) entre `Parsear Tema Negocio (X)` y
//     `¿Es Negocio? (X)`.
//  4. rewire: `Parsear Tema Negocio (X)` -> `¿Es Precio? (X)`;
//     `¿Es Precio? (X)` true -> `Enviar Precio Grupo` (nuevo, compartido) ->
//     `Fin - Precio Grupo Enviado`; false -> `¿Es Negocio? (X)` como siempre.
//
// Nodos nuevos: 3x `¿Es Precio? (X)` + `Enviar Precio Grupo` + `Fin - Precio Grupo Enviado` = 5.
//
// Uso:
//   node apply-put2-precio-grupo-no-escala.mjs --dry
//   node apply-put2-precio-grupo-no-escala.mjs
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.APIKEY_N8N || process.env.API_KEY_N8N || process.env.N8N_KEY;
if (!API_KEY) throw new Error("Falta APIKEY_N8N en el entorno");
const DRY = process.argv.includes("--dry");
const EXPECTED_VERSION = "62670389-2ef1-4e3b-bc2e-719bc296225d"; // post-PUT1; rollback target

const OUT_DIR = new URL("./", import.meta.url);

async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) { console.error("ERROR", res.status, JSON.stringify(body, null, 2)); throw new Error(`API ${path} => ${res.status}`); }
  return body;
}
function addConn(c, from, to, fi = 0, ti = 0) {
  c[from] = c[from] || { main: [] };
  while (c[from].main.length <= fi) c[from].main.push([]);
  c[from].main[fi].push({ node: to, type: "main", index: ti });
}
function removeConn(c, from, to, fi) {
  const b = c[from]?.main?.[fi]; if (!b) return false;
  const i = b.findIndex((x) => x.node === to); if (i === -1) return false;
  b.splice(i, 1); return true;
}

// bloque JS que arma la linea de precio del grupo -- se inserta en los 3 parsers.
// `esPrecio` ya tiene que estar declarado (let) y seteado antes de este bloque.
const PRECIO_BLOCK = `
let precioTexto = '';
if (esPrecio) {
  try {
    const gid = $('Parsear Kit Pineado').item.json.grupo_id;
    const g = (($('Buscar Kits Activos').first().json.grupos) || []).find((x) => x.id === gid);
    const vs = (g && g.variantes) || [];
    const conPrecio = vs.filter((v) => v && v.precio != null && Number(v.precio) > 0);
    if (g && conPrecio.length >= 2) {
      const fmt = (n) => '$' + Number(n).toLocaleString('es-AR');
      const lineas = conPrecio.map((v) => '- ' + (v.criterio_variante || 'variante') + ': ' + fmt(v.precio)).join('\\n');
      precioTexto = 'El ' + g.nombre + ' sale:\\n' + lineas + '\\n\\nEnvío gratis a todo el país. Decime cuál necesitás y lo cerramos.';
    } else {
      esPrecio = false; // sin 2 variantes con precio no forzamos -> camino normal
    }
  } catch (e) { esPrecio = false; }
}
`;

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  console.log("workflow:", wf.name, "| nodos:", wf.nodes.length, "| versionId:", wf.versionId);
  if (wf.versionId !== EXPECTED_VERSION) {
    console.warn(`\n  AVISO: versionId ${wf.versionId} != esperado ${EXPECTED_VERSION}\n`);
    if (!DRY) throw new Error("versionId no coincide -- abortado");
  }
  writeFileSync(new URL("./workflow_backup_pre-put2-precio-grupo_2026-08-31.json", OUT_DIR), JSON.stringify(wf, null, 0));

  const c = wf.connections;
  const N = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
  const need = [
    "Extraer Tema Negocio (Grupo)", "Parsear Tema Negocio (Grupo)", "¿Es Negocio? (Grupo)",
    "Extraer Tema Negocio (Variante)", "Parsear Tema Negocio (Variante)", "¿Es Negocio? (Variante)",
    "Extraer Tema Negocio (Esperando Variante)", "Parsear Tema Negocio (Esperando Variante)", "¿Es Negocio? (Esperando Variante)",
    "Config Chatwoot", "Webhook1", "Buscar Kits Activos", "Parsear Kit Pineado",
  ];
  for (const n of need) if (!N[n]) throw new Error(`Falta el nodo "${n}"`);
  const replace1 = (s, a, b) => { if (!s.includes(a)) throw new Error(`ancla no encontrada: ${a.slice(0, 60)}`); return s.split(a).join(b); };

  // ---------- (Grupo) ----------
  {
    const sm = N["Extraer Tema Negocio (Grupo)"].parameters.options;
    let s = sm.systemMessage;
    s = replace1(s, "en UNA sola de estas 4 categorías:", "en UNA sola de estas 5 categorías:");
    s = replace1(s,
      '- "negocio": pregunta real sobre el NEGOCIO en general',
      '- "precio": el cliente pregunta cuánto sale / qué precio / qué valor tiene el COMBO del que venimos hablando (el combo entero, no una pieza suelta). Ej: "precio?", "cuánto cuesta", "qué sale", "valor?".\n- "negocio": pregunta real sobre el NEGOCIO en general');
    s = replace1(s,
      '{"clasificacion": "negocio" o "otro" o "cierre" o "nada", "temas":',
      '{"clasificacion": "negocio" o "precio" o "otro" o "cierre" o "nada", "temas":');
    sm.systemMessage = s;

    const p = N["Parsear Tema Negocio (Grupo)"];
    let j = p.parameters.jsCode;
    j = replace1(j, "if (['negocio', 'otro', 'cierre', 'nada'].includes(parsed.clasificacion)) clasificacion = parsed.clasificacion;",
      "if (['negocio', 'precio', 'otro', 'cierre', 'nada'].includes(parsed.clasificacion)) clasificacion = parsed.clasificacion;");
    j = replace1(j, "return { json: { es_negocio: clasificacion === 'negocio',",
      "let esPrecio = clasificacion === 'precio';" + PRECIO_BLOCK + "\nreturn { json: { es_precio: esPrecio, precio_texto: precioTexto, es_negocio: clasificacion === 'negocio',");
    p.parameters.jsCode = j;
  }

  // ---------- (Variante) ----------
  {
    const sm = N["Extraer Tema Negocio (Variante)"].parameters.options;
    let s = sm.systemMessage;
    s = replace1(s,
      '{"es_negocio": true o false, "tema": "ubicacion|horarios|medios_pago|envios|garantia|otro" o null}',
      '{"es_negocio": true o false, "es_precio": true o false, "tema": "ubicacion|horarios|medios_pago|envios|garantia|otro" o null}');
    s = replace1(s,
      'es_negocio false (con tema null) si no hay ninguna pregunta real sobre el negocio -- solo contesta la variante, hace un comentario, o pregunta otra cosa.',
      'es_negocio false (con tema null) si no hay ninguna pregunta real sobre el negocio -- solo contesta la variante, hace un comentario, o pregunta otra cosa. Marcá es_precio true (aparte, puede ir junto con es_negocio) si el cliente pide el precio/valor del combo (cuánto sale, qué cuesta).');
    sm.systemMessage = s;

    const p = N["Parsear Tema Negocio (Variante)"];
    let j = p.parameters.jsCode;
    j = replace1(j, "  esNegocio = parsed.es_negocio === true;",
      "  esNegocio = parsed.es_negocio === true;\n  esPrecio = parsed.es_precio === true;");
    j = replace1(j, "let esNegocio = false;", "let esNegocio = false;\nlet esPrecio = false;");
    j = replace1(j, "return { json: { es_negocio: esNegocio, tema_sql: escapar(tema) } };",
      PRECIO_BLOCK + "\nreturn { json: { es_precio: esPrecio, precio_texto: precioTexto, es_negocio: esNegocio, tema_sql: escapar(tema) } };");
    p.parameters.jsCode = j;
  }

  // ---------- (Esperando Variante) ----------
  {
    const sm = N["Extraer Tema Negocio (Esperando Variante)"].parameters.options;
    let s = sm.systemMessage;
    s = replace1(s, "Clasificá el resto del mensaje en UNA sola de estas 3 categorías:",
      "Clasificá el resto del mensaje en UNA sola de estas 4 categorías:");
    s = replace1(s,
      '- "negocio": pregunta real sobre el NEGOCIO en general -- envíos, ubicación (incluye el cliente mencionando su propia ciudad/provincia), horarios, medios de pago, garantía.',
      '- "precio": el cliente pregunta cuánto sale / qué precio / qué valor tiene el COMBO del que venimos hablando (el combo entero, no una pieza suelta).\n- "negocio": pregunta real sobre el NEGOCIO en general -- envíos, ubicación (incluye el cliente mencionando su propia ciudad/provincia), horarios, medios de pago, garantía.');
    s = replace1(s,
      '{"clasificacion": "negocio" o "otro" o "nada", "tema":',
      '{"clasificacion": "negocio" o "precio" o "otro" o "nada", "tema":');
    sm.systemMessage = s;

    const p = N["Parsear Tema Negocio (Esperando Variante)"];
    let j = p.parameters.jsCode;
    j = replace1(j, "if (['negocio', 'otro', 'nada'].includes(parsed.clasificacion)) clasificacion = parsed.clasificacion;",
      "if (['negocio', 'precio', 'otro', 'nada'].includes(parsed.clasificacion)) clasificacion = parsed.clasificacion;");
    j = replace1(j, "return { json: { es_negocio: clasificacion === 'negocio', es_otro: clasificacion === 'otro', tema_sql: escapar(tema) } };",
      "let esPrecio = clasificacion === 'precio';" + PRECIO_BLOCK + "\nreturn { json: { es_precio: esPrecio, precio_texto: precioTexto, es_negocio: clasificacion === 'negocio', es_otro: clasificacion === 'otro', tema_sql: escapar(tema) } };");
    p.parameters.jsCode = j;
  }

  // ---------- nodos nuevos ----------
  const ifNode = (name, id, pos) => ({
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [{ id: id + "-c", leftValue: "={{ $json.es_precio }}", rightValue: true, operator: { type: "boolean", operation: "equals" } }],
        combinator: "and",
      },
      options: {},
    },
    id, name, type: "n8n-nodes-base.if", typeVersion: 2.2, position: pos,
  });
  const ifG = ifNode("¿Es Precio? (Grupo)", "b1c2d3e4-espre-grupo-0001", [2820, 2160]);
  const ifV = ifNode("¿Es Precio? (Variante)", "b1c2d3e4-espre-varia-0001", [2100, 3280]);
  const ifE = ifNode("¿Es Precio? (Esperando Variante)", "b1c2d3e4-espre-espv-0001", [3060, 2520]);
  const enviarPrecio = {
    parameters: {
      method: "POST",
      url: "={{ $('Config Chatwoot').item.json.app_url }}/api/chatwoot/enviar",
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: "Authorization", value: "=Bearer {{ $env.N8N_SECRET_TOKEN }}" },
        { name: "Content-Type", value: "application/json" },
      ] },
      sendBody: true, specifyBody: "json",
      jsonBody: "={{ JSON.stringify({ conversation_id: $('Webhook1').first().json.body.conversation.messages[0].conversation_id, account_id: $('Webhook1').first().json.body.account.id, content: $json.precio_texto, origen: 'precio_grupo_2_0', contacto: ($('Webhook1').first().json.body.conversation?.meta?.sender?.name || $('Webhook1').first().json.body.sender?.name || ''), foto_url: null }) }}",
      options: { timeout: 20000 },
    },
    id: "c1d2e3f4-enviar-precio-grupo-01",
    name: "Enviar Precio Grupo",
    type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [3260, 2900],
  };
  const finPrecio = { parameters: {}, id: "d1e2f3a4-fin-precio-grupo-0001", name: "Fin - Precio Grupo Enviado", type: "n8n-nodes-base.noOp", typeVersion: 1, position: [3480, 2900] };
  for (const n of [ifG, ifV, ifE, enviarPrecio, finPrecio]) if (N[n.name]) throw new Error(`ya existe: ${n.name}`);
  wf.nodes.push(ifG, ifV, ifE, enviarPrecio, finPrecio);

  // ---------- rewire ----------
  const rew = (parser, ifNodeName, negocioNode) => {
    if (!removeConn(c, parser, negocioNode, 0)) throw new Error(`${parser}.main[0] ya no -> ${negocioNode}`);
    addConn(c, parser, ifNodeName, 0, 0);
    addConn(c, ifNodeName, "Enviar Precio Grupo", 0, 0); // true
    addConn(c, ifNodeName, negocioNode, 1, 0);           // false
  };
  rew("Parsear Tema Negocio (Grupo)", "¿Es Precio? (Grupo)", "¿Es Negocio? (Grupo)");
  rew("Parsear Tema Negocio (Variante)", "¿Es Precio? (Variante)", "¿Es Negocio? (Variante)");
  rew("Parsear Tema Negocio (Esperando Variante)", "¿Es Precio? (Esperando Variante)", "¿Es Negocio? (Esperando Variante)");
  addConn(c, "Enviar Precio Grupo", "Fin - Precio Grupo Enviado", 0, 0);

  // ---------- validacion estructural ----------
  const names = new Set(wf.nodes.map((n) => n.name));
  const bad = [];
  for (const [from, cfg] of Object.entries(c)) {
    if (!names.has(from)) bad.push(`origen inexistente: ${from}`);
    for (const b of cfg.main || []) for (const cc of b || []) if (!names.has(cc.node)) bad.push(`${from} -> ${cc.node} (inexistente)`);
  }
  if (bad.length) { console.error(bad); throw new Error("conexiones colgadas"); }

  const sk = ["saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder"];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => sk.includes(k)));
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  if (DRY) {
    writeFileSync(new URL("./workflow_put2_resultante_2026-08-31.json", OUT_DIR), JSON.stringify(wf, null, 2));
    console.log("\n[DRY] nodos:", wf.nodes.length, "(era", wf.nodes.length - 5, ")");
    console.log("[DRY] escrito workflow_put2_resultante_2026-08-31.json");
    return;
  }

  const raw = JSON.stringify(body);
  let ascii = "";
  for (let i = 0; i < raw.length; i++) { const cc = raw.charCodeAt(i); ascii += cc > 0x7f ? "\\u" + cc.toString(16).padStart(4, "0") : raw[i]; }
  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: ascii });
  console.log("PUT ok. nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const f = await api(`/workflows/${WORKFLOW_ID}`);
  const fc = f.connections;
  const fN = Object.fromEntries(f.nodes.map((n) => [n.name, n]));
  const checks = [
    ["¿Es Precio? (Grupo) existe", !!fN["¿Es Precio? (Grupo)"]],
    ["¿Es Precio? (Variante) existe", !!fN["¿Es Precio? (Variante)"]],
    ["¿Es Precio? (Esperando Variante) existe", !!fN["¿Es Precio? (Esperando Variante)"]],
    ["Enviar Precio Grupo existe", !!fN["Enviar Precio Grupo"]],
    ["Parsear Tema Negocio (Grupo) -> ¿Es Precio? (Grupo)", fc["Parsear Tema Negocio (Grupo)"].main[0].some((x) => x.node === "¿Es Precio? (Grupo)")],
    ["Parsear Tema Negocio (Grupo) YA NO -> ¿Es Negocio? (Grupo)", !fc["Parsear Tema Negocio (Grupo)"].main[0].some((x) => x.node === "¿Es Negocio? (Grupo)")],
    ["¿Es Precio? (Grupo) true -> Enviar Precio Grupo", fc["¿Es Precio? (Grupo)"].main[0].some((x) => x.node === "Enviar Precio Grupo")],
    ["¿Es Precio? (Grupo) false -> ¿Es Negocio? (Grupo)", fc["¿Es Precio? (Grupo)"].main[1].some((x) => x.node === "¿Es Negocio? (Grupo)")],
    ["¿Es Precio? (Variante) false -> ¿Es Negocio? (Variante)", fc["¿Es Precio? (Variante)"].main[1].some((x) => x.node === "¿Es Negocio? (Variante)")],
    ["¿Es Precio? (Esperando Variante) false -> ¿Es Negocio? (Esperando Variante)", fc["¿Es Precio? (Esperando Variante)"].main[1].some((x) => x.node === "¿Es Negocio? (Esperando Variante)")],
    ["Enviar Precio Grupo -> Fin - Precio Grupo Enviado", fc["Enviar Precio Grupo"].main[0].some((x) => x.node === "Fin - Precio Grupo Enviado")],
    ["Parsear (Grupo) expone es_precio", fN["Parsear Tema Negocio (Grupo)"].parameters.jsCode.includes("precio_texto")],
    ["Parsear (Variante) expone es_precio", fN["Parsear Tema Negocio (Variante)"].parameters.jsCode.includes("precio_texto")],
    ["Parsear (Esp Variante) expone es_precio", fN["Parsear Tema Negocio (Esperando Variante)"].parameters.jsCode.includes("precio_texto")],
  ];
  let ok = true;
  for (const [l, v] of checks) { console.log(v ? "  OK  " : "  FALLA", l); if (!v) ok = false; }
  console.log(ok ? "\nPUT 2 aplicado. Validar con conv 2411." : "\nREVISAR. Rollback: restore version " + EXPECTED_VERSION);
}

main().catch((e) => { console.error(e); process.exit(1); });
