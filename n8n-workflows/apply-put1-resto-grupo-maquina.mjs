// PUT 1 (2026-08-31) del plan PLAN-unificar-resto-grupos.md
// -------------------------------------------------------------------
// Objetivo: que el "resto de la rafaga" de un GRUPO en estado
// `esperando_moto` deje de asumirse siempre como la moto. Ahora ese
// resto entra a la maquina unica de sub-preguntas (Fase 6, la que ya
// usa el kit simple) en vez de ir directo a `Extraer Modelo Grupo`.
//
// Casos reales que arregla (todas plantilla de grupo + pregunta pegada):
//   - conv 3044 (+5493854533780): "...Codo y carbu!!" + "Precio?"  -> hoy escala
//   - conv 3021 (+5493543412906): "...TAPA CDI..." + "es para recorrido corto?"
//   - conv 2981 (+5493815467591): "...TAPA CDI..." + "Cual es el precio" (dia despues)
//
// Alcance PUT 1: SOLO estado `esperando_moto`. Estados esperando_variante /
// universal / con-modelo quedan igual (PUT 2). Las cascadas caseras NO se
// borran todavia (PUT 3) -- este PUT solo desvia el estado 1.
//
// Cambios:
//  A. `Dividir y Etiquetar Sub-preguntas` (prompt): categoria nueva "moto",
//     solo ofrecida cuando `esperando_moto_grupo` es true.
//  B. `Preparar Contexto Sub-preguntas` (code): expone es_grupo, estado_grupo,
//     esperando_moto_grupo, bienvenida_fresca, grupo_bienvenida_texto,
//     grupo_repregunta_texto.
//  C. `Parsear Sub-preguntas` (code): rama nueva para `esperando_moto_grupo`:
//       - hay pedazo "moto"  -> se queda solo con eso (decision #1), el gate
//         `¿Rutear al Extractor de Modelo? (Grupo)` lo deriva a `Extraer Modelo Grupo`.
//       - precio/stock/envio  -> bienvenida fresca: se descarta en silencio;
//                                bienvenida vieja: -> categoria `reenvio_bienvenida`.
//       - negocio             -> pasa a la maquina normal (resuelve o escala).
//       - cierre              -> igual que siempre.
//       - otro                -> bienvenida fresca: se descarta (la bienvenida
//                                recien mandada ya pidio la moto);
//                                bienvenida vieja: se cubre con repregunta_moto.
//       - repregunta sintetica `repregunta_moto` si la bienvenida NO es fresca,
//         no hubo reenvio, y hubo alguna pregunta real.
//     Ademas: un pedazo "moto" fuera de `esperando_moto_grupo` -> se degrada a "otro".
//  D. `Consolidar Dato Resuelto` (code): resuelve `reenvio_bienvenida` con el
//     texto de bienvenida del grupo y `repregunta_moto` con la repregunta.
//  E. `Marcar Resuelto o No Resuelto` (code): esas 2 categorias se mandan
//     TAL CUAL (no pasan por la reescritura IA de `Redactar Respuesta desde Dato`).
//  F. `Armar Mensajes` (code): prioridad para las 2 categorias nuevas.
//  G. nodo nuevo `¿Rutear al Extractor de Modelo? (Grupo)` (If) entre `Parsear Sub-preguntas`
//     y `Separar Pedazos`.
//  H. rewire:
//       - `¿Otro Kit en Resto? (Grupo)` rama false: `Extraer Modelo Grupo` -> `Traer Ultimo Mensaje Nuestro`
//       - `Parsear Sub-preguntas` -> `¿Rutear al Extractor de Modelo? (Grupo)` (antes -> `Separar Pedazos`)
//       - `¿Rutear al Extractor de Modelo? (Grupo)` true -> `Extraer Modelo Grupo`; false -> `Separar Pedazos`
//
// Uso:
//   node apply-put1-resto-grupo-maquina.mjs --dry   (no toca nada, escribe el JSON resultante y el diff)
//   node apply-put1-resto-grupo-maquina.mjs         (PUT real)
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.APIKEY_N8N || process.env.API_KEY_N8N || process.env.N8N_KEY;
if (!API_KEY) throw new Error("Falta APIKEY_N8N en el entorno");
const DRY = process.argv.includes("--dry");
const EXPECTED_VERSION = "099f776a-1e6a-48c8-844c-d83ad3c9d4b3"; // rollback target

