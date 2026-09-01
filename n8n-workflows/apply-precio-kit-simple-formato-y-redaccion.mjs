// Precio de un kit simple (sin variantes): formato de número + redacción + no responder
// el precio del kit pineado cuando preguntan por OTRO kit / otra moto.
// -----------------------------------------------------------------------------------------------
// Caso real: conv 3151 (+5493584203201, Marcos Morales), 2026-09-01. Kit 170 pineado por
// plantilla. El cliente preguntó "Y un 190 para una fz16 cuánto me saldria" y el bot respondió
// "Te saldría 99990.00." -- tres problemas:
//   1) Formato: el precio sale crudo de la base ("99990.00"). El camino de grupos ya formatea
//      "$99.990"; el de kit simple no.
//   2) Redacción: para "precio" de kit simple la respuesta la improvisa el LLM
//      `Redactar Respuesta desde Dato` ("Te saldría..."). El de grupos es determinístico y con
//      el estilo de la casa.
//   3) Misclasificación: preguntó por otro kit (190) para otra moto (fz16) y el clasificador lo
//      marcó "precio" del kit pineado -> le tiró $99.990 (dato equivocado).
//
// Fixes (decisiones de Martín):
//  A. Formato "$99.990" (es-AR, sin decimales) + texto fijo, igual molde que grupos:
//     "$99.990. Envío gratis a todo el país. Avisame si te interesa y coordinamos."
//     (la línea de envío solo si el kit tiene envío gratis).
//  B. "precio" pasa a passthrough en `Marcar Resuelto o No Resuelto` -> el texto determinístico
//     de `Consolidar Dato Resuelto` va tal cual al cliente, sin reescritura del LLM.
//  C. `Dividir y Etiquetar Sub-preguntas`: "precio" SOLO si es por el kit del que ya se hablaba;
//     otro kit / otra cilindrada / otra moto -> "otro" (si no hay dato, escala en silencio).
//
// 3 nodos editados, 0 nodos nuevos. Uso:
//   node apply-precio-kit-simple-formato-y-redaccion.mjs --dry
//   node apply-precio-kit-simple-formato-y-redaccion.mjs
import { readFileSync, writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY =
  process.env.APIKEY_N8N ||
  (() => {
    try {
      const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
      const l = env.split(/\r?\n/).find((x) => x.startsWith("APIKEY_N8N="));
      return l ? l.slice("APIKEY_N8N=".length).replace(/^"|"$/g, "") : null;
    } catch {
      return null;
    }
  })();
if (!API_KEY) throw new Error("Falta APIKEY_N8N (env o ../.env)");
const DRY = process.argv.includes("--dry");
const OUT_DIR = new URL("./", import.meta.url);

async function api(path, options = {}) {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${API_URL}${path}${
    options.method && options.method !== "GET" ? "" : `${sep}_cb=${Date.now()}-${Math.random()}`
  }`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "X-N8N-API-KEY": API_KEY,
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    console.error("ERROR", res.status, JSON.stringify(body, null, 2));
    throw new Error(`API ${path} => ${res.status}`);
  }
  return body;
}

async function getFresh() {
  for (let i = 0; i < 40; i++) {
    const wf = await api(`/workflows/${WORKFLOW_ID}`);
    if (wf.nodes && wf.nodes.length >= 459) return wf;
    console.log(`  (GET devolvio ${wf.nodes && wf.nodes.length} nodos - cache stale, reintento ${i + 1})`);
  }
  throw new Error("el GET siempre devolvio una version vieja del workflow");
}

function replaceOnce(haystack, needle, replacement, label) {
  const i = haystack.indexOf(needle);
  if (i === -1) throw new Error(`No encontre el texto a reemplazar: ${label}`);
  if (haystack.indexOf(needle, i + needle.length) !== -1)
    throw new Error(`Texto ambiguo (aparece 2+ veces): ${label}`);
  return haystack.slice(0, i) + replacement + haystack.slice(i + needle.length);
}

async function main() {
  const wf = await getFresh();
  console.log("workflow:", wf.name, "| nodos:", wf.nodes.length, "| versionId:", wf.versionId, "| updatedAt:", wf.updatedAt);
  writeFileSync(
    new URL("./workflow_backup_pre-precio-kit-simple_2026-09-01.json", OUT_DIR),
    JSON.stringify(wf, null, 0)
  );
  const ROLLBACK = wf.versionId;

  const N = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
  for (const req of [
    "Buscar Precio Kit Pineado",
    "Consolidar Dato Resuelto",
    "Marcar Resuelto o No Resuelto",
    "Dividir y Etiquetar Sub-preguntas",
  ])
    if (!N[req]) throw new Error(`Falta el nodo "${req}"`);

  // ---- 1) Buscar Precio Kit Pineado: traer tambien k.envio ------------------------------
  N["Buscar Precio Kit Pineado"].parameters.query = replaceOnce(
    N["Buscar Precio Kit Pineado"].parameters.query,
    "SELECT k.precio, k.detalle\n",
    "SELECT k.precio, k.detalle, k.envio\n",
    "Buscar Precio Kit Pineado SELECT"
  );

  // ---- 2) Consolidar Dato Resuelto: texto determinístico con formato $ -----------------
  N["Consolidar Dato Resuelto"].parameters.jsCode = replaceOnce(
    N["Consolidar Dato Resuelto"].parameters.jsCode,
    "if (categoria === 'precio') {\n  const r = $('Buscar Precio Kit Pineado').item.json;\n  if (r && r.precio != null) dato = 'Precio: ' + r.precio;\n}",
    "if (categoria === 'precio') {\n" +
      "  const r = $('Buscar Precio Kit Pineado').item.json;\n" +
      "  if (r && r.precio != null && Number(r.precio) > 0) {\n" +
      "    const monto = '$' + Math.round(Number(r.precio)).toLocaleString('es-AR');\n" +
      "    const envioGratis = r.envio && /gratis/i.test(r.envio.toString());\n" +
      "    dato = monto + '.' + (envioGratis ? ' Envío gratis a todo el país.' : '') + ' Avisame si te interesa y coordinamos.';\n" +
      "  }\n" +
      "}",
    "Consolidar Dato Resuelto precio branch"
  );

  // ---- 3) Marcar Resuelto o No Resuelto: 'precio' pasa como passthrough ----------------
  N["Marcar Resuelto o No Resuelto"].parameters.jsCode = replaceOnce(
    N["Marcar Resuelto o No Resuelto"].parameters.jsCode,
    "const passthrough = (cat === 'reenvio_bienvenida' || cat === 'repregunta_moto');",
    "const passthrough = (cat === 'reenvio_bienvenida' || cat === 'repregunta_moto' || cat === 'precio');",
    "Marcar Resuelto passthrough"
  );
  // el comentario de arriba tambien menciona las categorias passthrough
  N["Marcar Resuelto o No Resuelto"].parameters.jsCode = replaceOnce(
    N["Marcar Resuelto o No Resuelto"].parameters.jsCode,
    "// reenvio_bienvenida / repregunta_moto: texto de plantilla, se manda tal cual (no pasa por la reescritura IA)",
    "// reenvio_bienvenida / repregunta_moto / precio: texto determinístico, se manda tal cual (no pasa por la reescritura IA)",
    "Marcar Resuelto comentario"
  );

  // ---- 4) Dividir y Etiquetar Sub-preguntas: 'precio' solo del kit ya identificado -----
  {
    const opts = N["Dividir y Etiquetar Sub-preguntas"].parameters.options;
    opts.systemMessage = replaceOnce(
      opts.systemMessage,
      "- \"precio\": pregunta cuánto cuesta o por el precio de ALGO YA IDENTIFICADO en la charla (el kit/combo del que ya se está hablando). {{ ($json.kit_id !== null || $json.esperando_moto_grupo) ? 'En esta charla SÍ hay un kit ya identificado, así que \"precio\" es válido.' : 'En esta charla NO hay ningún kit identificado todavía, así que NUNCA uses \"precio\" -- cualquier pregunta de precio en este caso va como \"otro\".' }}\n",
      "- \"precio\": pregunta cuánto cuesta o por el precio del MISMO kit/combo del que ya se viene hablando en la charla. {{ ($json.kit_id !== null || $json.esperando_moto_grupo) ? 'En esta charla SÍ hay un kit ya identificado, así que \"precio\" es válido PARA ESE kit. OJO: si el cliente pregunta el precio de OTRA cosa -- otro kit, otra cilindrada, otro producto, o algo para otra moto distinta a la de este kit (ej. \"y un 190 para una fz16 cuánto sale?\", \"cuánto el de 150?\", \"y el cilindro suelto?\") -- eso NO es \"precio\", va como \"otro\" (no tenemos ese dato cargado y hay que escalarlo, no responder con el precio del kit de esta charla).' : 'En esta charla NO hay ningún kit identificado todavía, así que NUNCA uses \"precio\" -- cualquier pregunta de precio en este caso va como \"otro\".' }}\n",
      "Dividir y Etiquetar precio bullet"
    );
  }

  const sk = [
    "saveExecutionProgress",
    "saveManualExecutions",
    "saveDataErrorExecution",
    "saveDataSuccessExecution",
    "executionTimeout",
    "errorWorkflow",
    "timezone",
    "executionOrder",
  ];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => sk.includes(k)));
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  if (DRY) {
    writeFileSync(
      new URL("./workflow_precio-kit-simple_resultante_2026-09-01.json", OUT_DIR),
      JSON.stringify(wf, null, 2)
    );
    console.log("\n[DRY] rollback versionId:", ROLLBACK);
    console.log("\n-- Buscar Precio Kit Pineado --\n" + N["Buscar Precio Kit Pineado"].parameters.query);
    console.log("\n-- Consolidar (precio) --");
    const c = N["Consolidar Dato Resuelto"].parameters.jsCode;
    console.log(c.slice(c.indexOf("if (categoria === 'precio')"), c.indexOf("} else if (categoria === 'stock')")));
    console.log("\n-- Marcar Resuelto --\n" + N["Marcar Resuelto o No Resuelto"].parameters.jsCode.split("\n").slice(0, 6).join("\n"));
    console.log("\n-- Dividir y Etiquetar (precio bullet) --");
    const sm = N["Dividir y Etiquetar Sub-preguntas"].parameters.options.systemMessage;
    console.log(sm.slice(sm.indexOf('- "precio"'), sm.indexOf('- "stock"')));
    return;
  }

  const raw = JSON.stringify(body);
  let ascii = "";
  for (let i = 0; i < raw.length; i++) {
    const cc = raw.charCodeAt(i);
    ascii += cc > 0x7f ? "\\u" + cc.toString(16).padStart(4, "0") : raw[i];
  }
  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: ascii });
  console.log("PUT ok. nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const f = await getFresh();
  const fN = Object.fromEntries(f.nodes.map((n) => [n.name, n]));
  const checks = [
    ["Buscar Precio trae k.envio", fN["Buscar Precio Kit Pineado"].parameters.query.includes("k.precio, k.detalle, k.envio")],
    ["Consolidar formatea $ es-AR", fN["Consolidar Dato Resuelto"].parameters.jsCode.includes("toLocaleString('es-AR')") && fN["Consolidar Dato Resuelto"].parameters.jsCode.includes("Avisame si te interesa y coordinamos")],
    ["Consolidar ya no usa 'Precio: ' + r.precio", !fN["Consolidar Dato Resuelto"].parameters.jsCode.includes("dato = 'Precio: ' + r.precio")],
    ["Marcar Resuelto passthrough precio", fN["Marcar Resuelto o No Resuelto"].parameters.jsCode.includes("|| cat === 'precio')")],
    ["Dividir y Etiquetar endurecido", fN["Dividir y Etiquetar Sub-preguntas"].parameters.options.systemMessage.includes("y un 190 para una fz16")],
  ];
  let ok = true;
  for (const [l, v] of checks) {
    console.log(v ? "  OK  " : "  FALLA", l);
    if (!v) ok = false;
  }
  console.log(ok ? `\nAplicado. Rollback: restore version ${ROLLBACK}` : `\nREVISAR. Rollback: restore version ${ROLLBACK}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
