// Igual que wait_exec.js pero apuntado al workflow "Respuestas chatwoot 2.0"
// (s7EpPTjNFy6iCclg) en vez del workflow_mateo viejo.
// Uso: API_KEY_N8N=... node wait_exec_2_0.mjs <msgIdBuscado> <sentAtISO> [maxWaitMs]
import https from 'https';

const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY;
const WORKFLOW_ID = 's7EpPTjNFy6iCclg';
const msgId = process.argv[2];
const sentAt = new Date(process.argv[3]).getTime();
const maxWait = Number(process.argv[4] || 150000);

function apiGet(path) {
  return new Promise((resolve, reject) => {
    https.get({
      host: 'n8n.revolucionmotos.tech', path,
      headers: { 'X-N8N-API-KEY': API_KEY },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('bad json: ' + data.slice(0,200))); }
      });
    }).on('error', reject);
  });
}

function getOut(rd, nodeName, idx) {
  const r = rd[nodeName];
  if (!r || !r[idx===undefined?0:idx]) return null;
  const d = r[idx===undefined?0:idx].data;
  if (!d || !d.main || !d.main[0] || !d.main[0][0]) return null;
  return d.main[0][0].json;
}

(async () => {
  const deadline = Date.now() + maxWait;
  let found = null;
  while (Date.now() < deadline) {
    const list = await apiGet(`/api/v1/executions?workflowId=${WORKFLOW_ID}&limit=30`);
    for (const e of list.data) {
      if (new Date(e.startedAt).getTime() >= sentAt - 120000 && e.status !== 'running' && e.status !== 'waiting') {
        const full = await apiGet(`/api/v1/executions/${e.id}?includeData=true`);
        const rd = full.data?.resultData?.runData;
        if (!rd) continue;
        const wh = getOut(rd, 'Webhook1');
        if (wh && String(wh.body?.id) === String(msgId)) { found = full; break; }
      }
    }
    if (found) break;
    await new Promise(r => setTimeout(r, 3000));
  }

  if (!found) {
    console.log(JSON.stringify({ error: 'no se encontro ejecucion para msgId ' + msgId + ' dentro del timeout' }));
    process.exit(1);
  }

  const rd = found.data.resultData.runData;
  const rows = [];
  for (const [name, runs] of Object.entries(rd)) for (const r of runs) rows.push({ name, startTime: r.startTime, error: r.error ? (r.error.message||JSON.stringify(r.error)).slice(0,300) : null });
  rows.sort((a,b) => a.startTime - b.startTime);

  const summary = {
    executionId: found.id,
    status: found.status,
    nodePath: rows.map(r => r.name),
    errors: rows.filter(r => r.error).map(r => ({ name: r.name, error: r.error })),
  };

  const contexto = getOut(rd, 'Preparar Contexto Sub-preguntas');
  if (contexto) summary.kitPineado = contexto;
  const split = getOut(rd, 'Parsear Sub-preguntas');
  if (split) summary.partes = split.partes;
  const armado = getOut(rd, 'Armar Mensajes');
  if (armado) summary.armado = armado;

  console.log(JSON.stringify(summary, null, 2));
})();
