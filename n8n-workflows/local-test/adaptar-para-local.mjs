// Toma un export de produccion (con todos los fixes al dia) y arma una copia
// adaptada para correr 100% local:
// - Postgres/Redis -> credenciales locales ya existentes en este n8n local
//   (Postgres Local Test / Redis Local Test, contra revolucion_motos_test).
// - Los 2 nodos DeepSeek -> lmChatOpenAi contra el server OpenAI-compatible
//   local de llama.cpp (credencial "Gemma Local (OpenAI compat)", puerto
//   8080). El nombre del modelo es solo informativo: llama-server ignora el
//   campo "model" del request y sirve lo que tenga cargado en memoria.
// - Config Chatwoot -> chatwoot_api/app_url apuntando al mock local (puerto
//   4000) en vez de a Chatwoot/la app reales.
// No toca produccion: esto se importa en el n8n local (puerto 5678), un
// servidor totalmente distinto.
import fs from 'fs';

const SOURCE = process.argv[2] || 'workflow_prod_current.json';
const OUTPUT = process.argv[3] || 'workflow_local.json';
const LOCAL_MODEL_ID = process.argv[4] || 'Gemma-4-12B';

const wf = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));

const CRED_POSTGRES_LOCAL = { id: 'IGFlCi7Aciid7cnS', name: 'Postgres Local Test' };
const CRED_REDIS_LOCAL = { id: 'sqV1scglYZ41xcdW', name: 'Redis Local Test' };
const CRED_OPENAI_LOCAL = { id: 'qWstJVywtfBc1q6r', name: 'Gemma Local (OpenAI compat)' };

let swapped = { postgres: 0, redis: 0, deepseek: 0 };

for (const n of wf.nodes) {
  if (n.credentials && n.credentials.postgres) {
    n.credentials.postgres = CRED_POSTGRES_LOCAL;
    swapped.postgres++;
  }
  if (n.credentials && n.credentials.redis) {
    n.credentials.redis = CRED_REDIS_LOCAL;
    swapped.redis++;
  }
  if (n.type === '@n8n/n8n-nodes-langchain.lmChatDeepSeek') {
    n.type = '@n8n/n8n-nodes-langchain.lmChatOpenAi';
    n.typeVersion = 1.2;
    n.parameters = {
      model: { __rl: true, value: LOCAL_MODEL_ID, mode: 'list', cachedResultName: LOCAL_MODEL_ID },
      options: {},
    };
    n.credentials = { openAiApi: CRED_OPENAI_LOCAL };
    swapped.deepseek++;
  }
}
console.log('swapped:', swapped);

const cfg = wf.nodes.find(n => n.name === 'Config Chatwoot');
if (!cfg) throw new Error('no se encontro Config Chatwoot');
for (const a of cfg.parameters.assignments.assignments) {
  if (a.name === 'chatwoot_api') a.value = 'http://localhost:4000/api/v1';
  if (a.name === 'app_url') a.value = 'http://localhost:4000';
}
console.log('Config Chatwoot actualizado');

// Transcripcion de audio -> tambien local (el server de llama.cpp expone
// /v1/audio/transcriptions, formato Whisper-compatible) en vez de la
// Whisper API real de OpenAI. Sin esto cualquier nota de voz le pegaria a
// api.openai.com con la cuenta real.
const transcribe = wf.nodes.find(n => n.name === 'Transcribe a recording1');
if (transcribe) {
  transcribe.parameters.url = 'http://127.0.0.1:8080/v1/audio/transcriptions';
  transcribe.credentials = { openAiApi: CRED_OPENAI_LOCAL };
  console.log('Transcribe a recording1 -> local');
}

// Nuevo workflow separado: sin id (que n8n asigne uno nuevo), nombre claro.
delete wf.id;
delete wf.versionId;
delete wf.activeVersionId;
delete wf.versionCounter;
delete wf.shared;
delete wf.triggerCount;
delete wf.createdAt;
delete wf.updatedAt;
delete wf.tags;
delete wf.activeVersion;
wf.name = `workflow_mateo — LOCAL (${LOCAL_MODEL_ID})`;
wf.active = false; // lo activamos a mano despues de revisar

fs.writeFileSync(OUTPUT, JSON.stringify(wf, null, 2));
console.log('OK, escrito', OUTPUT, ',', wf.nodes.length, 'nodos');