const OUT_DIR = new URL("./", import.meta.url);

async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    console.error("ERROR", res.status, JSON.stringify(body, null, 2));
    throw new Error(`API ${path} devolvio ${res.status}`);
  }
  return body;
}

function addConn(connections, from, toNode, fromIndex = 0, toIndex = 0) {
  connections[from] = connections[from] || { main: [] };
  const main = connections[from].main;
  while (main.length <= fromIndex) main.push([]);
  main[fromIndex].push({ node: toNode, type: "main", index: toIndex });
}
function removeConn(connections, from, toNode, fromIndex) {
  const branch = connections[from]?.main?.[fromIndex];
  if (!branch) return false;
  const i = branch.findIndex((x) => x.node === toNode);
  if (i === -1) return false;
  branch.splice(i, 1);
  return true;
}

// ---------- C. Parsear Sub-preguntas ----------
const PARSEAR_SUBPREGUNTAS = `let partes = [];
try {
  const raw = ($json.output || '{}').toString().trim();
  const clean = raw.replace(/\`\`\`json|\`\`\`/g, '').trim();
  const parsed = JSON.parse(clean);
  if (Array.isArray(parsed.partes)) partes = parsed.partes;
} catch (e) {}

const categoriasValidas = ['precio', 'stock', 'envio', 'negocio', 'cierre', 'otro', 'moto'];
const ctx = $('Preparar Contexto Sub-preguntas').item.json;
const kitId = ctx.kit_id;
const kitNombre = ctx.kit_nombre;
const kitRecienConfirmado = ctx.kit_recien_confirmado === true;
const cierreRecienteRaw = ctx.cierre_reciente_raw;
// 2026-08-27: si al cliente ya le dijimos que este mismo kit no es compatible / no lo
// tenemos para su moto, no auto-respondemos precio/stock/detalle de ese kit -> anulamos
// kit_id para que caiga en 'otro' y escale (ver feedback-bot-aliviador-mensajes).
const incompatibleRaw = ctx.incompatible_raw;
let kitBloqueadoPorIncompat = false;
try {
  const pi = typeof incompatibleRaw === 'string' ? JSON.parse(incompatibleRaw) : incompatibleRaw;
  if (pi && pi.grupo_id && kitId && Number(pi.grupo_id) === Number(kitId)) kitBloqueadoPorIncompat = true;
} catch (e) {}
const kitIdEfectivo = kitBloqueadoPorIncompat ? null : kitId;
const escapar = (s) => (s || '').toString().replace(/'/g, "''");

// ===== rama grupo esperando moto (PUT 1, 2026-08-31, plan PLAN-unificar-resto-grupos) =====
// El resto de una rafaga de un grupo que todavia espera la moto ya no se asume
// como la moto. Cae aca. Ver el .mjs de este cambio para el detalle.
if (ctx.esperando_moto_grupo === true) {
  const fresca = ctx.bienvenida_fresca === true;
  const norm = (p) => ({
    texto: ((p && p.texto) || '').toString().trim(),
    categoria: categoriasValidas.includes(p && p.categoria) ? p.categoria : 'otro',
  });
  const npartes = partes.map(norm).filter((p) => p.texto.length > 0 || p.categoria === 'cierre');

  // hay pedazo "moto" -> se procesa SOLO la moto (decision #1). El gate
  // "Hay Pedazo Moto (Grupo)" (ruteo_moto=true) deriva a "Extraer Modelo Grupo",
  // que lee el texto original completo de "Unir Mensajes".
  if (npartes.some((p) => p.categoria === 'moto')) {
    return [{ json: { partes: [], ruteo_moto: true } }];
  }

  const out = [];
  let hayReenvio = false, hayNegocio = false, hayOtro = false;
  for (const p of npartes) {
    if (['precio', 'stock', 'envio'].includes(p.categoria)) {
      if (fresca) continue;                    // bienvenida recien mandada -> ya lo cubre (silencio)
      if (hayReenvio) continue;
      hayReenvio = true;
      out.push({ texto: p.texto, categoria: 'reenvio_bienvenida' }); // la bienvenida ya re-pregunta la moto
    } else if (p.categoria === 'negocio') {
      hayNegocio = true;
      out.push({ texto: p.texto, categoria: 'negocio' });
    } else if (p.categoria === 'cierre') {
      out.push({ texto: p.texto, categoria: 'cierre' });
    } else {
      hayOtro = true; // 'otro' -> ver abajo
    }
  }

  // solo trajo "otro" (ni precio, ni negocio) y la bienvenida no es fresca:
  // darle una chance al extractor de modelo con el texto original (camino viejo,
  // que re-pregunta la moto si no encuentra nada). Si la bienvenida es fresca,
  // el "otro" se descarta en silencio -- la bienvenida recien mandada ya pidio la moto.
  const ruteoMoto = !fresca && hayOtro && !hayNegocio && !hayReenvio;
  if (ruteoMoto) return [{ json: { partes: [], ruteo_moto: true } }];

  // contesto algo (negocio / reenvio) pero seguimos sin la moto -> re-preguntar.
  // (el reenvio de bienvenida ya la pide, no hace falta duplicar)
  if (!fresca && hayNegocio && !hayReenvio) {
    out.push({ texto: '', categoria: 'repregunta_moto' });
  }

  const limpioG = out.map((p) => ({
    ...p, texto_sql: escapar(p.texto), kit_id: null, kit_nombre: kitNombre, cierre_reciente_raw: cierreRecienteRaw,
  }));
  return [{ json: { partes: limpioG, ruteo_moto: false } }];
}
// ===== fin rama grupo esperando moto =====

const limpio = partes
  .map((p) => {
    let categoria = categoriasValidas.includes(p && p.categoria) ? p.categoria : 'otro';
    if (categoria === 'moto') categoria = 'otro'; // 'moto' solo vale en grupo esperando moto
    if (categoria === 'precio' && !kitIdEfectivo) categoria = 'otro';
    if (categoria === 'stock' && !kitIdEfectivo) categoria = 'otro';
    return { texto: ((p && p.texto) || '').toString().trim(), categoria };
  })
  .filter((p) => p.texto.length > 0)
  .filter((p) => !(p.categoria === 'precio' && kitRecienConfirmado))
  .map((p) => ({ ...p, texto_sql: escapar(p.texto), kit_id: kitIdEfectivo, kit_nombre: kitNombre, cierre_reciente_raw: cierreRecienteRaw }));

return [{ json: { partes: limpio, ruteo_moto: false } }];
`;

