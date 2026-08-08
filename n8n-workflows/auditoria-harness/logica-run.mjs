// Harness de estrés de LÓGICA/COHERENCIA del agente (distinto del harness de salud
// estructural de auditoria-harness/send.js + wait_exec.js). Usa los endpoints ya
// existentes en la app (/api/chatwoot/prueba-mensaje, /api/chatwoot/prueba-audio-upload)
// en vez del webhook crudo de n8n, así que no requiere WEBHOOK_TOKEN.
//
// La API de ejecuciones de n8n (n8n.revolucionmotos.tech) tarda ~3min en volverse
// consultable para ejecuciones nuevas (probablemente sync diferido entre worker y
// API), así que el chequeo principal de "¿qué contestó?" se hace consultando
// directo conversaciones_historial en Postgres (los efectos reales del workflow —
// guardar en Postgres, mandar el WhatsApp — no tienen ese delay, solo la API de
// introspección de ejecuciones de n8n).
//
// Uso:
//   DB_URL=... node logica-run.mjs texto "<mensaje>" [maxWaitMs]
//   DB_URL=... node logica-run.mjs audio <ruido|silencio|tono> [segundos] [maxWaitMs]
//   DB_URL=... node logica-run.mjs burst "<mensaje1>" "<mensaje2>" [gapMs] [maxWaitMs]
//   N8N_KEY=... node logica-run.mjs detalle "<mensaje o fragmento>" "<sentAtISO>" [maxWaitMs]
//   WEBHOOK_TOKEN=... DB_URL=... node logica-run.mjs equipo "<respuesta del equipo>" [maxWaitMs]
//     (simula una NOTA PRIVADA del equipo en la conversación — así se resuelven las
//     preguntas pendientes registradas por el bot, ver Escalar - Nota Privada /
//     ¿Es respuesta de mi equipo? / ¿Fue Nota Privada? en el workflow)
//
// Imprime un JSON con lo que el agente guardó como turno humano (texto agrupado /
// transcripto) y su respuesta.

import pg from 'pg';
import https from 'https';

const APP_BASE = 'https://revolucionmotos.tech';
const N8N_HOST = 'n8n.revolucionmotos.tech';
const WORKFLOW_ID = 'MAqIthTkpuAo7iKi';
const N8N_KEY = process.env.N8N_KEY;
const DB_URL = process.env.DB_URL;
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN;
const CONV_ID = 1;
const TELEFONO = '+5493513784909';
const SESSION_KEY = TELEFONO;

