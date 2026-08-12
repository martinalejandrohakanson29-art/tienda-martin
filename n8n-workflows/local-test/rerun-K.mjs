// Re-corre SOLO la categoria K (aprendizaje del equipo / pausado) con el
// message_type correcto para mensajes del equipo (outgoing), que el primer
// corrido de auditar-escenarios.mjs mandaba mal (incoming, por eso esos
// resultados no valen).
import http from 'http';
import pg from 'pg';
const { Client } = pg;

const N8N_HOST = 'localhost', N8N_PORT = 5678, WEBHOOK_TOKEN = 'localtest123';
const MOCK = 'http://localhost:4000';
const DB = { host: '127.0.0.1', port: 5432, user: 'postgres', password: 'LocalTest2026!', database: 'revolucion_motos_test' };

function sendRaw(overrides) {
  const now = Date.now();
  const msgId = overrides.msgId || (900000 + Math.floor(Math.random() * 90000));
  const convId = overrides.convId ?? 1;
  const content = overrides.content ?? '';
  const senderType = overrides.senderType || 'contact';
  const messageType = overrides.message_type || (senderType === 'contact' ? 'incoming' : 'outgoing');
  const isPrivate = !!overrides.private;
  const senders = {
    contact: { additional_attributes: {}, custom_attributes: {}, email: null, id: 1, identifier: null, name: overrides.senderName || 'Cliente Local', phone_number: overrides.phone === null ? undefined : (overrides.phone || '+5493510000000'), thumbnail: '', blocked: false },
    team: { id: 1, name: 'Revolucion', email: 'equipo@local.test', type: 'user' },
    bot: { id: 2, name: 'Bot', email: 'bot@local.test', type: 'user' },
  };
  const sender = { ...senders[senderType] };
  if (senderType === 'contact') sender.account = { id: 1, name: 'Revolucion' };
  const messageForConv = {
    id: msgId, content, account_id: 1, inbox_id: 1, conversation_id: convId,
    message_type: messageType === 'incoming' ? 0 : 1,
    created_at: Math.floor(now / 1000), updated_at: new Date(now).toISOString(),
    private: isPrivate, status: 'sent', content_type: overrides.contentType || 'text',
    content_attributes: {}, sender_type: senderType === 'contact' ? 'Contact' : 'User',
    sender_id: sender.id, processed_message_content: content,
    sender: senderType === 'contact' ? { ...sender, type: 'contact' } : { additional_attributes: {}, custom_attributes: {}, email: sender.email, id: sender.id, identifier: null, name: sender.name, thumbnail: '', blocked: false, type: 'agent_bot' },
  };
  const body = {
    account: { id: 1, name: 'Revolucion' }, additional_attributes: {}, content_attributes: {},
    content_type: overrides.contentType || 'text', content, created_at: new Date(now).toISOString(),
    id: msgId, inbox: { id: 1, name: 'Revolucion local' }, message_type: messageType, private: isPrivate,
    sender: senderType === 'contact' ? { ...sender } : { id: sender.id, name: sender.name, email: sender.email, type: 'user' },
    source_id: 'local-' + msgId, event: overrides.event || 'message_created',
    conversation: {
      additional_attributes: {}, can_reply: true, channel: 'Channel::Whatsapp',
      contact_inbox: { id: 1, contact_id: 1, inbox_id: 1, source_id: '5493510000000', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', hmac_verified: false, pubsub_token: 'local-test-token' },
      id: convId, inbox_id: 1, messages: [messageForConv], labels: overrides.labels || [],
      meta: { sender: { id: 1, name: overrides.senderName || 'Cliente Local', phone_number: overrides.phone === null ? undefined : (overrides.phone || '+5493510000000'), type: 'contact' } },
      status: overrides.convStatus || 'open', custom_attributes: {}, snoozed_until: null, unread_count: 1,
      first_reply_created_at: null, priority: null, waiting_since: 0, agent_last_seen_at: 0, contact_last_seen_at: 0,
      last_activity_at: Math.floor(now / 1000), timestamp: Math.floor(now / 1000),
      created_at: Math.floor(now / 1000), updated_at: new Date(now).toISOString(),
    },
  };
  const token = overrides.token === undefined ? WEBHOOK_TOKEN : overrides.token;
  const payload = JSON.stringify(body);
  const path = `/webhook/chatwoot-mensaje${token !== null ? `?token=${encodeURIComponent(token)}` : ''}`;
  return new Promise((resolve) => {
    const req = http.request({ host: N8N_HOST, port: N8N_PORT, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: 15000 }, (res) => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => resolve({ httpStatus: res.statusCode, body: data.slice(0, 500) }));
    });
    req.on('timeout', () => { resolve({ httpStatus: null, body: 'timeout' }); req.destroy(); });
    req.on('error', (e) => resolve({ httpStatus: null, body: 'error: ' + e.message }));
    req.write(payload); req.end();
  });
}
function mockGet(path) { return new Promise((resolve, reject) => { http.get(MOCK + path, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } }); }).on('error', reject); }); }
async function waitForMessages(convId, sinceId, minCount, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await mockGet(`/_ui/conversations/${convId}/messages?since=${sinceId}`);
    if (r.messages.length >= minCount) return r.messages;
    await new Promise(res => setTimeout(res, 3000));
  }
  return (await mockGet(`/_ui/conversations/${convId}/messages?since=${sinceId}`)).messages;
}
async function waitForNoMessage(convId, sinceId, waitMs) { await new Promise(res => setTimeout(res, waitMs)); return (await mockGet(`/_ui/conversations/${convId}/messages?since=${sinceId}`)).messages; }

