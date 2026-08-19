// Feat "Transcribir audios de WhatsApp" (2026-08-19), pedido explicito de Martin: reusar la
// transcripcion de audio que existia en workflow_mateo (el bot viejo) pero nunca se porto al
// nuevo "Respuestas chatwoot 2.0". Hoy, cualquier mensaje sin texto (`Tiene Texto` = false) muere
// en silencio en "Fin - Sin Texto (audio/imagen, todavia no manejado)" -- un audio de un cliente
// se pierde sin dejar rastro, ni respuesta ni escalado.
//
// Pipeline portado tal cual de workflow_mateo (mismos 3 pasos, mismo credential "OpenAi account"
// / whisper-1 -- a pedido explicito de Martin, sin cambiar a Groq):
//   1. Descargar Audio (http request, GET data_url via token de Chatwoot, response format "file")
//   2. Normalizar Audio (code, IDENTICO al original) -- Whisper decide el formato por el nombre de
//      archivo del multipart, no por el contenido; las notas de voz de WhatsApp llegan sin
//      extension util, asi que hay que deducirla (magic bytes primero) y reescribirla o Whisper
//      responde "Invalid file format" con un audio perfectamente valido.
//   3. Transcribir Audio (http request a api.openai.com/v1/audio/transcriptions, whisper-1,
//      language es) -- se uso HTTP Request en vez del nodo nativo de OpenAI porque ese nodo manda
//      whisper-1 hardcodeado (nota que dejo el workflow viejo), aunque aca no hace falta elegir
//      otro modelo, se mantiene el HTTP Request por consistencia con el original.
//
// Donde se engancha: `Tiene Texto` (false) pasaba directo a "Fin - Sin Texto...". Ahora primero
// pasa por `¿Es Audio?` (mira si el mensaje trae attachment con file_type "audio", mismo campo que
// usaba el Switch "Tipo de Mensaje" del workflow viejo) -- si no es audio (imagen/sticker suelto),
// sigue muriendo en el mismo "Fin - Sin Texto" de siempre, sin cambios. Si es audio, corre el
// pipeline de arriba y el resultado se mezcla en el MISMO nodo "Buffer Mensaje" que ya usa el
// camino de texto (reusando el patron de merge de dos origenes ya usado en el workflow, ej.
// "Parsear Kit Pineado"): `Buffer Mensaje` ahora intenta leer `$('Transcribir Audio').item.json.text`
// primero (funciona SOLO si ese nodo corrio en esta ejecucion) y si no corrio, cae al
// `body.content` de siempre -- cero cambio de comportamiento para el 100% del trafico de texto.
// De ahi en mas, el texto transcripto es indistinguible de un mensaje tipeado: pasa por el mismo
// buffer de rafaga, clasificacion de kit, compatibilidad, sub-preguntas, todo igual -- "funciona
// para todas las ramas" sin duplicar logica en ningun lado.
//
// Manejo de fallas (decidido con Martin: escalar en silencio, no perder el mensaje): los 3 pasos
// del pipeline de audio (Descargar Audio, Normalizar Audio, Transcribir Audio) tienen
// onError: "continueErrorOutput" (mismo mecanismo que ya usan "Enviar Nota Escalado" y "Enviar
// Nota Escalado Sin Match" en este workflow). Cualquier error de cualquiera de los 3 cae en
// "Registrar Pendiente Audio Fallido" -> INSERT en preguntas_sin_match_pendientes (misma tabla que
// usa el resto del escalado silencioso) + nota privada en Chatwoot avisando que hay un audio sin
// procesar. No se reusa el flujo de dedup de "Registrar Pendiente Sin Match" porque ese depende de
// nodos rio abajo (Armar Mensajes) que en esta rama nunca corrieron -- es una falla rara (timeout
// de API), no hace falta la misma proteccion anti-duplicado que las preguntas de texto repetidas.
//
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";
import { randomUUID } from "crypto";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const OPENAI_CRED_ID = "XjYyT7i3oP95CavU";
const OPENAI_CRED_NAME = "OpenAi account";
const POSTGRES_CRED_ID = "65YYZNhTfBBheEpo";
const POSTGRES_CRED_NAME = "Postgres account";