// Réplica de auditoria-harness/send.js pero como función, para el modo "equipo"
// (nota privada del equipo respondiendo una pregunta pendiente).
function enviarWebhookCrudo(overrides) {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    const msgId = overrides.msgId || (900000 + Math.floor(Math.random() * 90000));
    const convId = overrides.convId ?? CONV_ID;
    const content = overrides.content ?? '';
    const isPrivate = !!overrides.private;
    const senderType = overrides.senderType || 'team';
    const senders = {
      team: { id: 1, name: 'Revolucion', email: 'martinalejandrohakanson29@gmail.com', type: 'user' },
    };
    const sender = { ...senders[senderType] };
    const messageForConv = {
      id: msgId, content, account_id: 1, inbox_id: 1, conversation_id: convId,
      message_type: 1, created_at: Math.floor(now / 1000), updated_at: new Date(now).toISOString(),
      private: isPrivate, status: 'sent', content_type: 'text', content_attributes: {},
      sender_type: 'User', sender_id: sender.id, processed_message_content: content,
      sender: { additional_attributes: {}, custom_attributes: {}, email: sender.email, id: sender.id, identifier: null, name: sender.name, thumbnail: '', blocked: false, type: 'agent_bot' },
    };
    const body = {
      account: { id: 1, name: 'Revolucion' }, additional_attributes: {}, content_attributes: {},
      content_type: 'text', content, created_at: new Date(now).toISOString(), id: msgId,
      inbox: { id: 1, name: 'Revolucion insta' }, message_type: 'outgoing', private: isPrivate,
      sender: { id: sender.id, name: sender.name, email: sender.email, type: 'user' },
      source_id: 'test-' + msgId, event: 'message_created',
      conversation: {
        additional_attributes: {}, can_reply: true, channel: 'Channel::Whatsapp',
        contact_inbox: { id: 1, contact_id: 1, inbox_id: 1, source_id: '5493513784909', created_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString(), hmac_verified: false, pubsub_token: 'x' },
        id: convId, inbox_id: 1, messages: [messageForConv], labels: [],
        meta: { sender: { id: 1, name: 'Cliente Prueba', phone_number: TELEFONO, type: 'contact' } },
        status: 'open', custom_attributes: {}, snoozed_until: null, unread_count: 1,
        first_reply_created_at: null, priority: null, waiting_since: 0, agent_last_seen_at: 0, contact_last_seen_at: 0,
        last_activity_at: Math.floor(now / 1000), timestamp: Math.floor(now / 1000),
        created_at: Math.floor(now / 1000), updated_at: new Date(now).toISOString(),
      },
    };
    const payload = JSON.stringify(body);
    const path = `/webhook/chatwoot-mensaje?token=${encodeURIComponent(WEBHOOK_TOKEN)}`;
    const req = https.request({
      host: N8N_HOST, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 120000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve({ httpStatus: res.statusCode, response: data.slice(0, 500) }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function enviarNotaEquipo(content) {
  const sentAt = await horaServidorDB();
  const res = await enviarWebhookCrudo({ content, senderType: 'team', private: true });
  return { sentAt, ...res };
}

async function horaServidorDB() {
  if (!DB_URL) return new Date().toISOString();
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    const { rows } = await client.query('SELECT now()');
    return rows[0].now.toISOString();
  } finally {
    await client.end();
  }
}

async function enviarTexto(mensaje) {
  const sentAt = await horaServidorDB();
  const res = await fetch(`${APP_BASE}/api/chatwoot/prueba-mensaje`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId: CONV_ID, telefono: TELEFONO, nombre: 'Cliente Prueba', mensaje }),
  });
  const body = await res.json().catch(() => ({}));
  return { sentAt, httpStatus: res.status, body };
}

async function enviarAudio(audioUrl) {
  const sentAt = await horaServidorDB();
  const res = await fetch(`${APP_BASE}/api/chatwoot/prueba-mensaje`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId: CONV_ID, telefono: TELEFONO, nombre: 'Cliente Prueba', audioUrl }),
  });
  const body = await res.json().catch(() => ({}));
  return { sentAt, httpStatus: res.status, body };
}

async function subirAudio(buffer, contentType, filename) {
  const form = new FormData();
  form.append('audio', new Blob([buffer], { type: contentType }), filename);
  const res = await fetch(`${APP_BASE}/api/chatwoot/prueba-audio-upload`, { method: 'POST', body: form });
  const j = await res.json();
  if (!j.success) throw new Error('upload audio fallo: ' + JSON.stringify(j));
  return j.audioUrl;
}

function wavSintetico({ segundos = 3, sampleRate = 16000, tipo = 'ruido' }) {
  const nSamples = Math.floor(segundos * sampleRate);
  const dataSize = nSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataSize, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < nSamples; i++) {
    let sample = 0;
    if (tipo === 'ruido') sample = Math.floor((Math.random() * 2 - 1) * 32767 * 0.6);
    else if (tipo === 'silencio') sample = 0;
    else if (tipo === 'tono') sample = Math.floor(Math.sin(2 * Math.PI * 440 * i / sampleRate) * 32767 * 0.5);
    buf.writeInt16LE(sample, 44 + i * 2);
  }
  return buf;
}

