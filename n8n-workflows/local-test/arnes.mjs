// Helpers compartidos para correr la bateria de 109 escenarios contra el
// stack 100% local (n8n local + DeepSeek real + Postgres/Redis locales +
// mock-chatwoot + app Next.js local). Nada de esto toca produccion.
import http from 'http';
import pg from 'pg';

export const N8N_HOST = 'localhost';
export const N8N_PORT = 5678;
export const N8N_KEY = (await import('fs')).readFileSync('C:/Users/User/local-infra/n8n-api-key.txt', 'utf8').trim();
export const WORKFLOW_ID = 'Rmnxs8kSbrXgiR4E';
export const MOCK = 'http://localhost:4000';
export const APP = 'http://localhost:3100';
export const WEBHOOK_TOKEN = 'localtest123';
export const DB_URL = 'postgresql://postgres:@localhost:5432/revolucion_motos_test?sslmode=disable';

const pool = new pg.Pool({ connectionString: DB_URL });
export async function db(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows;
}

function httpJson(opts, body) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const req = http.request(opts, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: d ? JSON.parse(d) : null }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Manda un mensaje sintetico al webhook de n8n local, forma Chatwoot real. */
export function enviarMensaje(overrides = {}) {
  const now = Date.now();
  const msgId = overrides.msgId || (900000 + Math.floor(Math.random() * 90000));
  const convId = overrides.convId ?? 1;
  const content = overrides.content ?? '';
  const senderType = overrides.senderType || 'contact';
  // En Chatwoot real, un mensaje de equipo/bot SIEMPRE es "outgoing" (va
  // hacia el contacto); solo un mensaje de un contacto es "incoming".
  const messageType = overrides.message_type || (senderType === 'contact' ? 'incoming' : 'outgoing');
  const isPrivate = !!overrides.private;

  const senders = {
    contact: {
      additional_attributes: {}, custom_attributes: {}, email: null, id: overrides.contactId ?? 1,
      identifier: null, name: overrides.senderName || 'Cliente Local',
      phone_number: overrides.phone === null ? undefined : (overrides.phone || '+5493510000000'),
      thumbnail: '', blocked: false,
    },
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
    sender: senderType === 'contact'
      ? { ...sender, type: 'contact' }
      : { additional_attributes: {}, custom_attributes: {}, email: sender.email, id: sender.id, identifier: null, name: sender.name, thumbnail: '', blocked: false, type: 'agent_bot' },
  };
  if (overrides.attachments) messageForConv.attachments = overrides.attachments;

  const body = {
    account: { id: 1, name: 'Revolucion' }, additional_attributes: {}, content_attributes: {},
    content_type: overrides.contentType || 'text', content, created_at: new Date(now).toISOString(),
    id: msgId, inbox: { id: 1, name: 'Revolucion local' }, message_type: messageType, private: isPrivate,
    sender: senderType === 'contact' ? { ...sender } : { id: sender.id, name: sender.name, email: sender.email, type: 'user' },
    source_id: 'local-' + msgId, event: overrides.event || 'message_created',
    conversation: {
      additional_attributes: {}, can_reply: true, channel: 'Channel::Whatsapp',
      contact_inbox: {
        id: 1, contact_id: overrides.contactId ?? 1, inbox_id: 1, source_id: (overrides.phone || '5493510000000').replace('+', ''),
        created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
        hmac_verified: false, pubsub_token: 'local-test-token',
      },
      id: convId, inbox_id: 1, messages: [messageForConv], labels: overrides.labels || [],
      meta: { sender: { id: overrides.contactId ?? 1, name: overrides.senderName || 'Cliente Local', phone_number: overrides.phone === null ? undefined : (overrides.phone || '+5493510000000'), type: 'contact' } },
      status: overrides.convStatus || 'open', custom_attributes: {}, snoozed_until: null, unread_count: 1,
      first_reply_created_at: null, priority: null, waiting_since: 0, agent_last_seen_at: 0, contact_last_seen_at: 0,
      last_activity_at: Math.floor(now / 1000), timestamp: Math.floor(now / 1000),
      created_at: Math.floor(now / 1000), updated_at: new Date(now).toISOString(),
    },
  };
  if (overrides.attachments) body.attachments = overrides.attachments;

  const payload = JSON.stringify(body);
  const path = `/webhook/chatwoot-mensaje?token=${encodeURIComponent(WEBHOOK_TOKEN)}`;
  const sentAt = new Date().toISOString();
  return new Promise((resolve) => {
    const req = http.request({ host: N8N_HOST, port: N8N_PORT, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: 120000 }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ sentAt, msgId, convId, httpStatus: res.statusCode, response: d.slice(0, 300) }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ sentAt, msgId, convId, error: 'timeout' }); });
    req.on('error', (e) => resolve({ sentAt, msgId, convId, error: e.message }));
    req.write(payload); req.end();
  });
}

