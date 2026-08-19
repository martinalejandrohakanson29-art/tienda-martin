// Fix "/bot off no frena una rafaga que ya esta en proceso": el chequeo de "¿Bot Pausado?" solo
// corria al arrancar el procesamiento de un mensaje entrante (antes de agruparlo en la rafaga de
// 90s). Si la pausa manual (/bot off) se activaba MIENTRAS un mensaje ya estaba esperando su
// turno en la rafaga, el pipeline igual terminaba de correr (varios pasos de IA en cadena) y
// mandaba la respuesta igual, ignorando la pausa.
// Caso real: conv 2141 (+5493535645945), 2026-08-19. El cliente escribio "Pasame la dire" +
// "Hay la encontre en la descripcion gracias", el equipo puso /bot off, y ~80 segundos DESPUES de
// la pausa el bot igual mando dos mensajes ("Pasame la dire: estamos en..." y "Dale, cualquier
// cosa nos escribis.").
//
// Fix: clonar el chequeo de pausa (mismo patron Redis GET + IF que ya existe al arrancar) e
// insertarlo justo despues de "Soy el ultimo?" (true, o sea "ya podes seguir procesando esta
// rafaga"), ANTES de "Traer Buffer". Si esta pausado, va a la MISMA rama de aviso que ya existe
// (Fase 9: "Armar Nota Bot Pausado" -> "Enviar Nota Bot Pausado" -> "Fin - Bot Pausado") en vez de
// duplicar logica. Si no esta pausado, sigue exactamente igual que hoy (-> "Traer Buffer").
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
    new URL(`./workflow_backup_pre-fix-pausa-post-rafaga_2026-08-19.json`, import.meta.url),
    JSON.stringify(wf, null, 2)
  );
  console.log('backup re-confirmado, nodos:', wf.nodes.length);

  const soyUltimo = wf.nodes.find(n => n.name === 'Soy el ultimo?');
  if (!soyUltimo) throw new Error('No se encontro "Soy el ultimo?"');

  const nuevoChequeo = {
    parameters: {
      operation: 'get',
      propertyName: 'pausado',
      key: "=bot_pausado:{{ $('Webhook1').item.json.body.conversation.messages[0].conversation_id }}",
      options: {},
    },
    type: 'n8n-nodes-base.redis',
    typeVersion: 1,
    position: [3088, 220],
    id: 'c1a7e3b0-9f4d-4b6a-8e2c-7d1f6a0b3c99',
    name: 'Chequear Bot Pausado (Post-Rafaga)',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 1000,
    credentials: {
      redis: { id: 'ZUlkjSz8R2bmmO2f', name: 'Redis account 2' },
    },
  };

  const nuevoIf = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{
          id: 'd2b8f4c1-0a5e-4c7b-9f3d-1e6a8b2c4d55',
          leftValue: '={{ $json.pausado }}',
          rightValue: '',
          operator: { type: 'string', operation: 'notEmpty', singleValue: true },
        }],
        combinator: 'and',
      },
      options: {},
    },
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [3360, 220],
    id: 'e5f9a2d3-1b6c-4d8e-af4a-2f7b9c3d5e66',
    name: '¿Bot Pausado? (Post-Rafaga)',
  };

  // Evitar duplicar si ya se corrio antes
  if (wf.nodes.some(n => n.name === 'Chequear Bot Pausado (Post-Rafaga)')) {
    console.log('Los nodos ya existen, no se agregan de nuevo.');
  } else {
    wf.nodes.push(nuevoChequeo, nuevoIf);
    console.log('OK: agregados nodos "Chequear Bot Pausado (Post-Rafaga)" y "¿Bot Pausado? (Post-Rafaga)"');
  }

  const conns = wf.connections;

  // Redirigir "Soy el ultimo?" (true, index 0) para que pase primero por el chequeo nuevo
  const soyUltimoOut = conns['Soy el ultimo?'].main[0];
  const teniaTraerBuffer = soyUltimoOut.some(c => c.node === 'Traer Buffer');
  if (!teniaTraerBuffer) throw new Error('No se encontro la conexion esperada Soy el ultimo? -> Traer Buffer');
  conns['Soy el ultimo?'].main[0] = [{ node: 'Chequear Bot Pausado (Post-Rafaga)', type: 'main', index: 0 }];
  console.log('OK: "Soy el ultimo?" (true) ahora apunta a "Chequear Bot Pausado (Post-Rafaga)"');

  conns['Chequear Bot Pausado (Post-Rafaga)'] = {
    main: [[{ node: '¿Bot Pausado? (Post-Rafaga)', type: 'main', index: 0 }]],
  };

  conns['¿Bot Pausado? (Post-Rafaga)'] = {
    main: [
      [{ node: 'Armar Nota Bot Pausado', type: 'main', index: 0 }],
      [{ node: 'Traer Buffer', type: 'main', index: 0 }],
    ],
  };
  console.log('OK: true -> Armar Nota Bot Pausado (reusa el aviso de la Fase 9), false -> Traer Buffer (camino de siempre)');

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
