// Correccion sobre el fix "pausa post-rafaga" (apply-fix-pausa-post-rafaga.mjs) del mismo dia:
// cuando el nuevo chequeo "¿Bot Pausado? (Post-Rafaga)" corta por pausa, va directo a "Armar Nota
// Bot Pausado" SIN pasar por "Vaciar Buffer" -- el mensaje agrupado (Redis, lista por telefono)
// nunca se limpia. La proxima vez que llega un mensaje de ese mismo numero (aunque sea horas
// despues y el bot ya este reactivado), "Traer Buffer" trae el contenido viejo pegado al nuevo, y
// "Unir Mensajes" los procesa juntos como si fueran una sola rafaga -- reproduciendo la pregunta
// vieja (ya "silenciada" por la pausa) mezclada con la nueva.
// Encontrado en la validacion en vivo del fix de pausa post-rafaga (conv 1, mismo dia): una
// pregunta de envios quedo pausada sin vaciar el buffer, y la siguiente pregunta de envios
// (ya con el bot prendido de nuevo) salio duplicada -- el bot contesto dos veces lo mismo porque
// "Dividir y Etiquetar Sub-preguntas" vio las dos preguntas de envio juntas en el mismo texto.
//
// Fix: nodo nuevo "Vaciar Buffer (Post-Rafaga Pausado)" (mismo Redis DELETE que "Vaciar Buffer",
// misma key), insertado entre "¿Bot Pausado? (Post-Rafaga)" (true) y "Armar Nota Bot Pausado".
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

(async () => {
  const wf = await apiGet(`/api/v1/workflows/${WORKFLOW_ID}`);
  fs.writeFileSync(
    new URL(`./workflow_backup_pre-fix-vaciar-buffer-pausado_2026-08-19.json`, import.meta.url),
    JSON.stringify(wf, null, 2)
  );
  console.log('backup re-confirmado, nodos:', wf.nodes.length);

  const vaciarBuffer = wf.nodes.find(n => n.name === 'Vaciar Buffer');
  if (!vaciarBuffer) throw new Error('No se encontro "Vaciar Buffer"');
  const gateIf = wf.nodes.find(n => n.name === '¿Bot Pausado? (Post-Rafaga)');
  if (!gateIf) throw new Error('No se encontro "¿Bot Pausado? (Post-Rafaga)" -- correr primero apply-fix-pausa-post-rafaga.mjs');

  const nuevoVaciar = {
    parameters: {
      operation: 'delete',
      key: vaciarBuffer.parameters.key,
    },
    type: 'n8n-nodes-base.redis',
    typeVersion: 1,
    position: [3360, 340],
    id: 'a7c4e1f2-3b8d-4a5e-9c6f-1d2e8b4a7c33',
    name: 'Vaciar Buffer (Post-Rafaga Pausado)',
    credentials: vaciarBuffer.credentials,
  };

  if (wf.nodes.some(n => n.name === 'Vaciar Buffer (Post-Rafaga Pausado)')) {
    console.log('El nodo ya existe, no se agrega de nuevo.');
  } else {
    wf.nodes.push(nuevoVaciar);
    console.log('OK: agregado nodo "Vaciar Buffer (Post-Rafaga Pausado)"');
  }

  const conns = wf.connections;
  const gateOut = conns['¿Bot Pausado? (Post-Rafaga)'].main[0];
  const teniaArmarNota = gateOut.some(c => c.node === 'Armar Nota Bot Pausado');
  if (!teniaArmarNota) throw new Error('No se encontro la conexion esperada ¿Bot Pausado? (Post-Rafaga) (true) -> Armar Nota Bot Pausado');
  conns['¿Bot Pausado? (Post-Rafaga)'].main[0] = [{ node: 'Vaciar Buffer (Post-Rafaga Pausado)', type: 'main', index: 0 }];
  conns['Vaciar Buffer (Post-Rafaga Pausado)'] = {
    main: [[{ node: 'Armar Nota Bot Pausado', type: 'main', index: 0 }]],
  };
  console.log('OK: true -> Vaciar Buffer (Post-Rafaga Pausado) -> Armar Nota Bot Pausado');

  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: conns,
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
