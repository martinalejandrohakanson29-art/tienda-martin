// Corre los 110 escenarios de escenarios.mjs contra el stack 100% local.
// Escribe resultado incremental en resultados-bateria.json a medida que
// avanza (para poder leerlo mientras corre en background) y un resumen al
// final. No toca produccion: todo pega a localhost.
import fs from 'fs';
import http from 'http';
import { escenarios } from './escenarios.mjs';
import * as A from './arnes.mjs';

const CONV_ID = 1;
const PHONE = '+5493510000000';
const RESULT_FILE = 'C:/Users/User/local-infra/resultados-bateria.json';
const LOG_FILE = 'C:/Users/User/local-infra/bateria.log';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function guardarResultados(resultados) {
  fs.writeFileSync(RESULT_FILE, JSON.stringify(resultados, null, 2));
}

async function redisGet(key) {
  const net = await import('net');
  return new Promise((resolve) => {
    const sock = net.createConnection(6379, 'localhost', () => {
      const cmd = `*2\r\n$3\r\nGET\r\n$${key.length}\r\n${key}\r\n`;
      sock.write(cmd);
    });
    let buf = '';
    sock.on('data', (d) => { buf += d.toString(); sock.end(); });
    sock.on('close', () => {
      if (buf.startsWith('$-1')) resolve(null);
      else resolve(buf.includes('\r\n') ? true : null);
    });
    sock.on('error', () => resolve(null));
  });
}
async function redisSet(key, val) {
  const net = await import('net');
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(6379, 'localhost', () => {
      const parts = ['SET', key, val];
      const cmd = `*${parts.length}\r\n` + parts.map((p) => `$${Buffer.byteLength(p)}\r\n${p}\r\n`).join('');
      sock.write(cmd);
    });
    sock.on('data', () => { sock.end(); resolve(true); });
    sock.on('error', reject);
  });
}
async function botPausadoRedis(phone, convId = CONV_ID) {
  // La clave real que usa el workflow es bot_pausado:{conversation_id} (numerico),
  // no por telefono -- ver nodos "Marcar Bot Pausado" / "Chequear Bot Pausado".
  const v = await redisGet(`bot_pausado:${convId}`);
  return !!v;
}

async function setEstadoBot(encendido) {
  await A.db(`INSERT INTO bot_estado (id, encendido, actualizado_por) VALUES (1, $1, 'bateria') ON CONFLICT (id) DO UPDATE SET encendido=$1, actualizado_por='bateria'`, [encendido]);
}

async function prepararEscenario(esc) {
  await A.resetMock();
  await A.limpiarConversacion(CONV_ID, PHONE);
  await A.flushRedis();
  await A.db(`DELETE FROM compatibilidades`);
  await A.db(`DELETE FROM precios_stock`);
  await A.db(`DELETE FROM info_negocio`);
  await A.db(`DELETE FROM conocimiento_libre`);
  await A.db(`DELETE FROM kits_publicidad`);
  await setEstadoBot(!esc.botOff);
  if (esc.seedRedis) await redisSet(`bot_pausado:${CONV_ID}`, '1');
  if (esc.seed) await esc.seed(A.db, CONV_ID);
}

// Gap >= este umbral = turno conversacional real (esperar a que termine
// antes de mandar el siguiente, como bateria2.js contra produccion).
// Gap chico = rafaga deliberada (mandar todo junto para que el buffer los
// agrupe; esperar entre medio rompería justamente lo que se quiere probar).
const UMBRAL_TURNO_SECUENCIAL_MS = 5000;

async function correrGenerico(esc) {
  await prepararEscenario(esc);
  const token = esc.tokenOverride !== undefined ? esc.tokenOverride : undefined;
  const antes = await A.mensajesMock(CONV_ID);
  const antesId = antes.length ? Math.max(...antes.map((m) => m.id)) : 0;
  const lastExecId = await A.ultimoIdEjecucion();
  const t0 = Date.now();
  let execDetail = { nodePath: [], errors: [] };
  let ultimoExecId = lastExecId;

  for (let i = 0; i < esc.mensajes.length; i++) {
    const m = esc.mensajes[i];
    const gap = m.esperaAntesMs ?? esc.esperaEntreMs ?? 1000;
    const esperarTurnoAnterior = i > 0 && gap >= UMBRAL_TURNO_SECUENCIAL_MS;
    if (i > 0) await A.esperar(esperarTurnoAnterior ? 500 : gap);
    if (esperarTurnoAnterior) {
      // Turno conversacional: esperar a que la ejecucion del mensaje anterior
      // termine del todo antes de mandar este, para no mezclar respuestas.
      const execAnterior = await A.esperarEjecucion(ultimoExecId, 90000, 4000);
      if (!execAnterior.timeout) { ultimoExecId = Number(execAnterior.id); execDetail = await A.detalleEjecucion(execAnterior.id); }
    }
    const overrides = { convId: CONV_ID, phone: PHONE, ...m };
    if (token !== undefined) {
      // hack: enviarMensaje usa WEBHOOK_TOKEN fijo del modulo; para casos de
      // token invalido, mandamos crudo con http directo aca mismo.
      await enviarConTokenCustom(overrides, token);
    } else {
      await A.enviarMensaje(overrides);
    }
  }
  const settleMs = esc.mensajes.length > 1 ? 8000 : 4000;
  const exec = await A.esperarEjecucion(ultimoExecId, 90000, settleMs);
  execDetail = exec.timeout ? { nodePath: [], errors: [{ name: 'timeout', error: 'no termino a tiempo' }] } : await A.detalleEjecucion(exec.id);
  const duracionMs = Date.now() - t0;
  const msgs = await A.mensajesMock(CONV_ID);
  const nuevosMensajes = msgs.filter((m) => m.id > antesId);
  const ultimo = nuevosMensajes[nuevosMensajes.length - 1] || null;
  const redisBotPausado = await botPausadoRedis(PHONE);

  return {
    db: A.db, convId: CONV_ID, phone: PHONE, msgs, nuevosMensajes, ultimo,
    execDetail, duracionMs, redisBotPausado, antesId, todasLasEjecuciones: [],
  };
}

function enviarConTokenCustom(overrides, token) {
  // reimplementacion minima solo para el caso de token invalido/vacio
  return new Promise((resolve) => {
    const body = JSON.stringify({
      account: { id: 1, name: 'Revolucion' }, content: overrides.content || '',
      created_at: new Date().toISOString(), id: overrides.msgId || 999999,
      inbox: { id: 1, name: 'x' }, message_type: 'incoming', private: false,
      sender: { id: 1, name: 'x', email: 'x', type: 'contact', account: { id: 1 } },
      event: 'message_created',
      conversation: { id: overrides.convId || 1, inbox_id: 1, messages: [{ id: overrides.msgId || 999999, content: overrides.content || '', conversation_id: overrides.convId || 1, message_type: 0, sender_type: 'Contact', sender_id: 1 }], meta: { sender: { id: 1, phone_number: overrides.phone, type: 'contact' } }, status: 'open' },
    });
    const path = `/webhook/chatwoot-mensaje${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const req = http.request({ host: 'localhost', port: 5678, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => { res.on('data', () => {}); res.on('end', resolve); });
    req.on('error', () => resolve());
    req.write(body); req.end();
  });
}

// ---------------- handlers custom ----------------
const customHandlers = {
  async despachoEscalonado() {
    await prepararEscenario({ botOff: true });
    await A.enviarMensaje({ content: 'primer mensaje con bot apagado', convId: CONV_ID, phone: PHONE, msgId: 88001 });
    await A.esperarEjecucion(await A.ultimoIdEjecucion() - 1, 60000);
    await A.esperar(2000);
    const pendientes1 = await A.db(`SELECT count(*)::int n FROM respuestas_pendientes WHERE estado='pendiente'`);
    await setEstadoBot(true);
    const t0 = Date.now();
    const { execSync } = await import('child_process');
    let salida;
    try {
      salida = execSync('npx tsx despachar-cola-local.mjs', {
        cwd: 'C:/Users/User/Desktop/claude/tienda-martin/n8n-workflows/local-test',
        env: { ...process.env, DATABASE_URL: A.DB_URL, CHATWOOT_API_URL: 'http://localhost:4000/api/v1', CHATWOOT_API_TOKEN: 'dummy-bot-token', CHATWOOT_ADMIN_API_TOKEN: 'dummy-admin-token', CHATWOOT_BOT_USER_ID: '2' },
        timeout: 60000,
      }).toString();
    } catch (e) { salida = String(e); }
    const dur = Date.now() - t0;
    return manualRes(`pendientes antes de despachar: ${pendientes1[0]?.n}. resultado despacho: ${salida.trim()}. duracion: ${dur}ms`);
  },
  async colaDescarteHumano() {
    await prepararEscenario({ botOff: true });
    await A.db(`INSERT INTO respuestas_pendientes (conversation_id, account_id, contenido, origen) VALUES ($1, 1, 'respuesta vieja que deberia descartarse', 'respuesta')`, [CONV_ID]);
    await A.esperar(1500); // evitar colision de timestamp truncado a segundo entre el insert y el mensaje humano
    // simular que un humano ya respondio en la conversacion real (mock)
    const httpModule = await import('http');
    await new Promise((resolve) => {
      const body = JSON.stringify({ content: 'ya te ayudo yo, un segundo', message_type: 'outgoing', private: false, sender: { id: 999, type: 'user' } });
      const req = httpModule.request({ host: 'localhost', port: 4000, path: `/api/v1/accounts/1/conversations/${CONV_ID}/messages`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => { res.on('data', () => {}); res.on('end', resolve); });
      req.write(body); req.end();
    });
    await setEstadoBot(true);
    const { execSync } = await import('child_process');
    let salida;
    try {
      salida = execSync('npx tsx despachar-cola-local.mjs --forzar', {
        cwd: 'C:/Users/User/Desktop/claude/tienda-martin/n8n-workflows/local-test',
        env: { ...process.env, DATABASE_URL: A.DB_URL, CHATWOOT_API_URL: 'http://localhost:4000/api/v1', CHATWOOT_API_TOKEN: 'dummy-bot-token', CHATWOOT_ADMIN_API_TOKEN: 'dummy-admin-token', CHATWOOT_BOT_USER_ID: '2' },
        timeout: 30000,
      }).toString();
    } catch (e) { salida = String(e); }
    const fila = await A.db(`SELECT estado, motivo FROM respuestas_pendientes ORDER BY id DESC LIMIT 1`);
    return { ok: fila[0]?.estado === 'descartado', detalle: `despacho: ${salida.trim()} | fila final: ${JSON.stringify(fila[0])}` };
  },
  async colaContactoLargo() {
    // Pasa por la API real (route.ts hace contacto.slice(0,120) ANTES de
    // encolarRespuesta) -- insertar directo por SQL salteaba esa capa.
    await prepararEscenario({ botOff: true });
    const contactoLargo = 'X'.repeat(200);
    await new Promise((resolve) => {
      const body = JSON.stringify({ conversation_id: CONV_ID, account_id: 1, content: 'prueba contacto largo', contacto: contactoLargo });
      const req = http.request({ host: 'localhost', port: 3100, path: '/api/chatwoot/enviar', method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dummy-local-secret', 'Content-Length': Buffer.byteLength(body) } }, (res) => { res.on('data', () => {}); res.on('end', resolve); });
      req.write(body); req.end();
    });
    const r = await A.db(`SELECT contacto FROM respuestas_pendientes ORDER BY id DESC LIMIT 1`);
    return { ok: (r[0]?.contacto?.length ?? 999) <= 120, detalle: `largo guardado: ${r[0]?.contacto?.length}` };
  },
  async aprenderYReformular() {
    await prepararEscenario({});
    await A.enviarMensaje({ content: 'donde quedan ubicados?', convId: CONV_ID, phone: PHONE, msgId: 91001 });
    await A.esperarEjecucion(await A.ultimoIdEjecucion() - 1, 60000);
    const pend = await A.db(`SELECT id FROM preguntas_negocio_pendientes WHERE conversation_id=$1 ORDER BY id DESC LIMIT 1`, [CONV_ID]);
    if (!pend.length) return manualRes('no se registro pendiente de negocio tras la primera pregunta; no se pudo continuar el escenario');
    const lastExec1 = await A.ultimoIdEjecucion();
    await A.enviarMensaje({ content: 'estamos en Bv. San Juan 500, cerca de la terminal', senderType: 'team', convId: CONV_ID, phone: PHONE, msgId: 91002 });
    await A.esperarEjecucion(lastExec1, 60000);
    await A.esperar(3000);
    const lastExec2 = await A.ultimoIdEjecucion();
    await A.enviarMensaje({ content: 'y donde queda el local exactamente?', convId: CONV_ID, phone: PHONE, msgId: 91003 });
    const exec3 = await A.esperarEjecucion(lastExec2, 60000);
    const detail3 = exec3.timeout ? { nodePath: [] } : await A.detalleEjecucion(exec3.id);
    const msgs = await A.mensajesMock(CONV_ID);
    const ultimo = msgs[msgs.length - 1];
    return { ok: !!(ultimo && !ultimo.private), detalle: `respuesta a la reformulacion: ${JSON.stringify(ultimo)} | nodos: ${detail3.nodePath.filter(n=>/Negocio/i.test(n)).join(',')}` };
  },
  async appSinToken() {
    const httpModule = await import('http');
    return new Promise((resolve) => {
      const body = JSON.stringify({ conversation_id: 1, account_id: 1, content: 'prueba sin token' });
      const req = httpModule.request({ host: 'localhost', port: 3100, path: '/api/chatwoot/enviar', method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer TOKEN-INVALIDO', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
        resolve({ ok: res.statusCode === 401, detalle: `status: ${res.statusCode}` });
      });
      req.on('error', (e) => resolve(manualRes('error de red: ' + e.message)));
      req.write(body); req.end();
    });
  },
  async concurrenciaClientes() {
    await prepararEscenario({});
    await A.limpiarConversacion(2, '+5493520000000');
    const lastExec = await A.ultimoIdEjecucion();
    await Promise.all([
      A.enviarMensaje({ content: 'hola soy cliente uno, tenes kit 100?', convId: 1, phone: PHONE, msgId: 92001, senderName: 'Cliente Uno' }),
      A.enviarMensaje({ content: 'hola soy cliente dos, tenes kit 200?', convId: 2, phone: '+5493520000000', msgId: 92002, senderName: 'Cliente Dos', contactId: 2 }),
    ]);
    await A.esperar(25000);
    const m1 = await A.mensajesMock(1);
    const m2 = await A.mensajesMock(2);
    return manualRes(`conv1 mensajes: ${m1.length} (${m1[m1.length-1]?.content?.slice(0,80)}) | conv2 mensajes: ${m2.length} (${m2[m2.length-1]?.content?.slice(0,80)})`);
  },
  async rafagaGrande() {
    await prepararEscenario({});
    const antes = (await A.mensajesMock(1)).length;
    for (let i = 0; i < 20; i++) {
      await A.enviarMensaje({ content: `mensaje de rafaga numero ${i + 1}`, convId: 1, phone: PHONE, msgId: 93000 + i });
      await A.esperar(300);
    }
    await A.esperar(40000);
    const despues = await A.mensajesMock(1);
    return { ok: (despues.length - antes) <= 3, detalle: `mensajes nuevos tras 20 seguidos: ${despues.length - antes}` };
  },
  async inspeccionEstatica() {
    const fs2 = await import('fs');
    const wf = JSON.parse(fs2.readFileSync('C:/Users/User/Desktop/claude/tienda-martin/n8n-workflows/local-test/workflow_prod_current.json', 'utf8'));
    const llmNodes = wf.nodes.filter((n) => /lmChatDeepSeek|lmChatOpenAi/.test(n.type));
    // Los nodos LangChain de modelo configuran timeout/reintentos en
    // parameters.options.{timeout,maxRetries}, no en el retryOnFail generico
    // de nodos de accion (Postgres/HTTP).
    const sinConfig = llmNodes.filter((n) => !(n.parameters?.options?.timeout && n.parameters?.options?.maxRetries));
    return { ok: sinConfig.length === 0, detalle: `nodos LLM: ${llmNodes.map((n) => `${n.name}(timeout=${n.parameters?.options?.timeout},maxRetries=${n.parameters?.options?.maxRetries})`).join(', ')}` };
  },
};
const manualRes = (detalle) => ({ ok: null, detalle });

// ---------------- runner principal ----------------
async function main() {
  fs.writeFileSync(LOG_FILE, '');
  const soloIds = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
  const lista = soloIds ? escenarios.filter((e) => soloIds.includes(e.id)) : escenarios;
  const resultados = [];
  guardarResultados(resultados);
  log(`Arrancando bateria: ${lista.length} escenarios${soloIds ? ' (filtrado: ' + soloIds.join(',') + ')' : ''}`);

  for (const esc of lista) {
    const fila = { id: esc.id, seccion: esc.seccion, label: esc.label };
    if (esc.omitido) {
      fila.estado = 'omitido';
      fila.detalle = esc.omitido;
      log(`#${esc.id} [${esc.seccion}] OMITIDO: ${esc.label} -- ${esc.omitido}`);
      resultados.push(fila);
      guardarResultados(resultados);
      continue;
    }
    try {
      let res;
      if (esc.custom) {
        const handler = customHandlers[esc.custom];
        if (!handler) {
          fila.estado = 'no_implementado';
          fila.detalle = `handler custom "${esc.custom}" no implementado en este runner`;
          log(`#${esc.id} [${esc.seccion}] NO IMPLEMENTADO: ${esc.label}`);
          resultados.push(fila);
          guardarResultados(resultados);
          continue;
        }
        res = await handler();
      } else {
        const ctx = await correrGenerico(esc);
        res = await esc.assert(ctx);
      }
      fila.estado = res.ok === true ? 'PASS' : res.ok === false ? 'FAIL' : 'REVISAR';
      fila.detalle = res.detalle;
      log(`#${esc.id} [${esc.seccion}] ${fila.estado}: ${esc.label} -- ${String(res.detalle).slice(0, 200)}`);
    } catch (e) {
      fila.estado = 'ERROR';
      fila.detalle = e.stack || String(e);
      log(`#${esc.id} [${esc.seccion}] ERROR: ${esc.label} -- ${e.message}`);
    }
    resultados.push(fila);
    guardarResultados(resultados);
    // Margen entre escenarios: una ejecucion "success" puede haber disparado
    // el ultimo POST a mock-chatwoot practicamente en simultaneo con el
    // cierre del polling: sin este margen, un mensaje de cola tardio puede
    // aterrizar ya dentro de la ventana del escenario siguiente.
    await A.esperar(6000);
  }

  const resumen = resultados.reduce((acc, r) => { acc[r.estado] = (acc[r.estado] || 0) + 1; return acc; }, {});
  log(`FIN. Resumen: ${JSON.stringify(resumen)}`);
  process.exit(0);
}

main().catch((e) => { log('ERROR FATAL: ' + (e.stack || e)); process.exit(1); });