async function esperarRespuestaDB({ sentAt, maxWaitMs = 90000, minFilas = 1 }) {
  if (!DB_URL) throw new Error('Falta DB_URL en el entorno');
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      const { rows } = await client.query(
        `SELECT role, content, created_at FROM conversaciones_historial
         WHERE session_key = $1 AND created_at > $2
         ORDER BY created_at ASC`,
        [SESSION_KEY, sentAt]
      );
      const humanRow = rows.find(r => r.role === 'human');
      const aiRows = rows.filter(r => r.role === 'ai');
      if (humanRow && aiRows.length >= minFilas) {
        return { textoAgrupado: humanRow.content, respuestas: aiRows.map(r => r.content), filas: rows };
      }
      await new Promise(r => setTimeout(r, 3000));
    }
    const { rows } = await client.query(
      `SELECT role, content, created_at FROM conversaciones_historial
       WHERE session_key = $1 AND created_at > $2
       ORDER BY created_at ASC`,
      [SESSION_KEY, sentAt]
    );
    return { timeout: true, filasParciales: rows };
  } finally {
    await client.end();
  }
}

// --- Modo "detalle": inspección profunda vía API de ejecuciones de n8n (lenta, ~3min de delay) ---

async function apiGet(path) {
  const res = await fetch(`https://${N8N_HOST}${path}`, { headers: { 'X-N8N-API-KEY': N8N_KEY } });
  return res.json();
}
function getOut(rd, nodeName, idx = 0) {
  const r = rd[nodeName];
  if (!r || !r[idx]) return null;
  const d = r[idx].data;
  if (!d || !d.main || !d.main[0] || !d.main[0][0]) return null;
  return d.main[0][0].json;
}
function resumenEjecucion(found, rd) {
  const rows = [];
  for (const [name, runs] of Object.entries(rd)) for (const r of runs) rows.push({ name, startTime: r.startTime, executionTime: r.executionTime, error: r.error ? (r.error.message || JSON.stringify(r.error)).slice(0, 300) : null });
  rows.sort((a, b) => a.startTime - b.startTime);
  const summary = {
    executionId: found.id, status: found.status,
    totalDurationSec: ((new Date(found.stoppedAt) - new Date(found.startedAt)) / 1000).toFixed(1),
    nodePath: rows.map(r => r.name),
    errors: rows.filter(r => r.error).map(r => ({ name: r.name, error: r.error })),
  };
  const clasif = getOut(rd, 'Clasificador Intento'); if (clasif) summary.clasificacion = clasif.output || clasif;
  const df = getOut(rd, 'datos_finales2'); if (df) summary.textoAgrupado = df.texto;
  const mencionKit = getOut(rd, 'Detectar Mencion Kit'); if (mencionKit) summary.mencionKit = mencionKit.output || mencionKit;
  const transcripcion = getOut(rd, 'Transcribe a recording1'); if (transcripcion) summary.transcripcion = transcripcion.text || transcripcion;
  return summary;
}
async function esperarEjecucionAPI({ mensaje, audioUrl, sentAt, maxWaitMs = 360000 }) {
  const deadline = Date.now() + maxWaitMs;
  const sentAtMs = new Date(sentAt).getTime();
  const vistos = new Map();
  while (Date.now() < deadline) {
    const list = await apiGet(`/api/v1/executions?workflowId=${WORKFLOW_ID}&limit=30`);
    for (const e of (list.data || [])) {
      if (vistos.has(e.id)) continue;
      if (new Date(e.startedAt).getTime() < sentAtMs - 120000) continue;
      if (e.status === 'running' || e.status === 'waiting') continue;
      const full = await apiGet(`/api/v1/executions/${e.id}?includeData=true`);
      const rd = full.data?.resultData?.runData;
      if (!rd) continue;
      const wh = getOut(rd, 'Webhook1');
      const contenidoRecibido = wh?.body?.conversation?.messages?.[0]?.content ?? wh?.body?.content ?? null;
      const attRecibido = wh?.body?.conversation?.messages?.[0]?.attachments?.[0]?.data_url ?? wh?.body?.attachments?.[0]?.data_url ?? null;
      vistos.set(e.id, { full, rd, contenidoRecibido, attRecibido });
    }
    for (const { full, rd, contenidoRecibido, attRecibido } of vistos.values()) {
      if (mensaje !== undefined && contenidoRecibido && contenidoRecibido.includes(mensaje)) return resumenEjecucion(full, rd);
      if (audioUrl !== undefined && attRecibido === audioUrl) return resumenEjecucion(full, rd);
    }
    await new Promise(r => setTimeout(r, 8000));
  }
  return { error: 'timeout esperando ejecucion (API)', candidatosVistos: [...vistos.values()].map(c => ({ contenidoRecibido: c.contenidoRecibido })) };
}

