// Grupo esperando la moto: el cliente que adelanta la variante (corto/largo) ANTES de dar
// la moto ya no pierde ese dato, y una pregunta de pieza pegada en la rafaga ya no se
// descarta en silencio.
// -----------------------------------------------------------------------------------------------
// Caso real: conv 3166 (+5492224553988, "Esteban"). Plantilla del grupo "Combo 110 a 120 +
// Codo y carbu" -> bienvenida con los 2 precios + "para que moto?". Rafaga del cliente:
//   1) "ando buscando recorrido corto"   2) "como seria la entrega"   3) "leva de calle 6.5 tienen"
// El bot contesto SOLO el envio y volvio a preguntar la moto. Se perdio:
//   - la eleccion de variante ("recorrido corto") -> cuando de la moto y confirme compat, el
//     bot le va a volver a preguntar corto/largo (dato que ya dio).
//   - "leva de calle 6.5" -> cayo en "otro", se fusiono con el pedazo anterior y se descarto
//     junto con el; al ser grupo esperando moto no escalo. Lo contesto el equipo a mano.
// Ejecucion n8n #93119.
//
// Fixes:
//  1) Categoria nueva "variante" en `Dividir y Etiquetar Sub-preguntas` (solo cuando
//     esperando_moto_grupo, igual que "moto"). Cuando el cliente adelanta corto/largo,
//     `Parsear Sub-preguntas` lo resuelve a un pack_id (match por criterio_variante, sin IA)
//     y lo guarda en Redis (`variante_anticipada:{tel}`, TTL 96h, {grupo_id, pack_id}).
//  2) Consumo: en la rama "compat OK" del grupo, antes de `Resolver Variante Anticipada` se
//     lee esa clave; `Parsear Variante Anticipada` la usa como fallback cuando la IA no
//     encontro variante en el mensaje actual -> `¿Variante Anticipada Resuelta?` = true ->
//     manda directo la bienvenida del pack, sin re-preguntar. Se borra la clave al usarla.
//  3) `Parsear Sub-preguntas` (rama grupo esperando moto): los pedazos "otro" que quedan
//     cuando ademas se esta contestando algo (envio/negocio/reenvio) YA NO se descartan ->
//     se suman a la salida y escalan al equipo. El camino "otro"-solo (chance al extractor
//     de modelo) queda igual.
//  4) `grupo_repregunta_texto` en `Preparar Contexto Sub-preguntas`: saca el nombre interno
//     del kit ("...si el Kit 120 para 110 te sirve") -> "...si te sirve".
//
// 3 nodos nuevos (455 -> 458): ¿Capturo Variante Anticipada? (Grupo) [If],
// Guardar Variante Anticipada (Grupo) [Redis set, dead-end], Leer Variante Anticipada (Grupo)
// [Redis get], Borrar Variante Anticipada (Grupo) [Redis delete]  => en realidad 4 (455 -> 459).
//
// Uso:
//   node apply-variante-anticipada-grupo-espera-moto.mjs --dry
//   node apply-variante-anticipada-grupo-espera-moto.mjs
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
    if (wf.nodes && wf.nodes.length >= 455) return wf;
    console.log(`  (GET devolvio ${wf.nodes && wf.nodes.length} nodos - cache stale, reintento ${i + 1})`);
  }
  throw new Error("el GET siempre devolvio una version vieja del workflow");
}

function cryptoRandomId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; const v = c === "x" ? r : (r & 0x3) | 0x8; return v.toString(16);
  });
}

function replaceOnce(haystack, needle, replacement, label) {
  const i = haystack.indexOf(needle);
  if (i === -1) throw new Error(`No encontre el texto a reemplazar: ${label}`);
  if (haystack.indexOf(needle, i + needle.length) !== -1) throw new Error(`Texto ambiguo (aparece 2+ veces): ${label}`);
  return haystack.slice(0, i) + replacement + haystack.slice(i + needle.length);
}

