// PUT 2b (2026-08-31) -- cierre de pendientes de la sesion del plan
// PLAN-unificar-resto-grupos.md.
// -------------------------------------------------------------------
// 1. TOPE DE REINTENTOS en el camino nuevo de PUT 1 (grupo esperando la moto).
//    Hoy, si el cliente pregunta cosas y nunca da la moto, el bot le contesta
//    (precio / bienvenida / negocio) + re-pregunta la moto SIN LIMITE. El
//    camino viejo escalaba tras 2 vueltas. Ahora: contador en Redis
//    (`resto_grupo_intentos:{tel}`, TTL 24h); tras 3 "nudges"
//    (reenvio_bienvenida / repregunta_moto), la 4ta vez escala al equipo en
//    vez de seguir.
//    - nodo nuevo `Leer Reintentos Resto (Grupo)` (Redis GET) en el front-chain
//      de la maquina, entre `Leer Incompatibilidad Reciente (Rafaga)` y
//      `Preparar Contexto Sub-preguntas`.
//    - `Preparar Contexto Sub-preguntas` expone `reintentos_resto_grupo` (num).
//    - `Parsear Sub-preguntas` (rama grupo esperando moto): si
//      reintentos >= 3 y la salida seria un nudge -> una sola pieza
//      `escalar_grupo` (que la maquina deja sin resolver -> escala).
//    - nodo nuevo `¿Nudge Resto Grupo? (contar)` (If) + `Sumar Reintento Resto
//      (Grupo)` (Redis INCR, side-effect) entre `Parsear Sub-preguntas` y
//      `¿Rutear al Extractor de Modelo? (Grupo)`.
//    - `Consolidar Dato Resuelto`: `escalar_grupo` -> dato null (SIN_DATO).
//
// 2. DEDUP de precio (PUT 2): si las 2 variantes de un grupo tienen el mismo
//    precio (ej. Escape pwr + Leva, ambos $125.000), la linea de precio muestra
//    "sale $X" una sola vez en vez de repetir el mismo numero 2 veces.
//    Toca los 3 `Parsear Tema Negocio (Grupo)/(Variante)/(Esperando Variante)`.
//
// Uso:
//   node apply-put2b-tope-reintentos-y-dedup-precio.mjs --dry
//   node apply-put2b-tope-reintentos-y-dedup-precio.mjs
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.APIKEY_N8N || process.env.API_KEY_N8N || process.env.N8N_KEY;
if (!API_KEY) throw new Error("Falta APIKEY_N8N en el entorno");
const DRY = process.argv.includes("--dry");
const EXPECTED_VERSION = "cb6d0475-333e-4f4e-bf21-e67ffa4bd9fe"; // post-PUT2; rollback target
const REDIS_CRED = { redis: { id: "ZUlkjSz8R2bmmO2f", name: "Redis account 2" } };
const OUT_DIR = new URL("./", import.meta.url);
const PHONE_KEY = "{{ ($('Webhook1').item.json.body.conversation.messages[0].sender.phone_number || ('conv-' + $('Webhook1').item.json.body.conversation.messages[0].conversation_id)) }}";

