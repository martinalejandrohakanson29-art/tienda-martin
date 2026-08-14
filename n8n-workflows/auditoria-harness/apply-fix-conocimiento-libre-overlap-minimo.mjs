// Fix 2026-08-14: "Buscar en Conocimiento Libre (Sin Match)" (rama "otro" del partidor de
// sub-preguntas, Fase 6) matcheaba con 100% de confianza mensajes cortos del cliente que
// compartian solo 2 palabras genericas del rubro con una fila guardada, sin relacion real
// con lo que el cliente pregunto.
//
// Caso real: contacto +5493837432917 (conv 584), 2026-08-14. El bot ya le habia confirmado
// que el kit andaba en su "motomel 110 corta". El cliente contesto "Si ese recorrido corto"
// -- una confirmacion, no una pregunta nueva. Tras sacarle palabras cortas/vacias, el texto
// quedo reducido a 2 tokens: {recorrido, corto}. Habia una fila en conocimiento_libre
// (categoria sin_match, aprendida esa misma manana de OTRA conversacion) con pregunta
// "Se lo quiero poner a un honda wave nf 100. Recorrido corto de cigueñal" -- contiene esas
// mismas 2 palabras en cualquier lugar del texto, asi que rm_score dio 1.000 (100%), muy por
// encima del umbral de la query (>= 0.75). El bot le contesto al cliente "No es compatible
// con la Honda Wave NF 100." -- una moto que jamas menciono.
//
// Misma familia del fix de rm_modelo_ok de hoy (fix-modelo-ok-overlap-minimo.sql): con solo
// 2 palabras exigidas como piso, y siendo "recorrido"/"corto" terminologia comun del rubro
// (el Kit 8 tiene variante corta/larga), 2 de 2 alcanza el 100% aunque no tenga nada que ver.
//
// Fix acotado: subir el piso minimo de palabras de la consulta de 2 a 3 en la query de este
// nodo puntual. Un mensaje tan corto como "si ese recorrido corto" ya no dispara el matcheo
// aproximado contra conocimiento_libre y cae directo a escalar en silencio al equipo (camino
// de respaldo de siempre). No se toca rm_score() ni el umbral de 0.75 -- se usan en otros
// lados con su propia calibracion.
//
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-conocimiento-libre-overlap-minimo_2026-08-14.json", import.meta.url);

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

const NODE_NAME = "Buscar en Conocimiento Libre (Sin Match)";

const OLD_QUERY = "SELECT sub.respuesta\nFROM (SELECT 1) seed\nLEFT JOIN LATERAL (\n  SELECT respuesta FROM conocimiento_libre\n  WHERE categoria = 'sin_match'\n    AND array_length(rm_tokens('{{ $('Separar Pedazos').item.json.texto_sql }}'), 1) >= 2\n    AND rm_score(clave || ' ' || pregunta, '{{ $('Separar Pedazos').item.json.texto_sql }}') >= 0.75\n  ORDER BY creado_en DESC LIMIT 1\n) sub ON '{{ $('Separar Pedazos').item.json.categoria }}' = 'otro';";

const NEW_QUERY = "SELECT sub.respuesta\nFROM (SELECT 1) seed\nLEFT JOIN LATERAL (\n  SELECT respuesta FROM conocimiento_libre\n  WHERE categoria = 'sin_match'\n    AND array_length(rm_tokens('{{ $('Separar Pedazos').item.json.texto_sql }}'), 1) >= 3\n    AND rm_score(clave || ' ' || pregunta, '{{ $('Separar Pedazos').item.json.texto_sql }}') >= 0.75\n  ORDER BY creado_en DESC LIMIT 1\n) sub ON '{{ $('Separar Pedazos').item.json.categoria }}' = 'otro';";

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const node = wf.nodes.find((n) => n.name === NODE_NAME);
  if (!node) throw new Error(`No se encontro el nodo "${NODE_NAME}"`);
  if (node.parameters.query !== OLD_QUERY) {
    throw new Error(`La query de "${NODE_NAME}" no es la esperada -- revisar a mano.`);
  }
  node.parameters.query = NEW_QUERY;

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
  console.log(ok ? "Fix aplicado correctamente." : "REVISAR A MANO.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
