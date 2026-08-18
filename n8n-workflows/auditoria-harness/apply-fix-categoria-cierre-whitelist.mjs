// Segunda parte del fix de la categoria "cierre" (ver
// apply-feat-categoria-cierre.mjs, aplicado antes en la misma sesion).
//
// Al validar con la conversacion de prueba, "cierre" nunca aparecia en la
// salida final aunque el prompt de "Dividir y Etiquetar Sub-preguntas" ya
// la tenia bien definida -- ni siquiera con el ejemplo mas obvio posible
// ("Gracias!", sin nada mas en el mensaje ni en el historial). La causa
// real: "Parsear Sub-preguntas" (el Code node que interpreta el JSON que
// devuelve la IA) tiene su propia lista blanca hardcodeada de categorias
// validas ('precio', 'envio', 'negocio', 'otro') -- cualquier categoria que
// no este ahi se pisa en silencio a 'otro' antes de llegar a "Consolidar
// Dato Resuelto". Se paso por alto este nodo intermedio al armar el primer
// cambio.
//
// Fix: agregar 'cierre' a esa lista. Un solo array, sin tocar el resto de
// la logica del node.
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-categoria-cierre-whitelist_2026-08-18.json", import.meta.url);

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

  const node = wf.nodes.find((n) => n.name === "Parsear Sub-preguntas");
  if (!node) throw new Error('No se encontro el nodo "Parsear Sub-preguntas"');

  const OLD = `const categoriasValidas = ['precio', 'envio', 'negocio', 'otro'];`;
  const NEW = `const categoriasValidas = ['precio', 'envio', 'negocio', 'cierre', 'otro'];`;

  if (!node.parameters.jsCode.includes(OLD)) {
    throw new Error('El array "categoriasValidas" no coincide con lo esperado -- puede que ya se haya tocado. Revisar a mano antes de seguir.');
  }
  node.parameters.jsCode = node.parameters.jsCode.replace(OLD, NEW);
  console.log('Whitelist de "Parsear Sub-preguntas" actualizada (cierre agregada).');

  const allowedSettingsKeys = [
    "saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
    "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder",
  ];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => allowedSettingsKeys.includes(k)));

  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: JSON.stringify(body) });
  console.log("Actualizado. Nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const fresh = await api(`/workflows/${WORKFLOW_ID}`);
  const freshNode = fresh.nodes.find((n) => n.name === "Parsear Sub-preguntas");
  const ok = freshNode?.parameters.jsCode.includes(NEW);
  console.log('Verificacion "Parsear Sub-preguntas":', ok ? "OK" : "ALGO NO CUADRA");
  console.log(ok ? "Fix aplicado correctamente." : "REVISAR A MANO, algo no quedo como se esperaba.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
