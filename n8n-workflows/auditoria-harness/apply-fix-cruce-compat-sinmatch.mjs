// Fix "cruce entre pendiente de compatibilidad y sin_match": cuando una conversacion tiene las
// dos pendientes al mismo tiempo, una sola nota del equipo (pensada para UNA de las dos) disparaba
// en paralelo la interpretacion de AMBAS ramas, y la rama que no era destinataria de la nota
// terminaba inventando una respuesta igual (confianza "alta" sobre un texto que no le corresponde).
// Caso real: conv 2141 (+5493535645945), nota "le va bien a la trip base mod 2011" (respondiendo
// compatibilidad) tambien se uso para interpretar "Cigueñal tenes??" (sin_match) -> "Si, tengo
// cigueñal y le va bien a la Trip Base mod 2011." (falso, mezclado).
//
// Fix: solo cambio de conexiones, sin nodos nuevos ni cambios de prompt.
// - Se saca la conexion directa "¿Es Respuesta de Mi Equipo?" (true) -> "Buscar Pendiente Sin Match".
// - Se agrega esa misma conexion en dos puntos de salida de la rama de compatibilidad que significan
//   "esta nota NO quedo consumida por compatibilidad":
//     - "¿Hay Pregunta Pendiente?" (false): no habia pendiente de compatibilidad, sigue como siempre.
//     - "Fin - Confianza Baja (no se actua)": habia pendiente pero no se uso (confianza baja), la nota
//       sigue disponible para intentar sin_match.
// - Cuando la nota SI se usa para compatibilidad con confianza alta (termina en "Fin - Aprendizaje
//   Enviado" o "Fin - Equipo Ya Respondio Directo"), la rama sin_match ya no se dispara para esa nota.
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
    new URL(`./workflow_backup_pre-fix-cruce-compat-sinmatch_2026-08-19.json`, import.meta.url),
    JSON.stringify(wf, null, 2)
  );
  console.log('backup re-confirmado, nodos:', wf.nodes.length);

  const conns = wf.connections;

  // 1) Sacar la conexion directa "¿Es Respuesta de Mi Equipo?" (true) -> "Buscar Pendiente Sin Match"
  const equipoOut = conns['¿Es Respuesta de Mi Equipo?'].main[0];
  const before = equipoOut.length;
  conns['¿Es Respuesta de Mi Equipo?'].main[0] = equipoOut.filter(c => c.node !== 'Buscar Pendiente Sin Match');
  if (conns['¿Es Respuesta de Mi Equipo?'].main[0].length !== before - 1) {
    throw new Error('No se encontro la conexion esperada en ¿Es Respuesta de Mi Equipo? -> Buscar Pendiente Sin Match');
  }
  console.log('OK: sacada conexion directa ¿Es Respuesta de Mi Equipo? -> Buscar Pendiente Sin Match');

  // 2) Agregar la conexion en "¿Hay Pregunta Pendiente?" (false, index 1)
  const hayPendienteFalse = conns['¿Hay Pregunta Pendiente?'].main[1];
  if (hayPendienteFalse.some(c => c.node === 'Buscar Pendiente Sin Match')) {
    console.log('YA existia la conexion en ¿Hay Pregunta Pendiente? (false), no se duplica');
  } else {
    hayPendienteFalse.push({ node: 'Buscar Pendiente Sin Match', type: 'main', index: 0 });
    console.log('OK: agregada conexion ¿Hay Pregunta Pendiente? (false) -> Buscar Pendiente Sin Match');
  }

  // 3) Agregar la conexion en "Fin - Confianza Baja (no se actua)" (no tenia salida)
  if (!conns['Fin - Confianza Baja (no se actua)']) {
    conns['Fin - Confianza Baja (no se actua)'] = { main: [[]] };
  }
  const confianzaBajaOut = conns['Fin - Confianza Baja (no se actua)'].main[0];
  if (confianzaBajaOut.some(c => c.node === 'Buscar Pendiente Sin Match')) {
    console.log('YA existia la conexion en Fin - Confianza Baja, no se duplica');
  } else {
    confianzaBajaOut.push({ node: 'Buscar Pendiente Sin Match', type: 'main', index: 0 });
    console.log('OK: agregada conexion Fin - Confianza Baja (no se actua) -> Buscar Pendiente Sin Match');
  }

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
