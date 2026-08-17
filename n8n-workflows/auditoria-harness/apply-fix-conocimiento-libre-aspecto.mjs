// Fix: "Buscar en Conocimiento Libre (Sin Match)" (rama "otro" de la Fase 6)
// matcheaba solo por palabras compartidas (rm_score >= 0.75), sin ninguna
// nocion de que TIPO de pregunta es -- ver n8n-workflows/fix-conocimiento-
// libre-aspecto.sql (correr ANTES que este script, crea la funcion rm_aspecto
// que esta query ahora usa) para el detalle completo del bug real encontrado
// (conv 1989: pregunta de precio contestada con una fila de otro cliente
// sobre stock) y el riesgo hermano en compatibilidad (respuestas del tipo
// "le va bien a la Guerrero DL 110" pudiendo prestarse a una moto distinta).
//
// Cambio: se agrega una condicion mas al WHERE -- si la consulta tiene un
// aspecto reconocido (precio o compatibilidad), la fila candidata solo sirve
// si comparte ese mismo aspecto (mirando pregunta+respuesta guardadas). Si la
// consulta es "generico" (no matchea ninguna palabra de precio/compatibilidad),
// no se agrega ninguna restriccion nueva -- comportamiento identico al actual
// para todo lo que no sea uno de esos dos aspectos.
//
// Solo cambia el texto de la query de un nodo Postgres existente -- no toca
// logica, nodos ni conexiones del workflow.
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-conocimiento-libre-aspecto_2026-08-17.json", import.meta.url);

const NODE_NAME = "Buscar en Conocimiento Libre (Sin Match)";

const OLD_QUERY =
  "SELECT sub.respuesta\n" +
  "FROM (SELECT 1) seed\n" +
  "LEFT JOIN LATERAL (\n" +
  "  SELECT respuesta FROM conocimiento_libre\n" +
  "  WHERE categoria = 'sin_match'\n" +
  "    AND array_length(rm_tokens('{{ $('Separar Pedazos').item.json.texto_sql }}'), 1) >= 3\n" +
  "    AND rm_score(clave || ' ' || pregunta, '{{ $('Separar Pedazos').item.json.texto_sql }}') >= 0.75\n" +
  "  ORDER BY creado_en DESC LIMIT 1\n" +
  ") sub ON '{{ $('Separar Pedazos').item.json.categoria }}' = 'otro' AND '{{ $('Parsear Respuesta Otro desde Detalle').item.json.resuelto }}' != 'true';";

const NEW_QUERY =
  "SELECT sub.respuesta\n" +
  "FROM (SELECT 1) seed\n" +
  "LEFT JOIN LATERAL (\n" +
  "  SELECT respuesta FROM conocimiento_libre\n" +
  "  WHERE categoria = 'sin_match'\n" +
  "    AND array_length(rm_tokens('{{ $('Separar Pedazos').item.json.texto_sql }}'), 1) >= 3\n" +
  "    AND rm_score(clave || ' ' || pregunta, '{{ $('Separar Pedazos').item.json.texto_sql }}') >= 0.75\n" +
  "    AND (rm_aspecto('{{ $('Separar Pedazos').item.json.texto_sql }}') = 'generico'\n" +
  "         OR rm_aspecto('{{ $('Separar Pedazos').item.json.texto_sql }}') = rm_aspecto(pregunta || ' ' || respuesta))\n" +
  "  ORDER BY creado_en DESC LIMIT 1\n" +
  ") sub ON '{{ $('Separar Pedazos').item.json.categoria }}' = 'otro' AND '{{ $('Parsear Respuesta Otro desde Detalle').item.json.resuelto }}' != 'true';";

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

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const node = wf.nodes.find((n) => n.name === NODE_NAME);
  if (!node) throw new Error(`No se encontro el nodo "${NODE_NAME}"`);
  if (node.parameters.query !== OLD_QUERY) {
    throw new Error(`La query de "${NODE_NAME}" no coincide con lo esperado -- puede que ya se haya tocado. Revisar a mano antes de seguir.`);
  }
  node.parameters.query = NEW_QUERY;
  console.log(`Query de "${NODE_NAME}" actualizada.`);

  const allowedSettingsKeys = [
    "saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
    "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder",
  ];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => allowedSettingsKeys.includes(k)));

  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: JSON.stringify(body) });
  console.log("Actualizado. Nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const fresh = await api(`/workflows/${WORKFLOW_ID}`);
  const freshNode = fresh.nodes.find((n) => n.name === NODE_NAME);
  const ok = freshNode?.parameters.query === NEW_QUERY;
  console.log(`Verificacion "${NODE_NAME}":`, ok ? "OK" : "ALGO NO CUADRA");
  console.log(ok ? "Fix aplicado correctamente." : "REVISAR A MANO, algo no quedo como se esperaba.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