let db;
async function q(sql, params) { return (await db.query(sql, params)).rows; }
async function clearLocks() { await q('DELETE FROM bot_conversacion_lock'); }

const results = [];
function record(obj) { results.push(obj); console.log('\n=== ' + obj.id + ' — ' + obj.titulo + ' ===\n' + JSON.stringify(obj, null, 2)); }

async function runScenario({ id, titulo, convId, phone, msgId, content, overrides = {}, waitCount = 1, timeoutMs = 150000, expectNoReply = false, dbAfter = null }) {
  await clearLocks();
  const existing = await mockGet(`/_ui/conversations/${convId}/messages?since=0`);
  const sinceId = existing.messages.length ? Math.max(...existing.messages.map(m => m.id)) : 0;
  const sendRes = await sendRaw({ convId, phone, msgId, content, ...overrides });
  let messages = expectNoReply ? await waitForNoMessage(convId, sinceId, Math.min(timeoutMs, 40000)) : await waitForMessages(convId, sinceId, waitCount, timeoutMs);
  const after = dbAfter ? await dbAfter() : null;
  record({ id, titulo, convId, phone, content, sendRes, respuestas: messages.map(m => ({ id: m.id, content: m.content, private: m.private })), dbAfter: after });
}

async function main() {
  db = new Client(DB);
  await db.connect();
  // limpiar residuo de la corrida anterior en estas 2 conversaciones (950, 951)
  await q("DELETE FROM conversaciones_historial WHERE session_key IN ('+5493520000950','+5493520000951')");
  await q("DELETE FROM preguntas_tecnicas_pendientes WHERE conversation_id IN ('950','951')");
  await q("DELETE FROM compatibilidades WHERE fuente LIKE '%950%' OR detalle LIKE '%zanella%'");
  await mockPostReset(950); await mockPostReset(951);

  await runScenario({ id: 'K64-paso1b', titulo: 'Cliente pregunta tecnica sin dato (crea pendiente)', convId: 950, phone: '+5493520000950', msgId: 21050,
    content: 'la zanella z110 recorrido largo anda con el kit 120?', waitCount: 1, timeoutMs: 150000,
    dbAfter: async () => ({ tecnicas: await q("SELECT * FROM preguntas_tecnicas_pendientes WHERE conversation_id='950'") }) });

  await runScenario({ id: 'K64-paso2b', titulo: 'Equipo responde la pendiente en PUBLICO (message_type outgoing correcto)', convId: 950, phone: '+5493520000950', msgId: 21051,
    content: 'si, la zanella z110 recorrido largo anda perfecto con el kit 120', overrides: { senderType: 'team' }, waitCount: 1, timeoutMs: 150000,
    dbAfter: async () => ({ tecnicas: await q("SELECT * FROM preguntas_tecnicas_pendientes WHERE conversation_id='950'"), compat: await q('SELECT * FROM compatibilidades') }) });

  await runScenario({ id: 'K64-paso3b', titulo: 'Cliente escribe despues -> el bot NO debe estar pausado', convId: 950, phone: '+5493520000950', msgId: 21052,
    content: 'joya, gracias!', waitCount: 1, timeoutMs: 150000 });

  await runScenario({ id: 'K68b', titulo: 'Equipo responde algo que no corresponde a ninguna pendiente (outgoing correcto)', convId: 951, phone: '+5493520000951', msgId: 21060,
    content: 'dale, cualquier cosa me avisas', overrides: { senderType: 'team' }, expectNoReply: true, timeoutMs: 40000 });

  await runScenario({ id: 'K68b-verif', titulo: 'Cliente escribe justo despues -> deberia quedar en silencio (pausado)', convId: 951, phone: '+5493520000951', msgId: 21061,
    content: 'hola, cuanto sale el kit 120?', expectNoReply: true, timeoutMs: 40000 });

  await db.end();
  console.log('\n\n===== RESUMEN JSON K (corregido) =====');
  console.log(JSON.stringify(results, null, 2));
}

function mockPostReset() { return Promise.resolve(); } // el mock no tiene reset por conv individual; no hace falta, usamos msgId/convId nuevos igual

main().catch(e => { console.error('ERROR FATAL:', e); process.exit(1); });
