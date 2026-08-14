// Resume varias ejecuciones: mensaje entrante (body.content) + nodos que mandan mensajes/notas.
// Uso: API_KEY_N8N=... node summarize_execs.mjs <id1> <id2> ...
import https from 'https';

const API_KEY = process.env.API_KEY_N8N || process.env.APIKEY_N8N;
const ids = process.argv.slice(2);

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

const INTERESTING_KEYWORDS = ['content', 'mensaje', 'texto', 'respuesta', 'nota', 'clasific', 'partes', 'sub', 'compat', 'kit', 'resto', 'primer_mensaje', 'sin_match'];

(async () => {
  for (const id of ids) {
    const full = await apiGet(`/api/v1/executions/${id}?includeData=true`);
    const rd = full.data?.resultData?.runData;
    console.log(`\n\n########## EJECUCION ${id} (${full.startedAt}) status=${full.status} ##########`);
    if (!rd) { console.log('sin runData'); continue; }

    const wh = rd['Webhook1'];
    const body = wh?.[0]?.data?.main?.[0]?.[0]?.json?.body;
    console.log('--- MENSAJE ENTRANTE: content =', JSON.stringify(body?.content), '---');

    for (const [name, runs] of Object.entries(rd)) {
      if (['Webhook1', 'Solo mensajes creados', 'Es mensaje entrante'].includes(name)) continue;
      const looksInteresting = /clasific|unir mensajes|mensaje|nota|respuesta|compat|partes|sub-preg|dividir|kit pin|detalle|extraer|redactar|consolidar|enviar|http request/i.test(name);
      if (!looksInteresting) continue;
      for (const r of runs) {
        const out = r.data?.main?.[0]?.[0]?.json;
        if (!out) continue;
        console.log(`\n--- NODO: ${name} ---`);
        console.log(JSON.stringify(out, null, 2).slice(0, 1200));
      }
    }
  }
})();
