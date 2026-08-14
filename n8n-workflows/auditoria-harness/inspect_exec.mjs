// Inspecciona una ejecucion puntual: camino de nodos + inputs/outputs clave.
// Uso: API_KEY_N8N=... node inspect_exec.mjs <execId>
import https from 'https';

const API_KEY = process.env.API_KEY_N8N || process.env.APIKEY_N8N;
const execId = process.argv[2];

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
  const full = await apiGet(`/api/v1/executions/${execId}?includeData=true`);
  const rd = full.data?.resultData?.runData;
  if (!rd) { console.log('sin runData', JSON.stringify(full).slice(0,500)); return; }

  const rows = [];
  for (const [name, runs] of Object.entries(rd)) {
    for (const r of runs) {
      const out = r.data?.main?.[0]?.[0]?.json;
      rows.push({ name, startTime: r.startTime, error: r.error ? (r.error.message||JSON.stringify(r.error)).slice(0,300) : null, out });
    }
  }
  rows.sort((a,b) => a.startTime - b.startTime);

  console.log('=== EJECUCION', execId, 'status:', full.status, '===');
  for (const r of rows) {
    console.log('\n--- NODO:', r.name, r.error ? '(ERROR: ' + r.error + ')' : '', '---');
    if (r.out) console.log(JSON.stringify(r.out, null, 2).slice(0, 2000));
  }
})();
