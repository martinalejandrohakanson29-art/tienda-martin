// Toma workflow_prod_current.json (bajado en caliente de produccion, con
// todos los fixes de hoy) y arma una copia adaptada para correr 100% local:
// - Postgres/Redis -> credenciales locales ya existentes en este n8n local
//   (Postgres Local Test / Redis Local Test, contra revolucion_motos_test).
// - Los 2 nodos DeepSeek -> lmChatOpenAi contra el server OpenAI-compatible
//   local de llama.cpp (credencial "Gemma Local (OpenAI compat)", que ya
//   apunta a http://127.0.0.1:8080/v1 - hoy ahi corre Qwen3.5-0.8B).
// - Config Chatwoot -> chatwoot_api/app_url apuntando al mock local (puerto
//   4000) en vez de a Chatwoot/la app reales.
// No toca produccion: esto se importa en el n8n local (puerto 5678), un
// servidor totalmente distinto.
import fs from 'fs';

const wf = JSON.parse(fs.readFileSync('workflow_prod_current.json', 'utf8'));

const CRED_POSTGRES_LOCAL = { id: 'IGFlCi7Aciid7cnS', name: 'Postgres Local Test' };
const CRED_REDIS_LOCAL = { id: 'sqV1scglYZ41xcdW', name: 'Redis Local Test' };
const CRED_OPENAI_LOCAL = { id: 'qWstJVywtfBc1q6r', name: 'Gemma Local (OpenAI compat)' };
const QWEN_MODEL_ID = 'C:\\Users\\marti\\Desktop\\Martin\\proyectos\\llama.cpp\\Qwen3.5-0.8B-BF16.gguf';

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
      model: { __rl: true, value: QWEN_MODEL_ID, mode: 'list', cachedResultName: QWEN_MODEL_ID },
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
wf.name = 'workflow_mateo — LOCAL (Qwen3.5-0.8B)';
wf.active = false; // lo activamos a mano despues de revisar

fs.writeFileSync('workflow_local.json', JSON.stringify(wf, null, 2));
console.log('OK, escrito workflow_local.json,', wf.nodes.length, 'nodos');