async function n8nApi(path) {
  const { body } = await httpJson({ host: N8N_HOST, port: N8N_PORT, path, method: 'GET', headers: { 'X-N8N-API-KEY': N8N_KEY } });
  return body;
}

/**
 * Espera a que aparezca(n) ejecucion(es) nueva(s) (id > lastId) y a que la
 * MAS ALTA de todas termine. Con varios mensajes en rafaga, cada webhook
 * dispara su propia ejecucion (varias terminan rapido en "mensaje agrupado")
 * -- por eso no alcanza con quedarse con la primera que aparece: hay que
 * dejar un margen de "settle" para que aparezcan todas antes de fijar el
 * objetivo, y recien ahi esperar a que ESA termine.
 */
export async function esperarEjecucion(lastId, maxWaitMs = 90000, settleMs = 4000) {
  const deadline = Date.now() + maxWaitMs;
  let targetId = null;
  let vistoEn = null;
  while (Date.now() < deadline) {
    const list = await n8nApi(`/api/v1/executions?workflowId=${WORKFLOW_ID}&limit=10`);
    const nuevas = (list?.data || []).filter((e) => Number(e.id) > lastId);
    if (nuevas.length) {
      const maxAhora = Math.max(...nuevas.map((e) => Number(e.id)));
      if (maxAhora !== targetId) { targetId = maxAhora; vistoEn = Date.now(); }
      else if (Date.now() - vistoEn >= settleMs) break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!targetId) return { timeout: true };
  while (Date.now() < deadline) {
    const list = await n8nApi(`/api/v1/executions?workflowId=${WORKFLOW_ID}&limit=5`);
    const exec = (list?.data || []).find((e) => Number(e.id) === targetId);
    if (exec && exec.status !== 'running' && exec.status !== 'waiting' && exec.status !== 'new') return exec;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { timeout: true, id: targetId };
}

export async function ultimoIdEjecucion() {
  const list = await n8nApi(`/api/v1/executions?workflowId=${WORKFLOW_ID}&limit=1`);
  const d = list?.data || [];
  return d.length ? Number(d[0].id) : 0;
}

/** Detalle nodo-por-nodo de una ejecucion (rama tomada, errores, outputs clave). */
export async function detalleEjecucion(execId) {
  const full = await n8nApi(`/api/v1/executions/${execId}?includeData=true`);
  const rd = full?.data?.resultData?.runData;
  if (!rd) return { nodePath: [], errors: [] };
  const rows = [];
  for (const [name, runs] of Object.entries(rd)) for (const r of runs) rows.push({ name, startTime: r.startTime, error: r.error ? (r.error.message || JSON.stringify(r.error)).slice(0, 300) : null });
  rows.sort((a, b) => a.startTime - b.startTime);
  return { nodePath: rows.map((r) => r.name), errors: rows.filter((r) => r.error) };
}

export async function mensajesMock(convId = 1) {
  const { body } = await httpJson({ host: 'localhost', port: 4000, path: `/_ui/conversations/${convId}/messages`, method: 'GET' });
  return body?.messages || [];
}

export async function resetMock() {
  await httpJson({ host: 'localhost', port: 4000, path: '/_reset', method: 'POST' });
}

/** Limpia el estado de una conversacion de prueba entre escenarios (DB + mock), sin tocar produccion. */
export async function limpiarConversacion(convId = 1, phone = '+5493510000000') {
  const sessionKey = phone;
  await db(`DELETE FROM conversaciones_historial WHERE session_key = $1`, [sessionKey]);
  await db(`DELETE FROM preguntas_tecnicas_pendientes WHERE conversation_id = $1`, [convId]);
  await db(`DELETE FROM preguntas_negocio_pendientes WHERE conversation_id = $1`, [convId]);
  await db(`DELETE FROM preguntas_precio_pendientes WHERE conversation_id = $1`, [convId]);
  await db(`DELETE FROM respuestas_pendientes WHERE conversation_id = $1`, [convId]);
  await db(`DELETE FROM bot_conversacion_lock WHERE telefono = $1`, [phone]);
}

export async function flushRedis() {
  const net = await import('net');
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(6379, 'localhost', () => { sock.write('*1\r\n$8\r\nFLUSHALL\r\n'); });
    sock.on('data', () => { sock.end(); resolve(true); });
    sock.on('error', reject);
  });
}

export function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }
