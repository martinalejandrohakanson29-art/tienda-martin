// Fix chico "eco de la pregunta del cliente en la respuesta redactada": Redactar Respuesta desde
// Dato a veces repite literalmente la pregunta del cliente como prefijo antes del dato, ej.
// "Pasame la dire: estamos en Revolucion de Mayo 1605...". El prompt nunca le prohibia citar la
// pregunta, solo le decia que use unicamente el "Dato aprobado". Encontrado en la misma auditoria
// de la conv 2141 (+5493535645945), 2026-08-19.
// Fix: una linea nueva en el systemMessage. Solo texto de prompt, no toca logica ni conexiones.
import https from 'https';
import fs from 'fs';

const API_KEY = process.env.API_KEY_N8N || process.env.APIKEY_N8N;
const WORKFLOW_ID = 's7EpPTjNFy6iCclg';

function apiGet(path) {
  return new Promise((resolve, reject) => {
    https.get({ host: 'n8n.revolucionmotos.tech', path, headers: { 'X-N8N-API-KEY': API_KEY } }, (res) => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('bad json: ' + data.slice(0, 300))); } });
    }).on('error', reject);
  });
}

function apiPut(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      host: 'n8n.revolucionmotos.tech', path, method: 'PUT',
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let out = ''; res.on('data', c => out += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(out) }); } catch (e) { resolve({ status: res.statusCode, body: out }); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const AGREGADO = ' No repitas ni cites la pregunta del cliente en tu respuesta (nada de "Pregunta: ..." ni "[pregunta]: [dato]") -- arrancá directo con el dato, en una frase natural.';

(async () => {
  const wf = await apiGet(`/api/v1/workflows/${WORKFLOW_ID}`);
  fs.writeFileSync(
    new URL(`./workflow_backup_pre-fix-echo-pregunta-redaccion_2026-08-19.json`, import.meta.url),
    JSON.stringify(wf, null, 2)
  );
  console.log('backup re-confirmado, nodos:', wf.nodes.length);

  const node = wf.nodes.find(n => n.name === 'Redactar Respuesta desde Dato');
  if (!node) throw new Error('No se encontro el nodo "Redactar Respuesta desde Dato"');

  const actual = node.parameters.options.systemMessage;
  if (actual.includes('No repitas ni cites la pregunta del cliente')) {
    console.log('El prompt ya tiene el agregado, no se duplica.');
  } else {
    node.parameters.options.systemMessage = actual + AGREGADO;
    console.log('OK: agregada instruccion anti-eco al systemMessage de "Redactar Respuesta desde Dato"');
  }

  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings,
  };

  const res = await apiPut(`/api/v1/workflows/${WORKFLOW_ID}`, payload);
  console.log('PUT status:', res.status);
  if (res.status >= 300) {
    console.log(JSON.stringify(res.body, null, 2).slice(0, 2000));
    process.exit(1);
  }
  console.log('Workflow actualizado OK.');
})();
