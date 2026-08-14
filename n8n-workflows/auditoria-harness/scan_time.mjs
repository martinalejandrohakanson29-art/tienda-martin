import https from 'https';
import fs from 'fs';

const API_KEY = fs.readFileSync(process.env.N8N_KEY_FILE, 'utf8').trim();

function apiGet(path) {
  return new Promise((resolve, reject) => {
    https.get({ host: 'n8n.revolucionmotos.tech', path, headers: { 'X-N8N-API-KEY': API_KEY } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('bad json: ' + data.slice(0,300))); } });
    }).on('error', reject);
  });
}

const stopBefore = new Date(process.argv[2]).getTime(); // stop once last.startedAt < this

(async () => {
  let cursor = null;
  let page = 0;
  while (page < 200) {
    const path = '/api/v1/executions?workflowId=s7EpPTjNFy6iCclg&limit=100' + (cursor ? '&cursor=' + cursor : '');
    const j = await apiGet(path);
    if (!j.data) { console.log('ERR', JSON.stringify(j)); break; }
    const first = j.data[0], last = j.data[j.data.length - 1];
    console.log('page', page, 'first', first?.id, first?.startedAt, 'last', last?.id, last?.startedAt);
    if (last && new Date(last.startedAt).getTime() < stopBefore) {
      console.log('reached target range, stopping');
      break;
    }
    if (!j.nextCursor) { console.log('no more pages'); break; }
    cursor = j.nextCursor;
    page++;
  }
})();
