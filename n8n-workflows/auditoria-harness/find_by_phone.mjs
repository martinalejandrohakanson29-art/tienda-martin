// Busca ejecuciones del workflow "Respuestas chatwoot 2.0" cuyo webhook body contenga un telefono dado.
// Uso: API_KEY_N8N=... node find_by_phone.mjs <telefono> [maxPages]
import https from 'https';

const API_KEY = process.env.API_KEY_N8N || process.env.APIKEY_N8N;
const WORKFLOW_ID = 's7EpPTjNFy6iCclg';
const phone = process.argv[2];
const maxPages = Number(process.argv[3] || 60);

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

(async () => {
  let cursor = null;
  let page = 0;
  const matches = [];
  while (page < maxPages) {
    const path = `/api/v1/executions?workflowId=${WORKFLOW_ID}&limit=50&includeData=true` + (cursor ? '&cursor=' + cursor : '');
    const j = await apiGet(path);
    if (!j.data) { console.log('ERR', JSON.stringify(j)); break; }
    for (const e of j.data) {
      const rd = e.data?.resultData?.runData;
      if (!rd) continue;
      const wh = rd['Webhook1'];
      if (!wh || !wh[0]) continue;
      const body = wh[0].data?.main?.[0]?.[0]?.json?.body;
      const str = JSON.stringify(body || {});
      if (str.includes(phone)) {
        matches.push({ id: e.id, startedAt: e.startedAt, status: e.status });
      }
    }
    console.log(`page ${page}: ${j.data.length} execs, matches so far: ${matches.length}, last startedAt: ${j.data[j.data.length-1]?.startedAt}`);
    if (!j.nextCursor) { console.log('no more pages'); break; }
    cursor = j.nextCursor;
    page++;
  }
  console.log(JSON.stringify(matches, null, 2));
})();