// ---------- B. Preparar Contexto Sub-preguntas (bloque a insertar antes del return) ----------
const CTX_EXTRA = `
// ===== contexto grupo (PUT 1, 2026-08-31, plan PLAN-unificar-resto-grupos) =====
let esGrupo = false, estadoGrupo = '', grupoId = null;
try {
  const kp = $('Parsear Kit Pineado').item.json;
  esGrupo = kp && kp.es_grupo === true;
  estadoGrupo = (kp && kp.estado) || '';
  grupoId = kp && kp.grupo_id != null ? Number(kp.grupo_id) : null;
} catch (e) {}
const esperandoMotoGrupo = esGrupo && estadoGrupo === 'esperando_moto';

let bienvenidaFresca = false;
for (const nodo of ['Enviar Saludo Grupo', 'Marcar Grupo Pineado (Esperando Moto)', 'Enviar Saludo Grupo (Identificacion)', 'Marcar Grupo Pineado (Identificacion)', 'Guardar Estado Esperando Variante', 'Marcar Grupo Pineado (Candidato Unico)']) {
  try { $(nodo).item; bienvenidaFresca = true; break; } catch (e) {}
}

let grupoNombre = '', grupoBienvenidaTexto = '';
try {
  const grupos = ($('Buscar Kits Activos').first().json.grupos) || [];
  const g = grupos.find((x) => Number(x.id) === grupoId);
  if (g) { grupoNombre = g.nombre || ''; grupoBienvenidaTexto = g.mensaje_bienvenida || ''; }
} catch (e) {}
const grupoRepreguntaTexto = grupoNombre
  ? ('Para qué moto lo estás buscando? Así te confirmo si el ' + grupoNombre + ' te sirve.')
  : 'Para qué moto lo estás buscando?';
// ===== fin contexto grupo =====

`;

