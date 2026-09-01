// Compat: una regla NEGATIVA atada a una cilindrada puntual ("motomel blitz 125 = no")
// ya no bloquea a un cliente que dice el modelo pelado ("motomel blitz"). "Inclinarse por el SI".
// -----------------------------------------------------------------------------------------------
// Caso real: conv 3131 (+5492975288540), 2026-09-01. Entro por el anuncio del Combo Escape PWR +
// Leva 6.40 (grupo 2). Dijo "Tengo un motomel blitz" (sin cilindrada). En chat_articulo_compatibilidad
// hay, por cada pieza del combo, DOS reglas que matchean: "motomel blitz 110 = SI" (20/08) y
// "motomel blitz 125 = NO" (22/08, cargada a mano para un caso real de Blitz 125). Como "blitz"
// pelado no entra en conflicto con ningun numero, rm_modelo_ok da true para las dos, y el CTE
// `articulo` ordena `compatible ASC` -> gana el "NO" -> el bot le dijo que su moto no servia.
//
// Fix en 2 partes:
//   1) Funcion nueva `rm_numero_guardado_no_mencionado(guardado, consulta)` -- ver
//      fix-compat-negativa-requiere-cilindrada.sql (ya aplicada en la base).
//   2) Este script: en los 4 nodos "Buscar Compatibilidad *", en el CTE que busca entre las
//      piezas del combo, se agrega:
//         AND NOT (compatible = false AND rm_numero_guardado_no_mencionado(modelo_moto, '<consulta>'))
//      -> una regla negativa con cilindrada explicita SOLO aplica si el cliente nombro esa
//         cilindrada. Reglas negativas sin numero (wave, biz sin numero) NO se tocan.
//
// Regresion (probada contra las 248 filas reales + 164 consultas x 3 grupos): unico flip a
// compatible=true es "motomel blitz" (el bug). Otros 3 flips van a null (escala al equipo, safe).
// 0 filas negativas rotas contra si mismas.
//
// Uso:
//   node apply-compat-negativa-requiere-cilindrada.mjs --dry
//   node apply-compat-negativa-requiere-cilindrada.mjs
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

// [nodo, ancla (unica al CTE articulo), guarda a insertar antes del ancla]
const EDITS = [
  {
    node: "Buscar Compatibilidad del Kit",
    anchor:
      "    AND rm_modelo_ok(modelo_moto, '{{ $json.modelo_moto_sql }}')\n  -- un \"no compatible\" de cualquier pieza bloquea el combo entero",
    guard:
      "    AND rm_modelo_ok(modelo_moto, '{{ $json.modelo_moto_sql }}')\n    AND NOT (compatible = false AND rm_numero_guardado_no_mencionado(modelo_moto, '{{ $json.modelo_moto_sql }}'))\n  -- un \"no compatible\" de cualquier pieza bloquea el combo entero",
  },
  {
    node: "Buscar Compatibilidad del Grupo",
    anchor:
      "  AND rm_modelo_ok(modelo_moto, '{{ $('Parsear Modelo Grupo').item.json.modelo_moto_sql }}')\n  -- un \"no compatible\" de cualquier pieza bloquea el combo entero",
    guard:
      "  AND rm_modelo_ok(modelo_moto, '{{ $('Parsear Modelo Grupo').item.json.modelo_moto_sql }}')\n  AND NOT (compatible = false AND rm_numero_guardado_no_mencionado(modelo_moto, '{{ $('Parsear Modelo Grupo').item.json.modelo_moto_sql }}'))\n  -- un \"no compatible\" de cualquier pieza bloquea el combo entero",
  },
  {
    node: "Buscar Compatibilidad de Candidatos",
    anchor:
      "    AND rm_modelo_ok(cac.modelo_moto, '{{ $json.modelo_moto_sql }}')\n  ORDER BY p.grupo_id, cac.creado_en DESC",
    guard:
      "    AND rm_modelo_ok(cac.modelo_moto, '{{ $json.modelo_moto_sql }}')\n    AND NOT (cac.compatible = false AND rm_numero_guardado_no_mencionado(cac.modelo_moto, '{{ $json.modelo_moto_sql }}'))\n  ORDER BY p.grupo_id, cac.creado_en DESC",
  },
  {
    node: "Buscar Compatibilidad Kit Confiado",
    anchor:
      "  )\n    AND rm_modelo_ok(modelo_moto, '{{ $json.modelo_moto_sql }}')\n  ORDER BY creado_en DESC",
    guard:
      "  )\n    AND rm_modelo_ok(modelo_moto, '{{ $json.modelo_moto_sql }}')\n    AND NOT (compatible = false AND rm_numero_guardado_no_mencionado(modelo_moto, '{{ $json.modelo_moto_sql }}'))\n  ORDER BY creado_en DESC",
  },
];

async function main() {
  const wf = await getFresh();
  console.log("workflow:", wf.name, "| nodos:", wf.nodes.length, "| versionId:", wf.versionId, "| updatedAt:", wf.updatedAt);
  writeFileSync(
    new URL("./workflow_backup_pre-compat-negativa-cilindrada_2026-09-01.json", OUT_DIR),
    JSON.stringify(wf, null, 0)
  );
  const ROLLBACK = wf.versionId;

  const N = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
  for (const e of EDITS) {
    if (!N[e.node]) throw new Error(`Falta el nodo "${e.node}"`);
    const q = N[e.node].parameters.query;
    if (q.includes("rm_numero_guardado_no_mencionado")) {
      console.log(`  (ya tenia la guarda: ${e.node} - skip)`);
      continue;
    }
    N[e.node].parameters.query = replaceOnce(q, e.anchor, e.guard, e.node);
    console.log(`  editado: ${e.node}`);
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
      new URL("./workflow_compat-negativa-cilindrada_resultante_2026-09-01.json", OUT_DIR),
      JSON.stringify(wf, null, 2)
    );
    console.log("\n[DRY] listo. rollback versionId:", ROLLBACK);
    for (const e of EDITS) {
      console.log(`\n===== ${e.node} =====\n${N[e.node].parameters.query}`);
    }
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
  let ok = true;
  for (const e of EDITS) {
    const has = fN[e.node].parameters.query.includes("rm_numero_guardado_no_mencionado");
    console.log(has ? "  OK  " : "  FALLA", e.node);
    if (!has) ok = false;
  }
  console.log(ok ? `\nAplicado. Rollback: restore version ${ROLLBACK}` : `\nREVISAR. Rollback: restore version ${ROLLBACK}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
