// Espera a que aparezca una ejecución nueva del workflow para el msgId dado,
// la baja completa y muestra un resumen: ruta de nodos, tiempos, clasificación,
// y el contenido de salida relevante.
// Uso: N8N_KEY=... node wait_exec.js <msgIdBuscado> <sentAtISO> [maxWaitMs]
// Opcional: SCRATCH_DIR=<carpeta>/execs para guardar el JSON crudo de cada ejecución.

const https = require('https');
const fs = require('fs');

const API_KEY = process.env.N8N_KEY;
const WORKFLOW_ID = 'MAqIthTkpuAo7iKi';
const msgId = process.argv[2];
const sentAt = new Date(process.argv[3]).getTime();
const maxWait = Number(process.argv[4] || 420000);
const SCRATCH = process.env.SCRATCH_DIR;

function apiGet(path) {
  return new Promise((resolve, reject) => {
    https.get({
      host: 'n8n.revolucionmotos.tech', path,
      headers: { 'X-N8N-API-KEY': API_KEY },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('bad json: ' + data.slice(0,200))); }
      });
    }).on('error', reject);
  });
}

function getOut(rd, nodeName, idx) {
  const r = rd[nodeName];
  if (!r || !r[idx===undefined?0:idx]) return null;
  const d = r[idx===undefined?0:idx].data;
  if (!d || !d.main || !d.main[0] || !d.main[0][0]) return null;
  return d.main[0][0].json;
}

(async () => {
  const deadline = Date.now() + maxWait;
  let found = null;
  while (Date.now() < deadline) {
    const list = await apiGet(`/api/v1/executions?workflowId=${WORKFLOW_ID}&limit=20`);
    for (const e of list.data) {
      // Ojo: puede haber drift de reloj entre esta sandbox y el server de n8n,
      // así que no filtramos fuerte por tiempo, solo evitamos ejecuciones muy viejas.
      if (new Date(e.startedAt).getTime() >= sentAt - 120000 && e.status !== 'running' && e.status !== 'waiting') {
        // fetch full to confirm it's el msgId correcto
        const full = await apiGet(`/api/v1/executions/${e.id}?includeData=true`);
        const rd = full.data?.resultData?.runData;
        if (!rd) continue;
        const wh = getOut(rd, 'Webhook1');
        if (wh && String(wh.body?.id) === String(msgId)) {
          found = full;
          break;
        }
      }
    }
    if (found) break;
    await new Promise(r => setTimeout(r, 3000));
  }

  if (!found) {
    console.log(JSON.stringify({ error: 'no se encontro ejecucion para msgId ' + msgId + ' dentro del timeout' }));
    process.exit(1);
  }

  if (SCRATCH) fs.writeFileSync(`${SCRATCH}/${found.id}.json`, JSON.stringify(found));

  const rd = found.data.resultData.runData;
  const rows = [];
  for (const [name, runs] of Object.entries(rd)) for (const r of runs) rows.push({ name, startTime: r.startTime, executionTime: r.executionTime, error: r.error ? (r.error.message||JSON.stringify(r.error)).slice(0,200) : null });
  rows.sort((a,b) => a.startTime - b.startTime);

  const summary = {
    executionId: found.id,
    status: found.status,
    startedAt: found.startedAt,
    stoppedAt: found.stoppedAt,
    totalDurationSec: ((new Date(found.stoppedAt) - new Date(found.startedAt))/1000).toFixed(1),
    nodePath: rows.map(r => r.name),
    slowNodes: rows.filter(r => r.executionTime > 3000).map(r => ({ name: r.name, sec: (r.executionTime/1000).toFixed(1) })),
    errors: rows.filter(r => r.error).map(r => ({ name: r.name, error: r.error })),
  };

  // capturas de interés
  const wh = getOut(rd, 'Webhook1');
  summary.input = wh ? wh.body.content : null;
  const clasif = getOut(rd, 'Clasificador Intento');
  if (clasif) summary.clasificacion = clasif.output || clasif;
  const df = getOut(rd, 'datos_finales2');
  if (df) summary.textoAgrupado = df.texto;

  for (const n of ['Preparar Respuesta Cliente - Tecnica','Preparar Respuesta Cliente - Negocio','Preparar Respuesta Cliente - Precio','Preparar Envio Kit','Preparar Respuesta Seguimiento Kit','Preparar Pregunta Ambigua','Preparar Escalado - Consulta Tecnica','Preparar Escalado - Consulta Negocio','Preparar Escalado - Consulta Precio','Preparar Escalado - Mayorista o Compra','Preparar Escalado - Contenido']) {
    const o = getOut(rd, n);
    if (o) { summary.nodoRespuesta = n; summary.contenidoRespuesta = o.content || o; break; }
  }
  if (!summary.contenidoRespuesta) {
    const agent = getOut(rd, 'AI Agent2');
    if (agent && agent.output) { summary.nodoRespuesta = 'AI Agent2'; summary.contenidoRespuesta = agent.output; }
  }

  // partes enviadas realmente (loop)
  const loop = rd['Loop Over Items2'];
  if (loop) {
    const partes = [];
    loop.forEach(r => { const o1 = r.data?.main?.[1]; if (o1 && o1[0]) partes.push(o1[0].json.message); });
    if (partes.length) summary.partesEnviadas = partes;
  }

  console.log(JSON.stringify(summary, null, 2));
})();