const BACKUP_PATH = new URL("./workflow_backup_pre-feat-transcribir-audio_2026-08-19.json", import.meta.url);

async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    console.error("ERROR", res.status, JSON.stringify(body, null, 2));
    throw new Error(`API ${path} devolvio ${res.status}`);
  }
  return body;
}

// Codigo identico al de "Normalizar Audio" en workflow_mateo (5).json -- no se toca nada de la
// logica de deteccion de formato, solo se porta.
const NORMALIZAR_AUDIO_CODE = `// Whisper (OpenAI y Groq) decide el formato del audio por el nombre de archivo
// que viaja en el multipart, no por el contenido. Si el binario llega sin
// extension -- pasa cuando el data_url no termina en .ogg/.mp3, p.ej. el mock
// que manda la clave del archivo en un query param -- responde
// "Invalid file format" aunque el audio sea perfectamente valido.
// Aca deducimos la extension real (primero por magic bytes, que no mienten) y
// reescribimos fileName / fileExtension / mimeType antes de mandarlo.

const SOPORTADOS = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'];

const POR_MIME = {
  'audio/ogg': 'ogg',
  'audio/oga': 'oga',
  'audio/opus': 'ogg',
  'application/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'm4a',
  'video/mp4': 'mp4',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
};

const MIME_POR_EXT = {
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  mp3: 'audio/mpeg',
  mpga: 'audio/mpeg',
  mpeg: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  wav: 'audio/wav',
  webm: 'audio/webm',
  flac: 'audio/flac',
};

function porMagicBytes(buffer) {
  if (!buffer || buffer.length < 12) return '';
  const ascii = (desde, largo) => buffer.slice(desde, desde + largo).toString('latin1');

  if (ascii(0, 4) === 'OggS') return 'ogg';
  if (ascii(0, 4) === 'fLaC') return 'flac';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return 'wav';
  // EBML: contenedor Matroska/WebM
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return 'webm';
  if (ascii(4, 4) === 'ftyp') return 'm4a';
  if (ascii(0, 3) === 'ID3') return 'mp3';
  // Frame sync de MPEG audio (0xFFEx / 0xFFFx)
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return 'mp3';
  return '';
}

for (let i = 0; i < items.length; i++) {
  const item = items[i];
  const bin = item.binary && item.binary.data;

  if (!bin) {
    throw new Error(
      'No llego audio binario en la propiedad "data". Revisa que "Descargar Audio" ' +
      'tenga Response > Format = File y que la URL del adjunto devuelva el archivo ' +
      '(un 401/404 en HTML tambien cae aca).'
    );
  }

  let ext = '';

  try {
    const buffer = await this.helpers.getBinaryDataBuffer(i, 'data');
    ext = porMagicBytes(buffer);
  } catch (e) {
    // Si no se puede leer el buffer seguimos con los otros metodos.
  }

  const mime = String(bin.mimeType || '').split(';')[0].trim().toLowerCase();

  if (!SOPORTADOS.includes(ext)) {
    ext = POR_MIME[mime] || '';
  }
  if (!SOPORTADOS.includes(ext)) {
    const declarada = String(bin.fileExtension || '').replace('.', '').toLowerCase();
    if (SOPORTADOS.includes(declarada)) ext = declarada;
  }
  if (!SOPORTADOS.includes(ext)) {
    const m = String(bin.fileName || '').match(/\\.([a-z0-9]+)$/i);
    if (m && SOPORTADOS.includes(m[1].toLowerCase())) ext = m[1].toLowerCase();
  }
  if (!SOPORTADOS.includes(ext)) {
    // Ultimo recurso: las notas de voz de WhatsApp son ogg/opus.
    ext = 'ogg';
  }

  bin.fileExtension = ext;
  bin.fileName = 'audio.' + ext;
  bin.mimeType = MIME_POR_EXT[ext] || mime || 'audio/ogg';
  bin.fileType = 'audio';
}

return items;
`;

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const nodeByName = (name) => {
    const n = wf.nodes.find((x) => x.name === name);
    if (!n) throw new Error(`No se encontro el nodo "${name}"`);
    return n;
  };

  // ========== Rewire: "Tiene Texto" (false) ahora pasa por "¿Es Audio?" ==========
  const tieneTexto = nodeByName("Tiene Texto");
  const finSinTexto = nodeByName("Fin - Sin Texto (audio/imagen, todavia no manejado)");
  const finSinTextoConn = wf.connections["Tiene Texto"].main[1];
  if (!finSinTextoConn || finSinTextoConn[0]?.node !== finSinTexto.name) {
    throw new Error('"Tiene Texto" (false) no apunta a "Fin - Sin Texto..." como se esperaba -- revisar a mano.');
  }
  wf.connections["Tiene Texto"].main[1] = [{ node: "¿Es Audio?", type: "main", index: 0 }];
  console.log('"Tiene Texto" (false) reconectado a "¿Es Audio?".');

  // ========== Nodo nuevo: "¿Es Audio?" ==========
  const esAudio = {
    id: randomUUID(),
    name: "¿Es Audio?",
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [tieneTexto.position[0] + 280, finSinTexto.position[1]],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [
          {
            id: randomUUID(),
            leftValue: "={{ $('Webhook1').item.json.body.conversation.messages[0].attachments[0].file_type }}",
            rightValue: "audio",
            operator: { type: "string", operation: "equals", name: "filter.operator.equals" },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
  };
  wf.nodes.push(esAudio);
  wf.connections["¿Es Audio?"] = {
    main: [
      [{ node: "Descargar Audio", type: "main", index: 0 }],
      [{ node: finSinTexto.name, type: "main", index: 0 }],
    ],
  };
  console.log('Nodo "¿Es Audio?" creado (true -> Descargar Audio, false -> Fin - Sin Texto de siempre).');

  // ========== Pipeline de audio: Descargar -> Normalizar -> Transcribir ==========
  const descargarAudio = {
    id: randomUUID(),
    name: "Descargar Audio",
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [esAudio.position[0] + 280, esAudio.position[1] - 150],
    parameters: {
      url: "={{ (() => { const url = $('Webhook1').item.json.body.conversation.messages[0].attachments[0].data_url; if (url.startsWith('http')) return url; return $('Config Chatwoot').item.json.chatwoot_api.replace(/\\/api\\/v1\\/?$/, '') + url; })() }}",
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: "api_access_token", value: "={{ $('Config Chatwoot').item.json.chatwoot_token }}" },
        ],
      },
      options: {
        response: { response: { responseFormat: "file" } },
      },
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    onError: "continueErrorOutput",
  };
  wf.nodes.push(descargarAudio);

  const normalizarAudio = {
    id: randomUUID(),
    name: "Normalizar Audio",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [descargarAudio.position[0] + 280, descargarAudio.position[1]],
    parameters: { jsCode: NORMALIZAR_AUDIO_CODE },
    onError: "continueErrorOutput",
  };
  wf.nodes.push(normalizarAudio);

  const transcribirAudio = {
    id: randomUUID(),
    name: "Transcribir Audio",
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [normalizarAudio.position[0] + 280, normalizarAudio.position[1]],
    parameters: {
      method: "POST",
      url: "https://api.openai.com/v1/audio/transcriptions",
      authentication: "predefinedCredentialType",
      nodeCredentialType: "openAiApi",
      sendBody: true,
      contentType: "multipart-form-data",
      bodyParameters: {
        parameters: [
          { parameterType: "formBinaryData", name: "file", inputDataFieldName: "data" },
          { name: "model", value: "whisper-1" },
          { name: "language", value: "es" },
          { name: "response_format", value: "json" },
        ],
      },
      options: { timeout: 120000 },
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    onError: "continueErrorOutput",
    credentials: { openAiApi: { id: OPENAI_CRED_ID, name: OPENAI_CRED_NAME } },
  };
  wf.nodes.push(transcribirAudio);

  wf.connections["Descargar Audio"] = {
    main: [
      [{ node: "Normalizar Audio", type: "main", index: 0 }],
      [{ node: "Registrar Pendiente Audio Fallido", type: "main", index: 0 }],
    ],
  };
  wf.connections["Normalizar Audio"] = {
    main: [
      [{ node: "Transcribir Audio", type: "main", index: 0 }],
      [{ node: "Registrar Pendiente Audio Fallido", type: "main", index: 0 }],
    ],
  };
  // Salida exitosa se mezcla en el MISMO "Buffer Mensaje" que ya usa el camino de texto (segundo
  // origen, mismo patron de merge que ya usa el workflow en otros puntos).
  wf.connections["Transcribir Audio"] = {
    main: [
      [{ node: "Buffer Mensaje", type: "main", index: 0 }],
      [{ node: "Registrar Pendiente Audio Fallido", type: "main", index: 0 }],
    ],
  };
  console.log('Pipeline "Descargar Audio" -> "Normalizar Audio" -> "Transcribir Audio" creado y conectado (exito -> Buffer Mensaje, error -> escalado).');

  // ========== Escalado silencioso si algo del pipeline de audio falla ==========
  const registrarPendiente = {
    id: randomUUID(),
    name: "Registrar Pendiente Audio Fallido",
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.5,
    position: [normalizarAudio.position[0], normalizarAudio.position[1] + 250],
    parameters: {
      operation: "executeQuery",
      query:
        "INSERT INTO preguntas_sin_match_pendientes (conversation_id, pregunta_original)\nVALUES ({{ $('Webhook1').item.json.body.conversation.messages[0].conversation_id }}, 'Mandó un audio que no pudimos transcribir automáticamente.');",
      options: {},
    },
    credentials: { postgres: { id: POSTGRES_CRED_ID, name: POSTGRES_CRED_NAME } },
  };
  wf.nodes.push(registrarPendiente);

  const prepararNota = {
    id: randomUUID(),
    name: "Preparar Nota Escalado Audio",
    type: "n8n-nodes-base.set",
    typeVersion: 3.4,
    position: [registrarPendiente.position[0] + 280, registrarPendiente.position[1]],
    parameters: {
      assignments: {
        assignments: [
          {
            id: randomUUID(),
            name: "motivo",
            value:
              "Llegó un audio que no pudimos transcribir automáticamente (falla técnica al procesarlo). Escuchalo directo acá en Chatwoot y contestale al cliente vos mismo -- el bot no se lo pudo mandar.",
            type: "string",
          },
        ],
      },
      options: {},
    },
  };
  wf.nodes.push(prepararNota);

  const enviarNota = {
    id: randomUUID(),
    name: "Enviar Nota Escalado Audio",
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [prepararNota.position[0] + 280, prepararNota.position[1]],
    parameters: {
      method: "POST",
      url: "={{ $('Config Chatwoot').item.json.chatwoot_api }}/accounts/{{ $('Webhook1').item.json.body.account.id }}/conversations/{{ $('Webhook1').item.json.body.conversation.messages[0].conversation_id }}/messages",
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: "api_access_token", value: "={{ $('Config Chatwoot').item.json.chatwoot_token }}" },
          { name: "Content-Type", value: "application/json" },
        ],
      },
      sendBody: true,
      specifyBody: "json",
      jsonBody: "={{ JSON.stringify({ content: $json.motivo, message_type: 'outgoing', private: true }) }}",
      options: { timeout: 20000 },
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    onError: "continueErrorOutput",
  };
  wf.nodes.push(enviarNota);

  const finAudioEscalado = {
    id: randomUUID(),
    name: "Fin - Audio Sin Transcribir (Escalado)",
    type: "n8n-nodes-base.noOp",
    typeVersion: 1,
    position: [enviarNota.position[0] + 280, enviarNota.position[1]],
    parameters: {},
  };
  wf.nodes.push(finAudioEscalado);

  wf.connections["Registrar Pendiente Audio Fallido"] = { main: [[{ node: "Preparar Nota Escalado Audio", type: "main", index: 0 }]] };
  wf.connections["Preparar Nota Escalado Audio"] = { main: [[{ node: "Enviar Nota Escalado Audio", type: "main", index: 0 }]] };
  wf.connections["Enviar Nota Escalado Audio"] = { main: [[{ node: "Fin - Audio Sin Transcribir (Escalado)", type: "main", index: 0 }]] };
  console.log('Rama de escalado silencioso creada: "Registrar Pendiente Audio Fallido" -> "Preparar Nota Escalado Audio" -> "Enviar Nota Escalado Audio" -> "Fin - Audio Sin Transcribir (Escalado)".');

  // ========== "Buffer Mensaje": usar el texto transcripto si el audio se proceso en esta ejecucion ==========
  const bufferMensaje = nodeByName("Buffer Mensaje");
  const oldMessageData = "message: $('Webhook1').item.json.body.content,";
  if (!bufferMensaje.parameters.messageData.includes(oldMessageData)) {
    throw new Error('"Buffer Mensaje" no tiene el messageData esperado -- puede que ya se haya tocado, revisar a mano.');
  }
  bufferMensaje.parameters.messageData = bufferMensaje.parameters.messageData.replace(
    oldMessageData,
    "message: (() => { try { return $('Transcribir Audio').item.json.text; } catch (e) { return $('Webhook1').item.json.body.content; } })(),"
  );
  console.log('"Buffer Mensaje" actualizado: usa el texto transcripto cuando "Transcribir Audio" corrio en esta ejecucion, si no cae al body.content de siempre.');

  const allowedSettingsKeys = [
    "saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
    "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder",
  ];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => allowedSettingsKeys.includes(k)));

  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: JSON.stringify(body) });
  console.log("Actualizado. Nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  // ========== Verificacion post-aplicacion ==========
  const fresh = await api(`/workflows/${WORKFLOW_ID}`);
  let ok = true;
  const check = (label, cond) => { console.log(label + ":", cond ? "OK" : "ALGO NO CUADRA"); ok = ok && cond; };

  check('"Tiene Texto" (false) -> "¿Es Audio?"', fresh.connections["Tiene Texto"]?.main?.[1]?.[0]?.node === "¿Es Audio?");
  check('"¿Es Audio?" existe con 2 salidas', !!fresh.nodes.find((n) => n.name === "¿Es Audio?"));
  check('"¿Es Audio?" true -> Descargar Audio', fresh.connections["¿Es Audio?"]?.main?.[0]?.[0]?.node === "Descargar Audio");
  check('"¿Es Audio?" false -> Fin - Sin Texto (sin cambios)', fresh.connections["¿Es Audio?"]?.main?.[1]?.[0]?.node === finSinTexto.name);
  check('"Descargar Audio" existe con credencial correcta via Config Chatwoot (sin credential propio)', !!fresh.nodes.find((n) => n.name === "Descargar Audio"));
  check('"Normalizar Audio" tiene el codigo esperado', fresh.nodes.find((n) => n.name === "Normalizar Audio")?.parameters.jsCode.includes("porMagicBytes"));
  const fTranscribir = fresh.nodes.find((n) => n.name === "Transcribir Audio");
  check('"Transcribir Audio" usa credencial "OpenAi account"', fTranscribir?.credentials?.openAiApi?.id === OPENAI_CRED_ID);
  check('"Transcribir Audio" -> Buffer Mensaje (exito)', fresh.connections["Transcribir Audio"]?.main?.[0]?.[0]?.node === "Buffer Mensaje");
  check('"Transcribir Audio" -> Registrar Pendiente Audio Fallido (error)', fresh.connections["Transcribir Audio"]?.main?.[1]?.[0]?.node === "Registrar Pendiente Audio Fallido");
  const fRegistrar = fresh.nodes.find((n) => n.name === "Registrar Pendiente Audio Fallido");
  check('"Registrar Pendiente Audio Fallido" usa credencial "Postgres account"', fRegistrar?.credentials?.postgres?.id === POSTGRES_CRED_ID);
  check('Cadena de escalado completa', fresh.connections["Registrar Pendiente Audio Fallido"]?.main?.[0]?.[0]?.node === "Preparar Nota Escalado Audio"
    && fresh.connections["Preparar Nota Escalado Audio"]?.main?.[0]?.[0]?.node === "Enviar Nota Escalado Audio"
    && fresh.connections["Enviar Nota Escalado Audio"]?.main?.[0]?.[0]?.node === "Fin - Audio Sin Transcribir (Escalado)");
  const fBuffer = fresh.nodes.find((n) => n.name === "Buffer Mensaje");
  check('"Buffer Mensaje" usa el texto transcripto con fallback', fBuffer?.parameters.messageData.includes("Transcribir Audio').item.json.text"));

  console.log(ok ? "\nTodos los cambios aplicados y verificados correctamente." : "\nREVISAR A MANO, algo no quedo como se esperaba.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