const PHONE_KEY = `{{ ($('Webhook1').item.json.body.conversation.messages[0].sender.phone_number || ('conv-' + $('Webhook1').item.json.body.conversation.messages[0].conversation_id)) }}`;

const NEW_GRUPO_BRANCH = `// ===== rama grupo esperando moto (PUT 1, 2026-08-31; variante anticipada 2026-09-01) =====
// El resto de una rafaga de un grupo que todavia espera la moto ya no se asume como la moto.
// Cae aca. Ver los .mjs de estos cambios para el detalle.
if (ctx.esperando_moto_grupo === true) {
  const fresca = ctx.bienvenida_fresca === true;
  const catsGrupo = ['precio', 'stock', 'envio', 'negocio', 'cierre', 'otro', 'moto', 'variante'];
  const norm = (p) => ({
    texto: ((p && p.texto) || '').toString().trim(),
    categoria: catsGrupo.includes(p && p.categoria) ? p.categoria : 'otro',
  });
  const npartes = partes.map(norm).filter((p) => p.texto.length > 0 || p.categoria === 'cierre');

  // hay pedazo "moto" -> se procesa SOLO la moto (decision #1). Si en la MISMA rafaga vino
  // tambien la variante, "Resolver Variante Anticipada" (rio abajo, tras confirmar compat)
  // la levanta del texto completo -- no hace falta persistirla aca.
  if (npartes.some((p) => p.categoria === 'moto')) {
    return [{ json: { partes: [], ruteo_moto: true } }];
  }

  // 2026-09-01 (conv 3166): el cliente adelanto la variante (corto/largo) ANTES de dar la
  // moto. La resolvemos a un pack_id (sin IA, match por criterio_variante) y la guardamos
  // en Redis para saltear la pregunta de variante cuando confirme la moto.
  let varPackId = null, varGrupoId = null;
  const varPieza = npartes.find((p) => p.categoria === 'variante');
  if (varPieza) {
    try {
      const grupoIdPin = Number((($('Parsear Kit Pineado').item.json) || {}).grupo_id);
      const grupos = ($('Buscar Kits Activos').first().json.grupos) || [];
      const g = grupos.find((x) => Number(x.id) === grupoIdPin);
      const variantes = (g && g.variantes) || [];
      const t = varPieza.texto.toLowerCase();
      let match = variantes.find((v) => {
        const crit = (v.criterio_variante || '').toLowerCase();
        return crit && crit.split(/[^a-zñ]+/).some((w) => w.length >= 4 && t.includes(w));
      });
      if (!match && (/\\bcorto\\b|\\bcorta\\b/.test(t))) match = variantes.find((v) => /corto|corta/i.test(v.criterio_variante || ''));
      if (!match && (/\\blargo\\b|\\blarga\\b/.test(t))) match = variantes.find((v) => /largo|larga/i.test(v.criterio_variante || ''));
      if (match && variantes.length >= 2) { varPackId = Number(match.id); varGrupoId = Number(g.id); }
    } catch (e) {}
  }
  const vantic = { variante_anticipada_pack_id: varPackId, variante_anticipada_grupo_id: varGrupoId };

  const out = [];
  const otros = [];
  let hayReenvio = false, hayNegocio = false, hayEnvio = false, hayOtro = false;
  for (const p of npartes) {
    if (p.categoria === 'variante') {
      continue; // ya capturada arriba, no genera respuesta al cliente
    } else if (p.categoria === 'envio') {
      hayEnvio = true;
      out.push({ texto: p.texto, categoria: 'envio' });
    } else if (['precio', 'stock'].includes(p.categoria)) {
      if (fresca) continue;
      if (hayReenvio) continue;
      hayReenvio = true;
      out.push({ texto: p.texto, categoria: 'reenvio_bienvenida' });
    } else if (p.categoria === 'negocio') {
      hayNegocio = true;
      out.push({ texto: p.texto, categoria: 'negocio' });
    } else if (p.categoria === 'cierre') {
      out.push({ texto: p.texto, categoria: 'cierre' });
    } else {
      hayOtro = true;
      otros.push({ texto: p.texto, categoria: 'otro' });
    }
  }

  // "otro"-solo y bienvenida no fresca -> chance al extractor de modelo con el texto
  // original (camino viejo, re-pregunta la moto si no encuentra nada). Si es fresca, se
  // descarta en silencio (la bienvenida recien mandada ya pidio la moto).
  const ruteoMoto = !fresca && hayOtro && !hayNegocio && !hayEnvio && !hayReenvio && out.length === 0;
  if (ruteoMoto) return [{ json: { partes: [], ruteo_moto: true, ...vantic } }];

  // 2026-09-01 (conv 3166): si ya estamos contestando algo (envio/negocio/reenvio), los
  // pedazos "otro" que quedaron (ej. "leva de calle 6.5 tienen?") NO se descartan -> se
  // suman a la salida y escalan al equipo.
  if (out.length > 0) out.push(...otros);

  // contesto algo (negocio / envio) pero seguimos sin la moto -> re-preguntar.
  if (!fresca && (hayNegocio || hayEnvio) && !hayReenvio) {
    out.push({ texto: '', categoria: 'repregunta_moto' });
  }
  // el cliente SOLO adelanto la variante (nada mas) y la bienvenida no es fresca -> igual
  // falta la moto, se la volvemos a pedir.
  if (!fresca && varPieza && out.length === 0 && !hayOtro) {
    out.push({ texto: '', categoria: 'repregunta_moto' });
  }

  // tope de reintentos (PUT 2b): tras 3 nudges sin la moto, la 4ta vez escala al equipo.
  const nudge = out.some((p) => p.categoria === 'reenvio_bienvenida' || p.categoria === 'repregunta_moto');
  if (nudge && Number(ctx.reintentos_resto_grupo || 0) >= 3) {
    const t = npartes.map((p) => p.texto).filter(Boolean).join(' / ') || 'consulta sin la moto';
    return [{ json: { partes: [{ texto: t, categoria: 'escalar_grupo', texto_sql: escapar(t), kit_id: null, kit_nombre: kitNombre, cierre_reciente_raw: cierreRecienteRaw }], ruteo_moto: false, ...vantic } }];
  }

  const limpioG = out.map((p) => ({
    ...p, texto_sql: escapar(p.texto), kit_id: null, kit_nombre: kitNombre, cierre_reciente_raw: cierreRecienteRaw,
  }));
  return [{ json: { partes: limpioG, ruteo_moto: false, ...vantic } }];
}
// ===== fin rama grupo esperando moto =====`;

