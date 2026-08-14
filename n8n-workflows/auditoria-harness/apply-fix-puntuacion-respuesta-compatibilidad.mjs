// Fix chico de seguimiento al fix anterior (apply-fix-simplificar-respuesta-
// compatibilidad.mjs, mismo dia): la plantilla nueva le pegaba un punto
// despues del modelo de moto Y despues una coma para el detalle, dejando
// ".," feo cuando habia detalle (ej. "...modelo 2021., confirmar si es de
// recorrido corto o largo."). Ahora el punto va una sola vez, al final de
// toda la frase (con o sin detalle).
// Detectado probando el fix anterior contra la conversacion de prueba
// (conv 1, Kit 8 pineado, pregunta por Guerrero Trip 110).
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-puntuacion-respuesta-compatibilidad_2026-08-14.json", import.meta.url);

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

const OLD_VALUE = "={{ ($json.compatible ? ('Sí, el kit es compatible con tu ' + $('Parsear Pregunta Compatibilidad').item.json.modelo_moto + '.') : ('No, el kit no es compatible con tu ' + $('Parsear Pregunta Compatibilidad').item.json.modelo_moto + '.')) + ($json.detalle ? (', ' + $json.detalle + '.') : '') }}";
const NEW_VALUE = "={{ ($json.compatible ? ('Sí, el kit es compatible con tu ' + $('Parsear Pregunta Compatibilidad').item.json.modelo_moto) : ('No, el kit no es compatible con tu ' + $('Parsear Pregunta Compatibilidad').item.json.modelo_moto)) + ($json.detalle ? (', ' + $json.detalle) : '') + '.' }}";

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const node = wf.nodes.find((n) => n.name === "Preparar Respuesta Compatibilidad");
  if (!node) throw new Error('No se encontro el nodo "Preparar Respuesta Compatibilidad"');
  const asg = node.parameters?.assignments?.assignments?.[0];
  if (!asg || asg.value !== OLD_VALUE) {
    throw new Error('El expression de "Preparar Respuesta Compatibilidad" no es el esperado -- puede que ya se haya tocado. Revisar a mano antes de seguir.');
  }
  asg.value = NEW_VALUE;
  console.log('Expression de "Preparar Respuesta Compatibilidad" actualizado.');

  const allowedSettingsKeys = [
    "saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
    "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder",
  ];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => allowedSettingsKeys.includes(k)));

  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: JSON.stringify(body) });
  console.log("Actualizado. Nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const fresh = await api(`/workflows/${WORKFLOW_ID}`);
  const freshNode = fresh.nodes.find((n) => n.name === "Preparar Respuesta Compatibilidad");
  const freshAsg = freshNode?.parameters?.assignments?.assignments?.[0];
  const ok = freshAsg?.value === NEW_VALUE;
  console.log('Verificacion "Preparar Respuesta Compatibilidad":', ok ? "OK" : "ALGO NO CUADRA");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