// ---------- D. Consolidar Dato Resuelto (bloque a insertar antes del "else" final) ----------
const CONSOLIDAR_EXTRA = `} else if (categoria === 'reenvio_bienvenida') {
  dato = $('Preparar Contexto Sub-preguntas').item.json.grupo_bienvenida_texto || null;
} else if (categoria === 'repregunta_moto') {
  dato = $('Preparar Contexto Sub-preguntas').item.json.grupo_repregunta_texto || null;
`;

// ---------- E. Marcar Resuelto o No Resuelto ----------
const MARCAR_RESUELTO = `const cat = $('Consolidar Dato Resuelto').item.json.categoria;
const datoRaw = ($('Consolidar Dato Resuelto').item.json.dato_texto || '').toString().trim();
// reenvio_bienvenida / repregunta_moto: texto de plantilla, se manda tal cual (no pasa por la reescritura IA)
const passthrough = (cat === 'reenvio_bienvenida' || cat === 'repregunta_moto');
const mensaje = passthrough
  ? ((datoRaw && datoRaw !== 'SIN_DATO') ? datoRaw : '')
  : (($json.output || '').toString().trim());
const omitir = $('Consolidar Dato Resuelto').item.json.omitir === true;
const esCierreNuevo = $('Consolidar Dato Resuelto').item.json.es_cierre_nuevo === true;
const resuelto = omitir ? true : (!!mensaje && mensaje !== 'SIN_DATO');
return { json: {
  texto: $('Consolidar Dato Resuelto').item.json.texto,
  categoria: cat,
  resuelto,
  mensaje: (resuelto && !omitir) ? mensaje : '',
  omitir,
  es_cierre_nuevo: esCierreNuevo,
} };
`;

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  console.log("workflow:", wf.name, "| nodos:", wf.nodes.length, "| versionId:", wf.versionId);
  if (wf.versionId !== EXPECTED_VERSION) {
    console.warn(`\n  AVISO: versionId actual (${wf.versionId}) != esperado (${EXPECTED_VERSION}).`);
    console.warn("  Alguien toco el workflow despues de armar este script. Revisar antes de seguir.\n");
    if (!DRY) throw new Error("versionId no coincide -- abortado por seguridad");
  }
  writeFileSync(new URL("./workflow_backup_pre-put1-resto-grupo_2026-08-31.json", OUT_DIR), JSON.stringify(wf, null, 0));

  const conns = wf.connections;
  const N = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
  const need = [
    "Dividir y Etiquetar Sub-preguntas", "Preparar Contexto Sub-preguntas", "Parsear Sub-preguntas",
    "Consolidar Dato Resuelto", "Marcar Resuelto o No Resuelto", "Armar Mensajes",
    "Separar Pedazos", "Extraer Modelo Grupo", "¿Otro Kit en Resto? (Grupo)", "Traer Ultimo Mensaje Nuestro",
  ];
  for (const n of need) if (!N[n]) throw new Error(`Falta el nodo "${n}"`);

  // ---- A. Dividir y Etiquetar Sub-preguntas: categoria "moto" condicional ----
  const dm = N["Dividir y Etiquetar Sub-preguntas"];
  let sys = dm.parameters.options.systemMessage;
  const anchorLista = 'esta lista cerrada: "precio", "stock", "envio", "negocio", "cierre", "otro".';
  const anchorNegocio = '- "negocio": pregunta sobre el negocio en general -- ubicación, horarios, medios de pago, garantía.';
  const anchorFmt = '{"partes": [{"texto": "...", "categoria": "precio|stock|envio|negocio|cierre|otro"}]}';
  if (!sys.includes(anchorLista) || !sys.includes(anchorNegocio) || !sys.includes(anchorFmt)) {
    throw new Error("Los anclas del prompt de 'Dividir y Etiquetar' cambiaron -- revisar a mano");
  }
  sys = sys.replace(
    anchorLista,
    'esta lista cerrada: "precio", "stock", "envio", "negocio", "cierre", "otro"{{ $json.esperando_moto_grupo ? \', "moto"\' : \'\' }}.'
  );
  sys = sys.replace(
    anchorNegocio,
    anchorNegocio +
    '{{ $json.esperando_moto_grupo ? \'\\n- "moto": el cliente está diciendo para qué moto es el producto -- una marca y/o modelo de moto ("una gilera smash", "zanella zb 110", "para la wave", "la mía es una 110", "tengo una biz"). En esta charla estamos esperando exactamente ese dato, así que "moto" es válido y tiene PRIORIDAD sobre "otro" para cualquier mención de una moto. Cualquier otra pregunta pegada (precio, una pieza, etc.) igual separala en su propia parte.\' : \'\' }}'
  );
  sys = sys.replace(anchorFmt, '{"partes": [{"texto": "...", "categoria": "precio|stock|envio|negocio|cierre|otro|moto"}]}');
  // precio/stock tambien validos cuando esperamos la moto de un grupo (kit_id es null ahi,
  // pero el precio -- corto/largo -- esta en el mensaje de bienvenida del grupo)
  const gateViejo = "$json.kit_id !== null ?";
  const gateNuevo = "($json.kit_id !== null || $json.esperando_moto_grupo) ?";
  const nGate = sys.split(gateViejo).length - 1;
  if (nGate < 2) throw new Error("No encontre los 2 gates de precio/stock en el prompt -- revisar");
  sys = sys.split(gateViejo).join(gateNuevo);
  dm.parameters.options.systemMessage = sys;

  // ---- B. Preparar Contexto Sub-preguntas ----
  const pc = N["Preparar Contexto Sub-preguntas"];
  let pcCode = pc.parameters.jsCode;
  const retAnchor = "return [{ json: { kit_id: kitId, kit_nombre: kitNombre, texto_para_dividir: textoParaDividir,";
  if (!pcCode.includes(retAnchor)) throw new Error("El return de 'Preparar Contexto Sub-preguntas' cambio -- revisar");
  pcCode = pcCode.replace(retAnchor, CTX_EXTRA + retAnchor);
  pcCode = pcCode.replace(
    "cierre_reciente_raw: cierreRecienteRaw, incompatible_raw: incompatibleRaw } }];",
    "cierre_reciente_raw: cierreRecienteRaw, incompatible_raw: incompatibleRaw, es_grupo: esGrupo, estado_grupo: estadoGrupo, esperando_moto_grupo: esperandoMotoGrupo, bienvenida_fresca: bienvenidaFresca, grupo_bienvenida_texto: grupoBienvenidaTexto, grupo_repregunta_texto: grupoRepreguntaTexto } }];"
  );
  pc.parameters.jsCode = pcCode;

  // ---- C. Parsear Sub-preguntas ----
  N["Parsear Sub-preguntas"].parameters.jsCode = PARSEAR_SUBPREGUNTAS;

  // ---- D. Consolidar Dato Resuelto ----
  const cd = N["Consolidar Dato Resuelto"];
  let cdCode = cd.parameters.jsCode;
  const cdAnchor = "} else {\n  let compatModeloPendiente = false;";
  if (!cdCode.includes(cdAnchor)) throw new Error("El 'else' final de 'Consolidar Dato Resuelto' cambio -- revisar");
  cdCode = cdCode.replace(cdAnchor, CONSOLIDAR_EXTRA + cdAnchor);
  cd.parameters.jsCode = cdCode;

  // ---- E. Marcar Resuelto o No Resuelto ----
  N["Marcar Resuelto o No Resuelto"].parameters.jsCode = MARCAR_RESUELTO;

  // ---- F. Armar Mensajes: prioridad ----
  const am = N["Armar Mensajes"];
  let amCode = am.parameters.jsCode;
  const amAnchor = "const prioridad = { precio: 0, stock: 1, envio: 2, negocio: 3, otro: 4 };";
  if (!amCode.includes(amAnchor)) throw new Error("La prioridad de 'Armar Mensajes' cambio -- revisar");
  amCode = amCode.replace(
    amAnchor,
    "const prioridad = { reenvio_bienvenida: 0, precio: 1, stock: 2, envio: 3, negocio: 4, otro: 5, repregunta_moto: 6 };"
  );
  am.parameters.jsCode = amCode;

  // ---- G. nodo nuevo ¿Rutear al Extractor de Modelo? (Grupo) ----
  const ifMoto = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [{
          id: "hay-pedazo-moto-grupo-01",
          leftValue: "={{ $json.ruteo_moto === true }}",
          rightValue: true,
          operator: { type: "boolean", operation: "equals" },
        }],
        combinator: "and",
      },
      options: {},
    },
    id: "f1a2b3c4-hay-pedazo-moto-grupo01",
    name: "¿Rutear al Extractor de Modelo? (Grupo)",
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [9024, -60],
  };
  if (N["¿Rutear al Extractor de Modelo? (Grupo)"]) throw new Error("El nodo '¿Rutear al Extractor de Modelo? (Grupo)' ya existe");
  wf.nodes.push(ifMoto);

  // ---- H. rewire ----
  // H1: ¿Otro Kit en Resto? (Grupo) rama false: Extraer Modelo Grupo -> Traer Ultimo Mensaje Nuestro
  if (!removeConn(conns, "¿Otro Kit en Resto? (Grupo)", "Extraer Modelo Grupo", 1)) {
    throw new Error("¿Otro Kit en Resto? (Grupo).main[1] ya no apunta a 'Extraer Modelo Grupo'");
  }
  addConn(conns, "¿Otro Kit en Resto? (Grupo)", "Traer Ultimo Mensaje Nuestro", 1, 0);

  // H2: Parsear Sub-preguntas -> ¿Rutear al Extractor de Modelo? (Grupo)  (antes -> Separar Pedazos)
  if (!removeConn(conns, "Parsear Sub-preguntas", "Separar Pedazos", 0)) {
    throw new Error("Parsear Sub-preguntas.main[0] ya no apunta a 'Separar Pedazos'");
  }
  addConn(conns, "Parsear Sub-preguntas", "¿Rutear al Extractor de Modelo? (Grupo)", 0, 0);

  // H3: ¿Rutear al Extractor de Modelo? (Grupo) true -> Extraer Modelo Grupo ; false -> Separar Pedazos
  addConn(conns, "¿Rutear al Extractor de Modelo? (Grupo)", "Extraer Modelo Grupo", 0, 0);
  addConn(conns, "¿Rutear al Extractor de Modelo? (Grupo)", "Separar Pedazos", 1, 0);

  // ---- validacion estructural ----
  const names = new Set(wf.nodes.map((n) => n.name));
  const dangling = [];
  for (const [from, cfg] of Object.entries(conns)) {
    if (!names.has(from)) dangling.push(`origen inexistente: ${from}`);
    for (const branch of cfg.main || []) for (const c of branch || []) {
      if (!names.has(c.node)) dangling.push(`${from} -> destino inexistente: ${c.node}`);
    }
  }
  if (dangling.length) { console.error(dangling); throw new Error("conexiones colgadas"); }

  const settingsKeys = ["saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder"];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => settingsKeys.includes(k)));
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  if (DRY) {
    writeFileSync(new URL("./workflow_put1_resultante_2026-08-31.json", OUT_DIR), JSON.stringify(wf, null, 2));
    console.log("\n[DRY] no se toco nada. JSON resultante escrito a workflow_put1_resultante_2026-08-31.json");
    console.log("[DRY] nodos:", wf.nodes.length, "(era", wf.nodes.length - 1, ")");
    for (const n of ["Dividir y Etiquetar Sub-preguntas", "Preparar Contexto Sub-preguntas", "Parsear Sub-preguntas", "Consolidar Dato Resuelto", "Marcar Resuelto o No Resuelto", "Armar Mensajes"]) {
      console.log("  modificado:", n);
    }
    console.log("  nodo nuevo: ¿Rutear al Extractor de Modelo? (Grupo)");
    return;
  }

  const rawBody = JSON.stringify(body);
  let asciiBody = "";
  for (let i = 0; i < rawBody.length; i++) {
    const code = rawBody.charCodeAt(i);
    asciiBody += code > 0x7f ? "\\u" + code.toString(16).padStart(4, "0") : rawBody[i];
  }
  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: asciiBody });
  console.log("PUT ok. nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const fresh = await api(`/workflows/${WORKFLOW_ID}`);
  const c = fresh.connections;
  const fN = Object.fromEntries(fresh.nodes.map((n) => [n.name, n]));
  const checks = [
    ["nodo ¿Rutear al Extractor de Modelo? (Grupo) existe", !!fN["¿Rutear al Extractor de Modelo? (Grupo)"]],
    ["Parsear Sub-preguntas -> ¿Rutear al Extractor de Modelo? (Grupo)", c["Parsear Sub-preguntas"].main[0].some((x) => x.node === "¿Rutear al Extractor de Modelo? (Grupo)")],
    ["Parsear Sub-preguntas YA NO -> Separar Pedazos", !c["Parsear Sub-preguntas"].main[0].some((x) => x.node === "Separar Pedazos")],
    ["¿Rutear al Extractor de Modelo? (Grupo) true -> Extraer Modelo Grupo", c["¿Rutear al Extractor de Modelo? (Grupo)"].main[0].some((x) => x.node === "Extraer Modelo Grupo")],
    ["¿Rutear al Extractor de Modelo? (Grupo) false -> Separar Pedazos", c["¿Rutear al Extractor de Modelo? (Grupo)"].main[1].some((x) => x.node === "Separar Pedazos")],
    ["¿Otro Kit en Resto? (Grupo) false -> Traer Ultimo Mensaje Nuestro", c["¿Otro Kit en Resto? (Grupo)"].main[1].some((x) => x.node === "Traer Ultimo Mensaje Nuestro")],
    ["¿Otro Kit en Resto? (Grupo) false YA NO -> Extraer Modelo Grupo", !c["¿Otro Kit en Resto? (Grupo)"].main[1].some((x) => x.node === "Extraer Modelo Grupo")],
    ["Parsear Sub-preguntas tiene la rama grupo", fN["Parsear Sub-preguntas"].parameters.jsCode.includes("esperando_moto_grupo")],
    ["Preparar Contexto expone esperando_moto_grupo", fN["Preparar Contexto Sub-preguntas"].parameters.jsCode.includes("esperando_moto_grupo: esperandoMotoGrupo")],
    ["Consolidar resuelve reenvio_bienvenida", fN["Consolidar Dato Resuelto"].parameters.jsCode.includes("reenvio_bienvenida")],
  ];
  let ok = true;
  for (const [l, v] of checks) { console.log(v ? "  OK  " : "  FALLA", l); if (!v) ok = false; }
  console.log(ok ? "\nPUT 1 aplicado. Validar ahora con conv 2411 (bot apagado)." : "\nREVISAR -- algo no quedo bien. Rollback: restore_workflow_version " + EXPECTED_VERSION);
}

main().catch((e) => { console.error(e); process.exit(1); });
