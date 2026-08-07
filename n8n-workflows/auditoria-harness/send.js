// Envía un payload sintético con forma real de Chatwoot al webhook de n8n.
// Uso: WEBHOOK_TOKEN=... node send.js '<json de overrides>'
// overrides soportados: content, message_type ("incoming"|"outgoing"),
// senderType ("contact"|"team"|"bot"), private (bool), event, msgId, convId,
// attachments (array), contentType, phone (o null para omitirlo), senderName

const https = require('https');

const TOKEN = process.env.WEBHOOK_TOKEN;
const HOST = 'n8n.revolucionmotos.tech';
const PATH_BASE = '/webhook/chatwoot-mensaje';

const overrides = JSON.parse(process.argv[2] || '{}');

const now = Date.now();
const msgId = overrides.msgId || (900000 + Math.floor(Math.random() * 90000));
const convId = overrides.convId ?? 1;
const content = overrides.content ?? 'mensaje de prueba';
const messageType = overrides.message_type || 'incoming';
const isPrivate = !!overrides.private;
const senderType = overrides.senderType || 'contact'; // contact | team | bot

const senders = {
  contact: {
    additional_attributes: {}, custom_attributes: {}, email: null, id: 1,
    identifier: null, name: overrides.senderName || 'Revolucion Motos',
    phone_number: overrides.phone === null ? undefined : (overrides.phone || '+5493513784909'),
    thumbnail: '', blocked: false,
  },
  team: {
    id: 1, name: 'Revolucion', email: 'martinalejandrohakanson29@gmail.com', type: 'user',
  },
  bot: {
    id: 2, name: 'Bot', email: 'mhakanson29@gmail.com', type: 'user',
  },
};
const sender = { ...senders[senderType] };
if (senderType === 'contact') sender.account = { id: 1, name: 'Revolucion' };

const messageForConv = {
  id: msgId,
  content,
  account_id: 1,
  inbox_id: 1,
  conversation_id: convId,
  message_type: messageType === 'incoming' ? 0 : 1,
  created_at: Math.floor(now / 1000),
  updated_at: new Date(now).toISOString(),
  private: isPrivate,
  status: 'sent',
  content_type: overrides.contentType || 'text',
  content_attributes: {},
  sender_type: senderType === 'contact' ? 'Contact' : 'User',
  sender_id: sender.id,
  processed_message_content: content,
  sender: senderType === 'contact'
    ? { ...sender, type: 'contact' }
    : { additional_attributes: {}, custom_attributes: {}, email: sender.email, id: sender.id, identifier: null, name: sender.name, thumbnail: '', blocked: false, type: 'agent_bot' },
};
if (overrides.attachments) messageForConv.attachments = overrides.attachments;

const body = {
  account: { id: 1, name: 'Revolucion' },
  additional_attributes: {},
  content_attributes: {},
  content_type: overrides.contentType || 'text',
  content,
  created_at: new Date(now).toISOString(),
  id: msgId,
  inbox: { id: 1, name: 'Revolucion insta' },
  message_type: messageType,
  private: isPrivate,
  sender: senderType === 'contact'
    ? { ...sender }
    : { id: sender.id, name: sender.name, email: sender.email, type: 'user' },
  source_id: 'test-' + msgId,
  event: overrides.event || 'message_created',
  conversation: {
    additional_attributes: {}, can_reply: true, channel: 'Channel::Whatsapp',
    contact_inbox: {
      id: 1, contact_id: 1, inbox_id: 1, source_id: '5493513784909',
      created_at: '2026-03-09T13:01:07.913Z', updated_at: '2026-03-09T13:01:07.913Z',
      hmac_verified: false, pubsub_token: 'o6ju6ccg7EoHSE1GvNtuyatS',
    },
    id: convId, inbox_id: 1,
    messages: [messageForConv],
    labels: overrides.labels || [],
    meta: {
      sender: {
        id: 1, name: overrides.senderName || 'Revolucion Motos',
        phone_number: overrides.phone === null ? undefined : (overrides.phone || '+5493513784909'),
        type: 'contact',
      },
    },
    status: overrides.convStatus || 'open',
    custom_attributes: {}, snoozed_until: null, unread_count: 1,
    first_reply_created_at: null, priority: null, waiting_since: 0,
    agent_last_seen_at: 0, contact_last_seen_at: 0,
    last_activity_at: Math.floor(now / 1000), timestamp: Math.floor(now / 1000),
    created_at: Math.floor(now / 1000), updated_at: new Date(now).toISOString(),
  },
};
if (overrides.attachments) body.attachments = overrides.attachments;

const payload = JSON.stringify(body);
const path = `${PATH_BASE}?token=${encodeURIComponent(TOKEN)}`;

const sentAt = new Date().toISOString();
const req = https.request({
  host: HOST, path, method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
  timeout: 120000,
}, (res) => {
  let data = '';
  res.on('data', (c) => data += c);
  res.on('end', () => {
    console.log(JSON.stringify({ sentAt, msgId, convId, httpStatus: res.statusCode, response: data.slice(0, 500) }));
  });
});
req.on('timeout', () => { console.log(JSON.stringify({ sentAt, msgId, convId, error: 'timeout' })); req.destroy(); });
req.on('error', (e) => console.log(JSON.stringify({ sentAt, msgId, convId, error: e.message })));
req.write(payload);
req.end();
