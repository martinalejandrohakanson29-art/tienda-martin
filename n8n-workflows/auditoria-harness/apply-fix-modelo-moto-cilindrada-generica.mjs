// Fix: "Extraer Pregunta Compatibilidad" metia en modelo_moto cualquier
// mencion de cilindrada generica del motor (ej. "un motor 110", "110cc")
// igual que si fuera una moto real (ej. "Zanella ZB 110"). El negocio es
// especificamente de motos 110cc chinas, asi que casi cualquier mensaje
// menciona "110" en algun lado -- guardar eso como modelo_moto es peligroso
// porque termina en `compatibilidades` (si se contesta por el panel nuevo,
// ver apply-fix-respuesta-tecnica-ui.mjs) y `rm_modelo_ok` matchea por
// palabras compartidas: una fila con modelo_moto tan generico ("motor 110")
// puede prestarle su compatibilidad a cualquier moto futura que solo
// comparta esa palabra -- mismo problema de fondo que el fix de
// fix-modelo-ok-overlap-minimo.sql (2026-08-14), pero originado en el dato
// guardado en vez de en el matching.
// Caso real: contacto/conv 2007, 2026-08-15, escribio la plantilla del Kit 8
// + "Vienen listos para instalar en un motor 110" -- quedo pendiente (id 83)
// con modelo_moto = "motor 110".
// Fix acotado: se agrega una regla al prompt para que la mencion de SOLO
// cilindrada/tipo de motor generico (sin marca ni modelo puntual) no cuente
// como modelo_moto valido -- queda vacio, la pregunta sigue siendo
// compatibilidad (es_compatibilidad puede seguir true) pero sin ensuciar
// modelo_moto. No resuelve que esa pregunta se autoconteste sola desde el
// detalle del kit (eso es el segundo paso, mas grande, pendiente de charlar).
// Solo texto de prompt, no toca logica ni conexiones.
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-modelo-moto-cilindrada-generica_2026-08-16.json", import.meta.url);

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

const OLD =
  'modelo_moto es el modelo de moto que menciona, tal cual lo escribio. Si no menciona ningun modelo con claridad, dejalo como string vacio "". No inventes un modelo que no este en el mensaje.';

const NEW =
  'modelo_moto es el modelo de moto que menciona, tal cual lo escribio -- pero solo cuenta si es una moto real identificable (marca y/o modelo puntual, ej. "Zanella ZB 110", "Gilera Smash", "Yamaha Crypton 110"). Si el cliente SOLO menciona la cilindrada o el tipo de motor en general (ej. "un motor 110", "110cc", "un 110", "moto china de 110") sin nombrar marca ni modelo puntual, eso NO es un modelo_moto valido -- dejalo como string vacio "" igual (la pregunta puede seguir siendo de compatibilidad, es_compatibilidad true, simplemente sin modelo identificado). Si no menciona ningun modelo con claridad, dejalo como string vacio "". No inventes un modelo que no este en el mensaje.';

const NODE_NAME = "Extraer Pregunta Compatibilidad";

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const node = wf.nodes.find((n) => n.name === NODE_NAME);
  if (!node) throw new Error(`No se encontro el nodo "${NODE_NAME}"`);
  const msg = node.parameters.options?.systemMessage;
  if (!msg || !msg.includes(OLD)) {
    throw new Error(`El systemMessage de "${NODE_NAME}" no contiene el texto esperado -- puede que ya se haya tocado. Revisar a mano antes de seguir.`);
  }
  node.parameters.options.systemMessage = msg.replace(OLD, NEW);
  console.log(`Prompt de "${NODE_NAME}" actualizado.`);

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
  const freshMsg = freshNode?.parameters.options?.systemMessage || "";
  const ok = freshMsg.includes(NEW) && !freshMsg.includes(OLD);
  console.log(`Verificacion "${NODE_NAME}":`, ok ? "OK" : "ALGO NO CUADRA");
  console.log(ok ? "Fix aplicado correctamente." : "REVISAR A MANO, algo no quedo como se esperaba.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