const NEW_PARSEAR_VARIANTE_ANTICIPADA = `// 2026-08-22: mismo parseo que "Parsear Resolver Variante", instancia aislada para la
// rama "esperando moto" (ver conv 1097). No se reusa el nodo compartido porque su salida
// false va a "Enviar Repregunta Variante" ("ya te pregunte y no entendi"), que no aplica
// aca (todavia no se pregunto nada).
let packId = null;
const grupoId = $('Parsear Kit Pineado').item.json.grupo_id;
const variantes = (($('Buscar Kits Activos').item.json.grupos || []).find((g) => g.id === grupoId)?.variantes) || [];
const idsValidos = new Set(variantes.map((v) => v.id));
try {
  const raw = ($json.output || '{}').toString().trim();
  const clean = raw.replace(/\`\`\`json|\`\`\`/g, '').trim();
  const parsed = JSON.parse(clean);
  const id = Number(parsed.pack_id);
  if (idsValidos.has(id)) packId = id;
} catch (e) {}

// 2026-09-01 (conv 3166): fallback -- el cliente adelanto la variante en un turno ANTERIOR
// (antes de dar la moto). "Parsear Sub-preguntas" la guardo en Redis.
if (packId === null) {
  try {
    const raw = $('Leer Variante Anticipada (Grupo)').item.json.variante_anticipada_raw;
    const stored = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
    if (stored && Number(stored.grupo_id) === Number(grupoId) && idsValidos.has(Number(stored.pack_id))) {
      packId = Number(stored.pack_id);
    }
  } catch (e) {}
}

const pack = packId !== null ? variantes.find((v) => v.id === packId) : null;

return [{
  json: {
    pack_id: packId,
    pack_nombre: pack ? pack.nombre : '',
    mensaje_bienvenida: pack ? pack.mensaje_bienvenida : '',
    foto_url: pack ? (pack.foto_url || null) : null,
  },
}];`;