(async () => {
  const [modo, ...rest] = process.argv.slice(2);
  if (modo === 'texto') {
    const [mensaje, maxWaitMs] = rest;
    const env = await enviarTexto(mensaje);
    if (env.httpStatus !== 200) { console.log(JSON.stringify({ error: 'envio fallo', env })); return; }
    const res = await esperarRespuestaDB({ sentAt: env.sentAt, maxWaitMs: Number(maxWaitMs || 90000) });
    console.log(JSON.stringify({ enviado: mensaje, sentAt: env.sentAt, ...res }, null, 2));
  } else if (modo === 'audio') {
    const [tipo, segundos, maxWaitMs] = rest;
    const buf = wavSintetico({ tipo, segundos: Number(segundos || 3) });
    const audioUrl = await subirAudio(buf, 'audio/wav', `${tipo}.wav`);
    const env = await enviarAudio(audioUrl);
    if (env.httpStatus !== 200) { console.log(JSON.stringify({ error: 'envio fallo', env })); return; }
    const res = await esperarRespuestaDB({ sentAt: env.sentAt, maxWaitMs: Number(maxWaitMs || 120000) });
    console.log(JSON.stringify({ audioUrl, tipo, sentAt: env.sentAt, ...res }, null, 2));
  } else if (modo === 'burst') {
    const [msg1, msg2, gapMs, maxWaitMs] = rest;
    const env1 = await enviarTexto(msg1);
    await new Promise(r => setTimeout(r, Number(gapMs || 3000)));
    const env2 = await enviarTexto(msg2);
    if (env2.httpStatus !== 200) { console.log(JSON.stringify({ error: 'envio 2 fallo', env2 })); return; }
    const res = await esperarRespuestaDB({ sentAt: env1.sentAt, maxWaitMs: Number(maxWaitMs || 90000) });
    console.log(JSON.stringify({ msg1, msg2, sentAt: env1.sentAt, ...res }, null, 2));
  } else if (modo === 'detalle') {
    const [mensaje, sentAt, maxWaitMs] = rest;
    const res = await esperarEjecucionAPI({ mensaje, sentAt, maxWaitMs: Number(maxWaitMs || 360000) });
    console.log(JSON.stringify(res, null, 2));
  } else if (modo === 'equipo') {
    if (!WEBHOOK_TOKEN) { console.error(JSON.stringify({ error: 'Falta WEBHOOK_TOKEN' })); process.exit(1); }
    const [respuesta, maxWaitMs] = rest;
    const env = await enviarNotaEquipo(respuesta);
    if (env.httpStatus !== 200) { console.log(JSON.stringify({ error: 'envio fallo', env })); return; }
    const res = await esperarRespuestaDB({ sentAt: env.sentAt, maxWaitMs: Number(maxWaitMs || 90000) });
    console.log(JSON.stringify({ notaEquipo: respuesta, sentAt: env.sentAt, ...res }, null, 2));
  } else {
    console.error('Modo desconocido. Usar: texto | audio | burst | detalle');
    process.exit(1);
  }
})();
