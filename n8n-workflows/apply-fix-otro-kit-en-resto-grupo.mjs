// Fix (2026-08-31): el cliente entra por un kit y en la MISMA rafaga pregunta
// por OTRO kit distinto -- ese pedazo se perdia.
//
// Caso real: conv 2934 / Ismael (+5492617087050). Rafaga de 3 mensajes:
//   1. "¡Hola! Quiero mas informacion SOBRE EL COMBO TAPA CDI 125 + CILINDRO 120!"  (plantilla exacta -> pinea grupo Tapa cdi)
//   2. "Q precio esta el kit 200 para el carrilero s s2"
//   3. "Varrilero"
// El grupo Tapa cdi quedo pineado "esperando_moto" y el resto de la rafaga se
// mando a `Extraer Modelo Grupo`, que colapso todo a modelo_moto="s2" y tiro
// "kit 200 / carrilero / varrilero" a la basura -- despues fabrico una nota de
// compatibilidad falsa ("¿Tapa cdi compatible con s2?"). La consulta del Kit 200
// nunca aparecio en ningun lado.
//
// Causa: una vez que la rafaga matchea plantilla (o hay pin), el "resto" solo se
// interpreta relativo al kit actual (moto / pieza suelta / negocio). No hay
// ningun paso que se pregunte "¿el resto es OTRO kit?".
//
// Fix (sin IA, solo deteccion + escalado -- NO auto-responde el segundo kit):
//   Entre `¿Pineado Esperando Moto?` (rama true) y `Extraer Modelo Grupo` se
//   inserta:
//     - `Detectar Otro Kit en Resto (Grupo)` (Code): normaliza el resto y lo
//       compara contra la lista de kits activos (`Buscar Kits Activos`). Marca
//       `otro_kit_detectado` si encuentra "kit NNN" / "combo NNN" / "NNNcc" o un
//       token distintivo (5+ letras, unico de un solo kit) que pertenezca a un
//       kit DISTINTO del grupo pineado y cuyo numero/palabra no sea propio del
//       grupo pineado (evita falsos positivos con "120"/"125" que el propio combo
//       menciona).
//     - `¿Otro Kit en Resto? (Grupo)` (If): si detecto -> `Registrar Pendiente
//       Otro Kit (Grupo)` (insert en preguntas_sin_match_pendientes con el resto
//       textual) -> `Preparar Nota Otro Kit (Grupo)` -> `Enviar Nota Escalado`
//       (compartido). Si no -> `Extraer Modelo Grupo` como siempre.
//   El grupo sigue pineado esperando la moto; la bienvenida del grupo ya se
//   mando antes. Cuando el cliente conteste la moto, el flujo sigue normal.
//
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.APIKEY_N8N || process.env.API_KEY_N8N || process.env.N8N_KEY;
if (!API_KEY) throw new Error("Falta APIKEY_N8N en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-otro-kit-en-resto-grupo_2026-08-31.json", import.meta.url);
const PG_CRED = { postgres: { id: "65YYZNhTfBBheEpo", name: "Postgres account" } };

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