async function main() {
  const wf = await getFresh();
  console.log("workflow:", wf.name, "| nodos:", wf.nodes.length, "| versionId:", wf.versionId, "| updatedAt:", wf.updatedAt);
  writeFileSync(new URL("./workflow_backup_pre-variante-anticipada-grupo_2026-09-01.json", OUT_DIR), JSON.stringify(wf, null, 0));
  const ROLLBACK = wf.versionId;

  const N = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
  for (const req of [
    "Dividir y Etiquetar Sub-preguntas",
    "Preparar Contexto Sub-preguntas",
    "Parsear Sub-preguntas",
    "¿Nudge Resto Grupo? (contar)",
    "Parsear Variante Anticipada",
    "Resolver Variante Anticipada",
    "¿Es Compatible (Grupo)?",
    "Cerrar Pendiente Tecnica (Grupo)",
    "¿Variante Anticipada Resuelta?",
    "Marcar Pack Final Pineado",
  ]) if (!N[req]) throw new Error(`Falta el nodo "${req}"`);

  // ---- 1) Dividir y Etiquetar Sub-preguntas: categoria "variante" -----------------------
  {
    const opts = N["Dividir y Etiquetar Sub-preguntas"].parameters.options;
    let sm = opts.systemMessage;
    sm = replaceOnce(sm,
      `"otro"{{ $json.esperando_moto_grupo ? ', "moto"' : '' }}.`,
      `"otro"{{ $json.esperando_moto_grupo ? ', "moto", "variante"' : '' }}.`,
      "lista de categorias (linea 1)");
    sm = replaceOnce(sm,
      `Cualquier otra pregunta pegada (precio, una pieza, etc.) igual separala en su propia parte.' : '' }}`,
      `Cualquier otra pregunta pegada (precio, una pieza, etc.) igual separala en su propia parte.\\n- "variante": el cliente dice qué recorrido/variante del combo necesita (ej. "recorrido corto", "el largo", "la corta", "recorrido largo es la mía", "ando buscando recorrido corto") -- aunque todavía no se le haya preguntado. Tiene PRIORIDAD sobre "otro" y sobre "cierre" para cualquier mención del recorrido corto/largo. Va en su propia parte; si además dice la moto, esa es otra parte con categoría "moto".' : '' }}`,
      "bullet moto (linea 6)");
    sm = replaceOnce(sm,
      `"categoria": "precio|stock|envio|negocio|cierre|otro|moto"}]}`,
      `"categoria": "precio|stock|envio|negocio|cierre|otro|moto|variante"}]}`,
      "formato JSON de salida (linea 19)");
    opts.systemMessage = sm;
  }

  // ---- 2) Preparar Contexto Sub-preguntas: repregunta sin nombre interno ---------------
  {
    const node = N["Preparar Contexto Sub-preguntas"];
    node.parameters.jsCode = replaceOnce(node.parameters.jsCode,
      `const grupoRepreguntaTexto = grupoNombre\n  ? ('Para qué moto lo estás buscando? Así te confirmo si el ' + grupoNombre + ' te sirve.')\n  : 'Para qué moto lo estás buscando?';`,
      `const grupoRepreguntaTexto = 'Para qué moto lo estás buscando? Así te confirmo si te sirve.';`,
      "grupoRepreguntaTexto");
  }

  // ---- 3) Parsear Sub-preguntas: rama grupo (variante anticipada + otro no se descarta) -
  {
    const node = N["Parsear Sub-preguntas"];
    const code = node.parameters.jsCode;
    const START = "// ===== rama grupo esperando moto (PUT 1";
    const END = "// ===== fin rama grupo esperando moto =====";
    const i0 = code.indexOf(START);
    const i1 = code.indexOf(END);
    if (i0 === -1 || i1 === -1) throw new Error("No encontre los marcadores de la rama grupo en Parsear Sub-preguntas");
    node.parameters.jsCode = code.slice(0, i0) + NEW_GRUPO_BRANCH + code.slice(i1 + END.length);
    // ademas: agregar 'variante' a categoriasValidas global (para que no rompa fuera del grupo:
    // la rama no-grupo lo mapea a 'otro' explicitamente mas abajo con `if (categoria === 'moto')`).
    node.parameters.jsCode = replaceOnce(node.parameters.jsCode,
      `const categoriasValidas = ['precio', 'stock', 'envio', 'negocio', 'cierre', 'otro', 'moto'];`,
      `const categoriasValidas = ['precio', 'stock', 'envio', 'negocio', 'cierre', 'otro', 'moto', 'variante'];`,
      "categoriasValidas global");
    node.parameters.jsCode = replaceOnce(node.parameters.jsCode,
      `if (categoria === 'moto') categoria = 'otro'; // 'moto' solo vale en grupo esperando moto`,
      `if (categoria === 'moto') categoria = 'otro'; // 'moto' solo vale en grupo esperando moto\n    if (categoria === 'variante') categoria = 'otro'; // 'variante' solo vale en grupo esperando moto`,
      "downgrade moto/variante fuera del grupo");
  }

  // ---- 4) Parsear Variante Anticipada: fallback a la clave de Redis --------------------
  N["Parsear Variante Anticipada"].parameters.jsCode = NEW_PARSEAR_VARIANTE_ANTICIPADA;

  // ---- nodos nuevos -------------------------------------------------------------------
  const redisCreds = { redis: { id: "ZUlkjSz8R2bmmO2f", name: "Redis account 2" } };
  const pPar = N["Parsear Sub-preguntas"].position;
  const pCompat = N["¿Es Compatible (Grupo)?"].position;
  const pVAR = N["¿Variante Anticipada Resuelta?"].position;

  const nCapturo = {
    id: cryptoRandomId(),
    name: "¿Capturó Variante Anticipada? (Grupo)",
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [pPar[0] + 140, pPar[1] + 260],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [{
          id: cryptoRandomId(),
          leftValue: "={{ $json.variante_anticipada_pack_id != null }}",
          rightValue: true,
          operator: { type: "boolean", operation: "equals" },
        }],
        combinator: "and",
      },
      options: {},
    },
  };
  const nGuardar = {
    id: cryptoRandomId(),
    name: "Guardar Variante Anticipada (Grupo)",
    type: "n8n-nodes-base.redis",
    typeVersion: 1,
    position: [pPar[0] + 140, pPar[1] + 400],
    parameters: {
      operation: "set",
      key: `=variante_anticipada:${PHONE_KEY}`,
      value: "={{ JSON.stringify({ grupo_id: $json.variante_anticipada_grupo_id, pack_id: $json.variante_anticipada_pack_id }) }}",
      expire: true,
      ttl: 345600,
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 1000,
    credentials: redisCreds,
  };
  const nLeer = {
    id: cryptoRandomId(),
    name: "Leer Variante Anticipada (Grupo)",
    type: "n8n-nodes-base.redis",
    typeVersion: 1,
    position: [pCompat[0] - 40, pCompat[1] + 150],
    parameters: {
      operation: "get",
      propertyName: "variante_anticipada_raw",
      key: `=variante_anticipada:${PHONE_KEY}`,
      options: {},
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 1000,
    credentials: redisCreds,
  };
  const nBorrar = {
    id: cryptoRandomId(),
    name: "Borrar Variante Anticipada (Grupo)",
    type: "n8n-nodes-base.redis",
    typeVersion: 1,
    position: [pVAR[0] - 40, pVAR[1] + 180],
    parameters: {
      operation: "delete",
      key: `=variante_anticipada:${PHONE_KEY}`,
    },
    credentials: redisCreds,
  };
  for (const n of [nCapturo, nGuardar, nLeer, nBorrar]) if (N[n.name]) throw new Error(`El nodo "${n.name}" ya existe`);
  wf.nodes.push(nCapturo, nGuardar, nLeer, nBorrar);

  // ---- rewire -----------------------------------------------------------------------
  const C = wf.connections;
  const one = (node) => [{ node, type: "main", index: 0 }];

  // Parsear Sub-preguntas -> ¿Capturó Variante Anticipada? (Grupo) (antes: -> ¿Nudge Resto Grupo?)
  if (C["Parsear Sub-preguntas"].main[0][0].node !== "¿Nudge Resto Grupo? (contar)")
    throw new Error("Parsear Sub-preguntas ya no apunta a ¿Nudge Resto Grupo? (contar)");
  C["Parsear Sub-preguntas"].main[0] = one("¿Capturó Variante Anticipada? (Grupo)");
  C["¿Capturó Variante Anticipada? (Grupo)"] = { main: [
    [{ node: "Guardar Variante Anticipada (Grupo)", type: "main", index: 0 }, { node: "¿Nudge Resto Grupo? (contar)", type: "main", index: 0 }], // true: guarda (dead-end) + sigue
    one("¿Nudge Resto Grupo? (contar)"), // false: sigue
  ] };
  // Guardar Variante Anticipada (Grupo): dead-end (side-effect), sin conexiones de salida.

  // ¿Es Compatible (Grupo)? [true] -> Leer Variante Anticipada (Grupo) -> Resolver Variante Anticipada
  const trueOut = C["¿Es Compatible (Grupo)?"].main[0];
  const idxRes = trueOut.findIndex((c) => c.node === "Resolver Variante Anticipada");
  if (idxRes === -1) throw new Error("¿Es Compatible (Grupo)? [true] ya no apunta a Resolver Variante Anticipada");
  trueOut[idxRes] = { node: "Leer Variante Anticipada (Grupo)", type: "main", index: 0 };
  C["Leer Variante Anticipada (Grupo)"] = { main: [one("Resolver Variante Anticipada")] };

  // ¿Variante Anticipada Resuelta? [true] -> Borrar Variante Anticipada (Grupo) -> Marcar Pack Final Pineado
  if (C["¿Variante Anticipada Resuelta?"].main[0][0].node !== "Marcar Pack Final Pineado")
    throw new Error("¿Variante Anticipada Resuelta? [true] ya no apunta a Marcar Pack Final Pineado");
  C["¿Variante Anticipada Resuelta?"].main[0] = one("Borrar Variante Anticipada (Grupo)");
  C["Borrar Variante Anticipada (Grupo)"] = { main: [one("Marcar Pack Final Pineado")] };

  // ---- PUT --------------------------------------------------------------------------
  const sk = ["saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder"];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => sk.includes(k)));
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  if (DRY) {
    writeFileSync(new URL("./workflow_variante-anticipada-grupo_resultante_2026-09-01.json", OUT_DIR), JSON.stringify(wf, null, 2));
    console.log("\n[DRY] nodos resultantes:", wf.nodes.length);
    console.log("[DRY] rollback versionId:", ROLLBACK);
    return;
  }

  const raw = JSON.stringify(body);
  let ascii = ""; for (let i = 0; i < raw.length; i++) { const cc = raw.charCodeAt(i); ascii += cc > 0x7f ? "\\u" + cc.toString(16).padStart(4, "0") : raw[i]; }
  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: ascii });
  console.log("PUT ok. nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const f = await getFresh();
  const fN = Object.fromEntries(f.nodes.map((n) => [n.name, n]));
  const fC = f.connections;
  const checks = [
    ["4 nodos nuevos", ["¿Capturó Variante Anticipada? (Grupo)", "Guardar Variante Anticipada (Grupo)", "Leer Variante Anticipada (Grupo)", "Borrar Variante Anticipada (Grupo)"].every((n) => fN[n])],
    ["Dividir y Etiquetar tiene 'variante'", fN["Dividir y Etiquetar Sub-preguntas"].parameters.options.systemMessage.includes('", "variante"')],
    ["repregunta sin nombre interno", fN["Preparar Contexto Sub-preguntas"].parameters.jsCode.includes("Así te confirmo si te sirve.") && !fN["Preparar Contexto Sub-preguntas"].parameters.jsCode.includes("' + grupoNombre + ' te sirve")],
    ["Parsear Sub-preguntas rama grupo nueva", fN["Parsear Sub-preguntas"].parameters.jsCode.includes("variante_anticipada_pack_id") && fN["Parsear Sub-preguntas"].parameters.jsCode.includes("if (out.length > 0) out.push(...otros)")],
    ["Parsear Variante Anticipada con fallback", fN["Parsear Variante Anticipada"].parameters.jsCode.includes("Leer Variante Anticipada (Grupo)")],
    ["Parsear Sub-preguntas -> ¿Capturó Variante", fC["Parsear Sub-preguntas"].main[0][0].node === "¿Capturó Variante Anticipada? (Grupo)"],
    ["¿Capturó [true] -> Guardar + Nudge", fC["¿Capturó Variante Anticipada? (Grupo)"].main[0].map((c) => c.node).sort().join(",") === ["Guardar Variante Anticipada (Grupo)", "¿Nudge Resto Grupo? (contar)"].sort().join(",")],
    ["¿Capturó [false] -> Nudge", fC["¿Capturó Variante Anticipada? (Grupo)"].main[1][0].node === "¿Nudge Resto Grupo? (contar)"],
    ["compat [true] -> Leer Variante Anticipada", fC["¿Es Compatible (Grupo)?"].main[0].some((c) => c.node === "Leer Variante Anticipada (Grupo)")],
    ["compat [true] conserva Cerrar Pendiente", fC["¿Es Compatible (Grupo)?"].main[0].some((c) => c.node === "Cerrar Pendiente Tecnica (Grupo)")],
    ["Leer Variante Anticipada -> Resolver", fC["Leer Variante Anticipada (Grupo)"].main[0][0].node === "Resolver Variante Anticipada"],
    ["¿Variante Anticipada Resuelta? [true] -> Borrar", fC["¿Variante Anticipada Resuelta?"].main[0][0].node === "Borrar Variante Anticipada (Grupo)"],
    ["Borrar -> Marcar Pack Final Pineado", fC["Borrar Variante Anticipada (Grupo)"].main[0][0].node === "Marcar Pack Final Pineado"],
    ["Guardar Variante Anticipada es dead-end", !fC["Guardar Variante Anticipada (Grupo)"]],
  ];
  let ok = true;
  for (const [l, v] of checks) { console.log(v ? "  OK  " : "  FALLA", l); if (!v) ok = false; }
  console.log(ok ? "\nAplicado. Rollback: restore version " + ROLLBACK : "\nREVISAR. Rollback: restore version " + ROLLBACK);
}

main().catch((e) => { console.error(e); process.exit(1); });
