// Corre la bateria completa de pruebas (welcome, continuidad, negativo,
// ambiguo) en secuencia contra el n8n local, esperando cada respuesta antes
// de mandar la siguiente (el orden importa: cada mensaje depende del
// historial que dejo el anterior). Imprime cada respuesta a medida que llega.
const http = require('http');
const CONV_ID = 1;
const MOCK = 'http://localhost:4000';

function sendLocal(content, msgId) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const p = spawn('node', ['send-local.js', JSON.stringify({ content, senderType: 'contact', msgId, convId: CONV_ID })]);
    let out = '';
    p.stdout.on('data', d => out += d);
    p.on('close', () => resolve(out.trim()));
    p.on('error', reject);
  });
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

async function waitForCount(n, maxWaitMs) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const msgs = await fetchMessages();
    if (msgs.length >= n) return msgs;
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error(`timeout esperando ${n} mensajes`);
}

const casos = [
  { content: 'cuanto sale el kit 120?', label: 'Saludo kit 120' },
  { content: 'y para la keller 110 anda?', label: 'Continuidad sin decir "kit" (compatible)' },
  { content: 'y en la wave s tambien anda?', label: 'Continuidad, moto NO compatible' },
  { content: 'y la corven 110 le va bien?', label: 'Ambiguo recorrido corto/largo' },
];

(async () => {
  await reset();
  let msgId = 100;
  for (let i = 0; i < casos.length; i++) {
    const { content, label } = casos[i];
    console.log(`\n=== [${i + 1}/${casos.length}] ${label} ===`);
    console.log('Cliente:', content);
    await sendLocal(content, msgId++);
    const msgs = await waitForCount(i + 1, 180000);
    const last = msgs[msgs.length - 1];
    console.log('Bot:', last.content);
  }
  console.log('\n=== listo ===');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