const DETECT_CODE = `// 2026-08-31: cuando el grupo pineado espera la moto y en la misma rafaga el
// cliente pregunto por OTRO kit distinto, ese pedazo se perdia (Extraer Modelo
// Grupo lo colapsaba a un "modelo" y fabricaba una consulta de compatibilidad
// falsa). Aca detectamos, SIN IA, si el resto menciona otro kit activo; si es
// asi lo escalamos textual en vez de meterlo a la fuerza en el grupo.
const resto = ($('Unir Mensajes').item.json.resto_mensaje || '').toString();

const stripAccents = (s) => s.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
const norm = (s) => stripAccents(s).replace(/[^a-z0-9\\s]/g, ' ').replace(/\\s+/g, ' ').trim();
const r = norm(resto);

const data = ($('Buscar Kits Activos').first().json) || {};
const packs = data.packs || [];
const grupos = data.grupos || [];
const grupoPineadoId = $('Parsear Kit Pineado').item.json.grupo_id;

const grupoPin = grupos.find((g) => g.id === grupoPineadoId) || {};
const propioTxt = norm([
  grupoPin.nombre, grupoPin.mensaje_bienvenida,
  grupoPin.plantillas_bienvenida, grupoPin.plantillas_referral,
].filter(Boolean).join(' '));
const propiosNums = new Set(propioTxt.match(/\\b\\d{2,3}\\b/g) || []);
const propiasPalabras = new Set(propioTxt.split(' '));

const STOP = new Set(['kit','kits','combo','para','con','los','las','del','mas','moto','motos','sin','por','eco','economico','economica','regalo','envio','gratis','pais','todo','todos','recorrido','corto','largo','corta','larga','cilindro','cilindros','leva','codo','carbu','carburador','filtro','tapa','escape','aros','piston','perno','junta','juntas','calle','distribucion','corona','balanceador','varillero','varilleros','potenciado','potencia','potenciacion','rendimiento','aluminio','carrera','esparragos','varillas','valvulas','extras','tuercas','juego','super','medida','completo','listo','admision','alto','flujo']);

const kitsNums = [];   // { num, nombre }
const kitsTokens = []; // { token, nombre }
for (const k of [...packs, ...grupos]) {
  const nn = norm(k.nombre || '');
  for (const m of (nn.match(/\\b\\d{2,3}\\b/g) || [])) kitsNums.push({ num: m, nombre: k.nombre });
  for (const wtok of nn.split(' ')) {
    if (wtok.length >= 5 && !STOP.has(wtok)) kitsTokens.push({ token: wtok, nombre: k.nombre });
  }
}

let otro = '';

// 1) patron explicito: "kit NNN" / "combo NNN" / "NNNcc" en el resto
const numHits = [
  ...r.matchAll(/\\b(?:kit|kti|kid|combo|conbo)\\s+0*(\\d{2,3})\\b/g),
  ...r.matchAll(/\\b0*(\\d{2,3})\\s*cc\\b/g),
];
for (const mm of numHits) {
  const num = mm[1];
  if (propiosNums.has(num)) continue;
  const hit = kitsNums.find((x) => x.num === num);
  if (hit && hit.nombre !== grupoPin.nombre) { otro = hit.nombre; break; }
}

// 2) token distintivo (5+ letras) unico de un solo kit activo y ausente del grupo pineado (ej. "dakar")
if (!otro) {
  for (const wtok of r.split(' ')) {
    if (wtok.length < 5 || STOP.has(wtok) || propiasPalabras.has(wtok)) continue;
    const owners = [...new Set(kitsTokens.filter((x) => x.token === wtok).map((x) => x.nombre))];
    if (owners.length === 1 && owners[0] !== grupoPin.nombre) { otro = owners[0]; break; }
  }
}

const restoLimpio = resto.replace(/[\\r\\n]+/g, ' / ').trim();
return [{
  json: {
    otro_kit_detectado: !!otro,
    otro_kit_nombre: otro,
    otro_kit_texto: restoLimpio,
    otro_kit_texto_sql: restoLimpio.replace(/'/g, "''"),
  },
}];
`;

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup guardado. Nodos actuales:", wf.nodes.length);

  const conns = wf.connections;
  const has = (n) => wf.nodes.some((x) => x.name === n);
  for (const req of ["¿Pineado Esperando Moto?", "Extraer Modelo Grupo", "Unir Mensajes", "Buscar Kits Activos", "Parsear Kit Pineado", "Enviar Nota Escalado"]) {
    if (!has(req)) throw new Error(`Falta el nodo esperado "${req}"`);
  }

  const detect = {
    parameters: { jsCode: DETECT_CODE },
    id: "e1f2a3b4-otro-kit-resto-detect01",
    name: "Detectar Otro Kit en Resto (Grupo)",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [400, 2760],
  };
  const ifOtro = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [
          {
            id: "otro-kit-resto-if-01",
            leftValue: "={{ $json.otro_kit_detectado }}",
            rightValue: true,
            operator: { type: "boolean", operation: "equals" },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
    id: "e2f3a4b5-otro-kit-resto-if0001",
    name: "¿Otro Kit en Resto? (Grupo)",
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [620, 2760],
  };
  const registrar = {
    parameters: {
      operation: "executeQuery",
      query:
        "INSERT INTO preguntas_sin_match_pendientes (conversation_id, pregunta_original)\n" +
        "VALUES ({{ $('Webhook1').item.json.body.conversation.messages[0].conversation_id }}, '{{ $('Detectar Otro Kit en Resto (Grupo)').item.json.otro_kit_texto_sql }}');",
      options: {},
    },
    id: "e3f4a5b6-otro-kit-resto-reg001",
    name: "Registrar Pendiente Otro Kit (Grupo)",
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [840, 2900],
    credentials: PG_CRED,
  };
  const nota = {
    parameters: {
      assignments: {
        assignments: [
          {
            id: "otro-kit-resto-nota-01",
            name: "motivo",
            type: "string",
            value:
              "=El cliente, además del combo que le mostramos, preguntó por otro producto distinto: «{{ $('Detectar Otro Kit en Resto (Grupo)').item.json.otro_kit_texto }}». Eso todavía no lo resolvemos automáticamente — respondé acá mismo (es privado, el cliente no lo ve) y en cuanto contestes se lo paso al cliente y queda guardado para la próxima vez que pregunten algo parecido.",
          },
        ],
      },
      options: {},
    },
    id: "e4f5a6b7-otro-kit-resto-nota01",
    name: "Preparar Nota Otro Kit (Grupo)",
    type: "n8n-nodes-base.set",
    typeVersion: 3.4,
    position: [1060, 2900],
  };
  wf.nodes.push(detect, ifOtro, registrar, nota);

  // rewire: ¿Pineado Esperando Moto? (true) -> Detectar Otro Kit en Resto (Grupo)
  const pm = conns["¿Pineado Esperando Moto?"].main[0];
  const idx = pm.findIndex((x) => x.node === "Extraer Modelo Grupo");
  if (idx === -1) throw new Error("¿Pineado Esperando Moto? ya no apunta a Extraer Modelo Grupo");
  pm.splice(idx, 1);
  addConn(conns, "¿Pineado Esperando Moto?", "Detectar Otro Kit en Resto (Grupo)");

  addConn(conns, "Detectar Otro Kit en Resto (Grupo)", "¿Otro Kit en Resto? (Grupo)");
  addConn(conns, "¿Otro Kit en Resto? (Grupo)", "Registrar Pendiente Otro Kit (Grupo)", 0, 0); // true
  addConn(conns, "¿Otro Kit en Resto? (Grupo)", "Extraer Modelo Grupo", 1, 0);                 // false
  addConn(conns, "Registrar Pendiente Otro Kit (Grupo)", "Preparar Nota Otro Kit (Grupo)");
  addConn(conns, "Preparar Nota Otro Kit (Grupo)", "Enviar Nota Escalado");

  const allowedSettingsKeys = [
    "saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
    "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder",
  ];
  const settings = Object.fromEntries(
    Object.entries(wf.settings || {}).filter(([k]) => allowedSettingsKeys.includes(k))
  );
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  // gotcha: el PUT con UTF-8 crudo corrompe la "i" con tilde -> mandamos todo en escapes ASCII
  const rawBody = JSON.stringify(body);
  // iteramos por code unit UTF-16: los emoji del workflow quedan como par
  // surrogate (\uXXXX\uXXXX), valido en JSON; la "i" con tilde queda í.
  let asciiBody = "";
  for (let i = 0; i < rawBody.length; i++) {
    const code = rawBody.charCodeAt(i);
    asciiBody += code > 0x7f ? "\\u" + code.toString(16).padStart(4, "0") : rawBody[i];
  }

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: asciiBody });
  console.log("Actualizado. Nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const fresh = await api(`/workflows/${WORKFLOW_ID}`);
  const freshHas = (n) => fresh.nodes.some((x) => x.name === n);
  const c = fresh.connections;
  const checks = [
    ["nodo Detectar Otro Kit en Resto (Grupo)", freshHas("Detectar Otro Kit en Resto (Grupo)")],
    ["nodo ¿Otro Kit en Resto? (Grupo)", freshHas("¿Otro Kit en Resto? (Grupo)")],
    ["nodo Registrar Pendiente Otro Kit (Grupo)", freshHas("Registrar Pendiente Otro Kit (Grupo)")],
    ["nodo Preparar Nota Otro Kit (Grupo)", freshHas("Preparar Nota Otro Kit (Grupo)")],
    [
      "¿Pineado Esperando Moto? -> Detectar Otro Kit en Resto (Grupo)",
      c["¿Pineado Esperando Moto?"].main[0].some((x) => x.node === "Detectar Otro Kit en Resto (Grupo)"),
    ],
    [
      "¿Pineado Esperando Moto? YA NO -> Extraer Modelo Grupo directo",
      !c["¿Pineado Esperando Moto?"].main[0].some((x) => x.node === "Extraer Modelo Grupo"),
    ],
    [
      "¿Otro Kit en Resto? (Grupo) true -> Registrar Pendiente Otro Kit (Grupo)",
      c["¿Otro Kit en Resto? (Grupo)"].main[0].some((x) => x.node === "Registrar Pendiente Otro Kit (Grupo)"),
    ],
    [
      "¿Otro Kit en Resto? (Grupo) false -> Extraer Modelo Grupo",
      c["¿Otro Kit en Resto? (Grupo)"].main[1].some((x) => x.node === "Extraer Modelo Grupo"),
    ],
    [
      "Preparar Nota Otro Kit (Grupo) -> Enviar Nota Escalado",
      c["Preparar Nota Otro Kit (Grupo)"].main[0].some((x) => x.node === "Enviar Nota Escalado"),
    ],
  ];
  let allOk = true;
  for (const [label, ok] of checks) {
    console.log(ok ? "  OK  " : "  FALLA", label);
    if (!ok) allOk = false;
  }
  console.log(allOk ? "\nFix aplicado correctamente." : "\nREVISAR A MANO -- algo no quedo bien.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
