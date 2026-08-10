// Version corregida de bateria.js: en vez de esperar que llegue un mensaje
// nuevo a mock-chatwoot (lo que genero condiciones de carrera con el modelo
// de 12B), espera a que la EJECUCION de n8n para ese mensaje termine
// (success/error via sqlite) antes de mandar el siguiente. Asi cada turno
// es realmente secuencial, y de paso queda el tiempo real de cada uno.
const { spawn, execFileSync } = require('child_process');
const http = require('http');

const CONV_ID = 1;
const MOCK = 'http://localhost:4000';
const N8N_DB = 'C:/Users/marti/.n8n/database.sqlite';
const SQLITE3_MODULE = 'C:/Users/marti/AppData/Roaming/npm/node_modules/n8n/node_modules/sqlite3';

function sendLocal(content, msgId) {
  return new Promise((resolve, reject) => {
    const p = spawn('node', ['send-local.js', JSON.stringify({ content, senderType: 'contact', msgId, convId: CONV_ID })]);
    let out = '';
    p.stdout.on('data', d => out += d);
    p.on('close', () => resolve(out.trim()));
    p.on('error', reject);
  });
}

function lastExecutionId() {
  return new Promise((resolve, reject) => {
    const sqlite3 = require(SQLITE3_MODULE);
    const db = new sqlite3.Database(N8N_DB, sqlite3.OPEN_READONLY);
    db.all('SELECT id FROM execution_entity ORDER BY id DESC LIMIT 1', (err, rows) => {
      db.close();
      if (err) reject(err); else resolve(rows[0] ? rows[0].id : 0);
    });
  });
}

function executionStatus(id) {
  return new Promise((resolve, reject) => {
    const sqlite3 = require(SQLITE3_MODULE);
    const db = new sqlite3.Database(N8N_DB, sqlite3.OPEN_READONLY);
    db.all('SELECT id, status, startedAt, stoppedAt FROM execution_entity WHERE id = ?', [id], (err, rows) => {
      db.close();
      if (err) reject(err); else resolve(rows[0] || null);
    });
  });
}

async function waitForNewExecutionToFinish(beforeId, maxWaitMs) {
  const deadline = Date.now() + maxWaitMs;
  let targetId = null;
  // 1. esperar a que aparezca una ejecucion nueva (id > beforeId)
  while (Date.now() < deadline) {
    const id = await lastExecutionId();
    if (id > beforeId) { targetId = id; break; }
    await new Promise(r => setTimeout(r, 1500));
  }
  if (!targetId) throw new Error('no aparecio ejecucion nueva dentro del timeout');
  // 2. esperar a que esa ejecucion (o alguna posterior) termine
  while (Date.now() < deadline) {
    const id = await lastExecutionId();
    const exec = await executionStatus(id);
    if (exec && exec.status !== 'running' && exec.status !== 'waiting' && exec.status !== 'new') {
      return exec;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('timeout esperando que termine la ejecucion');
}

function fetchMessages() {
  return new Promise((resolve, reject) => {
    http.get(`${MOCK}/_ui/conversations/${CONV_ID}/messages`, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d).messages); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function reset() {
  return new Promise((resolve, reject) => {
    const req = http.request(`${MOCK}/_reset`, { method: 'POST' }, res => { res.on('data', () => {}); res.on('end', resolve); });
    req.on('error', reject);
    req.end();
  });
}

const casos = [
  { content: 'cuanto sale el kit 120?', label: 'Saludo kit 120' },
  { content: 'y para la keller 110 anda?', label: 'Continuidad sin decir "kit" (compatible)' },
  { content: 'y en la wave s tambien anda?', label: 'Continuidad, moto NO compatible' },
  { content: 'y la corven 110 le va bien?', label: 'Ambiguo recorrido corto/largo' },
];

(async () => {
  await reset();
  let msgId = 200;
  const antesDeMsgs = (await fetchMessages()).length;
  for (let i = 0; i < casos.length; i++) {
    const { content, label } = casos[i];
    console.log(`\n=== [${i + 1}/${casos.length}] ${label} ===`);
    console.log('Cliente:', content);
    const beforeExecId = await lastExecutionId();
    const t0 = Date.now();
    await sendLocal(content, msgId++);
    const exec = await waitForNewExecutionToFinish(beforeExecId, 300000);
    const segs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`(ejecucion #${exec.id}, status=${exec.status}, ${segs}s pared a pared)`);
    const msgs = await fetchMessages();
    const last = msgs[msgs.length - 1];
    console.log('Bot:', last ? last.content : '(sin mensaje nuevo)');
  }
  console.log('\n=== listo ===');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
