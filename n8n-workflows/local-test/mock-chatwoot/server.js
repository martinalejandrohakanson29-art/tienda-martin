// Mock de Chatwoot + del endpoint /api/chatwoot/enviar de la app, para poder
// correr workflow_mateo completo contra un n8n local sin pegarle a nada real.
// No reimplementa Chatwoot de verdad: solo lo suficiente para que el workflow
// no se rompa al mandar mensajes/notas/labels, y para poder inspeccionar
// despues que efectivamente contesto.
const express = require('express');
const path = require('path');

const PORT = process.env.MOCK_CHATWOOT_PORT || 4000;
const app = express();
app.use(express.json());
// Sirve los .wav sinteticos usados para probar la rama de audio (nota de voz).
app.use('/audio-fixtures', express.static(path.join(__dirname, '..', 'audio-fixtures')));

// conversationId -> { messages: [...], labels: [...] }
const conversaciones = new Map();
let nextMessageId = 90001;

function getConv(id) {
  const key = String(id);
  if (!conversaciones.has(key)) conversaciones.set(key, { messages: [], labels: [] });
  return conversaciones.get(key);
}

function log(label, data) {
  console.log(`[mock-chatwoot] ${label}`, JSON.stringify(data));
}

// --- Endpoint que reemplaza a la app Next.js real (POST /api/chatwoot/enviar) ---
app.post('/api/chatwoot/enviar', (req, res) => {
  const { conversation_id, account_id, content, origen, contacto } = req.body || {};
  if (!conversation_id || !content) {
    return res.status(400).json({ error: 'Falta conversation_id o content' });
  }
  const conv = getConv(conversation_id);
  const msg = {
    id: nextMessageId++,
    content,
    message_type: 'outgoing',
    private: false,
    origen: origen || 'respuesta',
    contacto: contacto || null,
    created_at: Math.floor(Date.now() / 1000),
  };
  conv.messages.push(msg);
  log('enviar (cliente)', { conversation_id, account_id, content });
  res.json({ enviado: true, encolado: false, chatwoot: { id: msg.id } });
});

// --- Endpoints que reemplazan a la API real de Chatwoot ---
app.get('/api/v1/accounts/:accountId/conversations/:convId/labels', (req, res) => {
  const conv = getConv(req.params.convId);
  res.json({ payload: conv.labels });
});

app.post('/api/v1/accounts/:accountId/conversations/:convId/labels', (req, res) => {
  const conv = getConv(req.params.convId);
  const labels = (req.body && req.body.labels) || [];
  conv.labels = labels;
  log('labels', { convId: req.params.convId, labels });
  res.json({ payload: labels });
});

app.get('/api/v1/accounts/:accountId/conversations/:convId/messages', (req, res) => {
  const conv = getConv(req.params.convId);
  res.json({ payload: conv.messages });
});

app.post('/api/v1/accounts/:accountId/conversations/:convId/messages', (req, res) => {
  const conv = getConv(req.params.convId);
  const { content, message_type, private: isPrivate } = req.body || {};
  const msg = {
    id: nextMessageId++,
    content,
    message_type: message_type || 'outgoing',
    private: !!isPrivate,
    sender: { id: 1, type: 'user', name: isPrivate ? 'Equipo (mock)' : 'Bot' },
    created_at: Math.floor(Date.now() / 1000),
  };
  conv.messages.push(msg);
  log(isPrivate ? 'nota privada (escalado)' : 'mensaje', { convId: req.params.convId, content: (content || '').slice(0, 200) });
  res.json(msg);
});

// --- Inspeccion / control para pruebas ---
app.get('/_ui/status', (req, res) => {
  const out = {};
  for (const [id, c] of conversaciones) out[id] = { mensajes: c.messages.length, labels: c.labels };
  res.json({ ok: true, conversaciones: out });
});

app.get('/_ui/conversations/:convId/messages', (req, res) => {
  const conv = getConv(req.params.convId);
  const since = Number(req.query.since || 0);
  res.json({ messages: conv.messages.filter(m => m.id > since) });
});

app.post('/_reset', (req, res) => {
  conversaciones.clear();
  nextMessageId = 90001;
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Mock Chatwoot + app/api/chatwoot/enviar escuchando en http://localhost:${PORT}`);
});