async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, { ...options, headers: { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json", ...(options.headers || {}) } });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) { console.error("ERROR", res.status, JSON.stringify(body, null, 2)); throw new Error(`API ${path} => ${res.status}`); }
  return body;
}
function addConn(c, from, to, fi = 0, ti = 0) { c[from] = c[from] || { main: [] }; while (c[from].main.length <= fi) c[from].main.push([]); c[from].main[fi].push({ node: to, type: "main", index: ti }); }
function removeConn(c, from, to, fi) { const b = c[from]?.main?.[fi]; if (!b) return false; const i = b.findIndex((x) => x.node === to); if (i === -1) return false; b.splice(i, 1); return true; }
const rep = (s, a, b) => { if (!s.includes(a)) throw new Error(`ancla no encontrada: ${a.slice(0, 70)}`); return s.split(a).join(b); };

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  console.log("workflow:", wf.name, "| nodos:", wf.nodes.length, "| versionId:", wf.versionId);
  if (wf.versionId !== EXPECTED_VERSION) { console.warn(`\n  AVISO: versionId ${wf.versionId} != esperado ${EXPECTED_VERSION}\n`); if (!DRY) throw new Error("versionId no coincide"); }
  writeFileSync(new URL("./workflow_backup_pre-put2b_2026-08-31.json", OUT_DIR), JSON.stringify(wf, null, 0));

  const c = wf.connections;
  const N = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
  for (const n of ["Leer Incompatibilidad Reciente (Rafaga)", "Preparar Contexto Sub-preguntas", "Parsear Sub-preguntas",
    "¿Rutear al Extractor de Modelo? (Grupo)", "Consolidar Dato Resuelto", "Webhook1",
    "Parsear Tema Negocio (Grupo)", "Parsear Tema Negocio (Variante)", "Parsear Tema Negocio (Esperando Variante)"]) {
    if (!N[n]) throw new Error(`Falta el nodo "${n}"`);
  }

  // ---- 1a. nodos nuevos del contador ----
  const leerReintentos = {
    parameters: { operation: "get", propertyName: "resto_grupo_intentos_raw", key: `=resto_grupo_intentos:${PHONE_KEY}`, options: {} },
    id: "e1f2a3b4-leer-reint-resto-grp01", name: "Leer Reintentos Resto (Grupo)",
    type: "n8n-nodes-base.redis", typeVersion: 1, position: [8130, -110], credentials: REDIS_CRED,
  };
  const ifNudge = {
    parameters: {
      conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [{ id: "nudge-resto-grp-c", leftValue: "={{ ($json.partes || []).some(p => p && (p.categoria === 'reenvio_bienvenida' || p.categoria === 'repregunta_moto')) }}", rightValue: true, operator: { type: "boolean", operation: "equals" } }],
        combinator: "and" }, options: {},
    },
    id: "e1f2a3b4-nudge-resto-grp-if01", name: "¿Nudge Resto Grupo? (contar)",
    type: "n8n-nodes-base.if", typeVersion: 2.2, position: [9024, 60],
  };
  const sumarReintento = {
    parameters: { operation: "incr", key: `=resto_grupo_intentos:${PHONE_KEY}`, expire: true, ttl: 86400 },
    id: "e1f2a3b4-sumar-reint-resto-g01", name: "Sumar Reintento Resto (Grupo)",
    type: "n8n-nodes-base.redis", typeVersion: 1, position: [9024, 240], credentials: REDIS_CRED,
  };
  for (const n of [leerReintentos, ifNudge, sumarReintento]) if (N[n.name]) throw new Error(`ya existe: ${n.name}`);
  wf.nodes.push(leerReintentos, ifNudge, sumarReintento);

  // ---- 1b. Preparar Contexto Sub-preguntas: exponer reintentos_resto_grupo ----
  {
    const p = N["Preparar Contexto Sub-preguntas"];
    let j = p.parameters.jsCode;
    j = rep(j, "return [{ json: { kit_id: kitId,",
      "let reintentosRestoGrupo = 0;\ntry { reintentosRestoGrupo = Number($('Leer Reintentos Resto (Grupo)').item.json.resto_grupo_intentos_raw) || 0; } catch (e) {}\n\nreturn [{ json: { reintentos_resto_grupo: reintentosRestoGrupo, kit_id: kitId,");
    p.parameters.jsCode = j;
  }

  // ---- 1c. Parsear Sub-preguntas: tope de reintentos ----
  {
    const p = N["Parsear Sub-preguntas"];
    let j = p.parameters.jsCode;
    j = rep(j,
      "  const limpioG = out.map((p) => ({\n    ...p, texto_sql: escapar(p.texto), kit_id: null, kit_nombre: kitNombre, cierre_reciente_raw: cierreRecienteRaw,\n  }));\n  return [{ json: { partes: limpioG, ruteo_moto: false } }];",
      "  // tope de reintentos (PUT 2b): tras 3 nudges (reenvio_bienvenida / repregunta_moto)\n" +
      "  // sin la moto, la 4ta vez escalamos al equipo en vez de seguir contestando en loop.\n" +
      "  const nudge = out.some((p) => p.categoria === 'reenvio_bienvenida' || p.categoria === 'repregunta_moto');\n" +
      "  if (nudge && Number(ctx.reintentos_resto_grupo || 0) >= 3) {\n" +
      "    const t = npartes.map((p) => p.texto).filter(Boolean).join(' / ') || 'consulta sin la moto';\n" +
      "    return [{ json: { partes: [{ texto: t, categoria: 'escalar_grupo', texto_sql: escapar(t), kit_id: null, kit_nombre: kitNombre, cierre_reciente_raw: cierreRecienteRaw }], ruteo_moto: false } }];\n" +
      "  }\n\n" +
      "  const limpioG = out.map((p) => ({\n    ...p, texto_sql: escapar(p.texto), kit_id: null, kit_nombre: kitNombre, cierre_reciente_raw: cierreRecienteRaw,\n  }));\n  return [{ json: { partes: limpioG, ruteo_moto: false } }];");
    p.parameters.jsCode = j;
  }

  // ---- 1d. Consolidar Dato Resuelto: escalar_grupo -> SIN_DATO ----
  {
    const p = N["Consolidar Dato Resuelto"];
    let j = p.parameters.jsCode;
    j = rep(j, "} else if (categoria === 'repregunta_moto') {\n  dato = $('Preparar Contexto Sub-preguntas').item.json.grupo_repregunta_texto || null;\n}",
      "} else if (categoria === 'repregunta_moto') {\n  dato = $('Preparar Contexto Sub-preguntas').item.json.grupo_repregunta_texto || null;\n} else if (categoria === 'escalar_grupo') {\n  dato = null; // tope de reintentos -> se escala\n}");
    p.parameters.jsCode = j;
  }

  // ---- 1e. rewire del contador ----
  if (!removeConn(c, "Leer Incompatibilidad Reciente (Rafaga)", "Preparar Contexto Sub-preguntas", 0)) throw new Error("Leer Incompat ya no -> Preparar Contexto");
  addConn(c, "Leer Incompatibilidad Reciente (Rafaga)", "Leer Reintentos Resto (Grupo)", 0, 0);
  addConn(c, "Leer Reintentos Resto (Grupo)", "Preparar Contexto Sub-preguntas", 0, 0);

  if (!removeConn(c, "Parsear Sub-preguntas", "¿Rutear al Extractor de Modelo? (Grupo)", 0)) throw new Error("Parsear Sub-preguntas ya no -> ¿Rutear...");
  addConn(c, "Parsear Sub-preguntas", "¿Nudge Resto Grupo? (contar)", 0, 0);
  addConn(c, "¿Nudge Resto Grupo? (contar)", "Sumar Reintento Resto (Grupo)", 0, 0);          // true -> side-effect
  addConn(c, "¿Nudge Resto Grupo? (contar)", "¿Rutear al Extractor de Modelo? (Grupo)", 0, 0); // true -> sigue
  addConn(c, "¿Nudge Resto Grupo? (contar)", "¿Rutear al Extractor de Modelo? (Grupo)", 1, 0); // false -> sigue

  // ---- 2. dedup de precio en los 3 Parsear Tema Negocio ----
  const OLD_BLOCK =
    "    if (g && conPrecio.length >= 2) {\n" +
    "      const fmt = (n) => '$' + Number(n).toLocaleString('es-AR');\n" +
    "      const lineas = conPrecio.map((v) => '- ' + (v.criterio_variante || 'variante') + ': ' + fmt(v.precio)).join('\\n');\n" +
    "      precioTexto = 'El ' + g.nombre + ' sale:\\n' + lineas + '\\n\\nEnvío gratis a todo el país. Decime cuál necesitás y lo cerramos.';\n" +
    "    } else {";
  const NEW_BLOCK =
    "    if (g && conPrecio.length >= 2) {\n" +
    "      const fmt = (n) => '$' + Number(n).toLocaleString('es-AR');\n" +
    "      const precios = [...new Set(conPrecio.map((v) => Number(v.precio)))];\n" +
    "      if (precios.length === 1) {\n" +
    "        precioTexto = 'El ' + g.nombre + ' sale ' + fmt(precios[0]) + '. Envío gratis a todo el país. Avisame si te interesa y coordinamos.';\n" +
    "      } else {\n" +
    "        const lineas = conPrecio.map((v) => '- ' + (v.criterio_variante || 'variante') + ': ' + fmt(v.precio)).join('\\n');\n" +
    "        precioTexto = 'El ' + g.nombre + ' sale:\\n' + lineas + '\\n\\nEnvío gratis a todo el país. Decime cuál necesitás y lo cerramos.';\n" +
    "      }\n" +
    "    } else {";
  for (const nm of ["Parsear Tema Negocio (Grupo)", "Parsear Tema Negocio (Variante)", "Parsear Tema Negocio (Esperando Variante)"]) {
    N[nm].parameters.jsCode = rep(N[nm].parameters.jsCode, OLD_BLOCK, NEW_BLOCK);
  }

  // ---- validacion ----
  const names = new Set(wf.nodes.map((n) => n.name));
  const bad = [];
  for (const [from, cfg] of Object.entries(c)) { if (!names.has(from)) bad.push(`origen: ${from}`); for (const b of cfg.main || []) for (const cc of b || []) if (!names.has(cc.node)) bad.push(`${from} -> ${cc.node}`); }
  if (bad.length) { console.error(bad); throw new Error("conexiones colgadas"); }

  const sk = ["saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder"];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => sk.includes(k)));
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  if (DRY) {
    writeFileSync(new URL("./workflow_put2b_resultante_2026-08-31.json", OUT_DIR), JSON.stringify(wf, null, 2));
    console.log("\n[DRY] nodos:", wf.nodes.length, "(era", wf.nodes.length - 3, ")");
    return;
  }
  const raw = JSON.stringify(body);
  let ascii = ""; for (let i = 0; i < raw.length; i++) { const cc = raw.charCodeAt(i); ascii += cc > 0x7f ? "\\u" + cc.toString(16).padStart(4, "0") : raw[i]; }
  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: ascii });
  console.log("PUT ok. nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const f = await api(`/workflows/${WORKFLOW_ID}`);
  const fc = f.connections, fN = Object.fromEntries(f.nodes.map((n) => [n.name, n]));
  const checks = [
    ["Leer Reintentos Resto (Grupo) existe", !!fN["Leer Reintentos Resto (Grupo)"]],
    ["¿Nudge Resto Grupo? (contar) existe", !!fN["¿Nudge Resto Grupo? (contar)"]],
    ["Sumar Reintento Resto (Grupo) existe", !!fN["Sumar Reintento Resto (Grupo)"]],
    ["Leer Incompat -> Leer Reintentos Resto (Grupo)", fc["Leer Incompatibilidad Reciente (Rafaga)"].main[0].some((x) => x.node === "Leer Reintentos Resto (Grupo)")],
    ["Leer Reintentos -> Preparar Contexto", fc["Leer Reintentos Resto (Grupo)"].main[0].some((x) => x.node === "Preparar Contexto Sub-preguntas")],
    ["Parsear Sub-preguntas -> ¿Nudge Resto Grupo?", fc["Parsear Sub-preguntas"].main[0].some((x) => x.node === "¿Nudge Resto Grupo? (contar)")],
    ["¿Nudge? true -> Sumar Reintento", fc["¿Nudge Resto Grupo? (contar)"].main[0].some((x) => x.node === "Sumar Reintento Resto (Grupo)")],
    ["¿Nudge? true -> ¿Rutear...", fc["¿Nudge Resto Grupo? (contar)"].main[0].some((x) => x.node === "¿Rutear al Extractor de Modelo? (Grupo)")],
    ["¿Nudge? false -> ¿Rutear...", fc["¿Nudge Resto Grupo? (contar)"].main[1].some((x) => x.node === "¿Rutear al Extractor de Modelo? (Grupo)")],
    ["Preparar Contexto expone reintentos_resto_grupo", fN["Preparar Contexto Sub-preguntas"].parameters.jsCode.includes("reintentos_resto_grupo")],
    ["Parsear Sub-preguntas tiene escalar_grupo", fN["Parsear Sub-preguntas"].parameters.jsCode.includes("escalar_grupo")],
    ["Consolidar maneja escalar_grupo", fN["Consolidar Dato Resuelto"].parameters.jsCode.includes("escalar_grupo")],
    ["dedup precio en Parsear Tema Negocio (Variante)", fN["Parsear Tema Negocio (Variante)"].parameters.jsCode.includes("precios.length === 1")],
  ];
  let ok = true;
  for (const [l, v] of checks) { console.log(v ? "  OK  " : "  FALLA", l); if (!v) ok = false; }
  console.log(ok ? "\nPUT 2b aplicado." : "\nREVISAR. Rollback: restore version " + EXPECTED_VERSION);
}
main().catch((e) => { console.error(e); process.exit(1); });
