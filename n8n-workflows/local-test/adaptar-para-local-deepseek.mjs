// Variante de adaptar-para-local.mjs: en vez de swapear los nodos DeepSeek por
// un LLM local (esta maquina no tiene VRAM para eso), los deja TAL CUAL
// (lmChatDeepSeek) y solo les cambia la credencial a la real de DeepSeek
// (misma API que usa produccion), asi el comportamiento del modelo es
// identico al real. Solo cambian Postgres/Redis (locales) y Config Chatwoot
// (mock local). No toca produccion.
import fs from 'fs';

const wf = JSON.parse(fs.readFileSync('workflow_prod_current.json', 'utf8'));

const CRED_POSTGRES_LOCAL = { id: 'tz5Wr9Pqx3VLtZOO', name: 'Postgres Local Test' };
const CRED_REDIS_LOCAL = { id: 'qVBK0D5Vr71CyUxN', name: 'Redis Local Test' };
const CRED_DEEPSEEK_REAL = { id: 'Sb8ZNh0iFk7xsfor', name: 'DeepSeek real' };

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
  if (n.credentials && n.credentials.deepSeekApi) {
    n.credentials.deepSeekApi = CRED_DEEPSEEK_REAL;
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
wf.name = 'workflow_mateo — LOCAL (DeepSeek real)';
wf.active = false;

fs.writeFileSync('workflow_local_deepseek.json', JSON.stringify(wf, null, 2));
console.log('OK, escrito workflow_local_deepseek.json,', wf.nodes.length, 'nodos');
