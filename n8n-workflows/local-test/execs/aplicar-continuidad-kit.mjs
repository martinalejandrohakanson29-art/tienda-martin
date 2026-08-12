// Cuando "Detectar Mencion Kit" da AMBIGUO, antes de preguntarle de nuevo al
// cliente, chequea deterministicamente si en realidad esta contestando la
// pregunta de "¿para que moto lo estas buscando?" que el bot le hizo sobre un
// kit puntual: si el ultimo turno del Asesor en el historial contiene esa
// pregunta, y se puede identificar cual fue el kit mas reciente presentado
// (por el texto de su mensaje_bienvenida en el historial), se resuelve como
// EXACTO para ese kit sin volver a preguntar ni mandar nota ambigua. Si no
// se cumple, sigue el camino de siempre sin cambios (pregunta + nota si hay
// contexto).
import fs from 'fs';

const IN = 'n8n-workflows/local-test/execs/wf_pre_continuidad.json';
const OUT = 'n8n-workflows/local-test/execs/wf_post_continuidad.json';

const wf = JSON.parse(fs.readFileSync(IN, 'utf8'));
const byName = (n) => {
  const node = wf.nodes.find(x => x.name === n);
  if (!node) throw new Error('nodo no encontrado: ' + n);
  return node;
};

const chequearAmbigua = byName('Chequear Conversacion Iniciada (Ambigua)');

const nodoChequeoContinuidad = {
  parameters: {
    jsCode: `const normalizar = (s) => s.toString().toLowerCase()
  .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
  .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u');

const historial = ($('Formatear Historial (Pre-Kit)').item.json.historial_texto || '').toString();
const historialNorm = normalizar(historial);

// ultimo tramo del Asesor: todo despues de la ultima vez que aparece "asesor:"
const idxAsesor = historialNorm.lastIndexOf('asesor:');
if (idxAsesor === -1) return [{ json: { continua: false } }];
const idxClienteDespues = historialNorm.indexOf('cliente:', idxAsesor);
const ultimoTurnoAsesor = idxClienteDespues === -1
  ? historialNorm.slice(idxAsesor)
  : historialNorm.slice(idxAsesor, idxClienteDespues);

if (!/para\\s*qu?e?\\s*moto/.test(ultimoTurnoAsesor)) {
  return [{ json: { continua: false } }];
}

// que kit fue el que se presento mas recientemente (el snippet de su mensaje_bienvenida que aparece mas tarde en el historial)
// "Preparar Envio Kit" recorta el primer parrafo (el saludo) cuando ya habia
// conversacion previa con el cliente, asi que probamos el snippet completo y
// tambien sin el primer parrafo, igual que esa logica.
function candidatosSnippet(mensaje) {
  const candidatos = [mensaje];
  const parrafos = mensaje.split(/\\n\\s*\\n/);
  if (parrafos.length > 1) candidatos.push(parrafos.slice(1).join('\\n\\n').trim());
  return candidatos;
}

const kits = $('Formatear Kits Activos').item.json.kits || [];
let mejorKit = null;
let mejorIndice = -1;
for (const kit of kits) {
  const bienvenida = (kit.mensaje_bienvenida || '').toString();
  if (!bienvenida) continue;
  for (const candidato of candidatosSnippet(bienvenida)) {
    const snippet = normalizar(candidato.slice(0, 40).trim());
    if (!snippet) continue;
    const idx = historialNorm.lastIndexOf(snippet);
    if (idx > mejorIndice) {
      mejorIndice = idx;
      mejorKit = kit;
    }
  }
}

if (!mejorKit) return [{ json: { continua: false } }];

return [{ json: { continua: true, output: JSON.stringify({ estado: 'EXACTO', kit_nombre: mejorKit.nombre }) } }];
`,
  },
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [chequearAmbigua.position[0] - 260, chequearAmbigua.position[1] - 160],
  id: 'a1b2c3d4-5e6f-47a8-9b0c-chequeocontkit',
  name: 'Chequear Continuidad de Kit',
};

const nodoIfContinuidad = {
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{
        id: 'b2c3d4e5-continua-kit-0001',
        leftValue: '={{ $json.continua }}',
        rightValue: true,
        operator: { type: 'boolean', operation: 'true', singleValue: true },
      }],
      combinator: 'and',
    },
    options: {},
  },
  type: 'n8n-nodes-base.if',
  typeVersion: 2,
  position: [chequearAmbigua.position[0] - 20, chequearAmbigua.position[1] - 160],
  id: 'b2c3d4e5-6f7a-48b9-0c1d-ifcontinuakit',
  name: '¿Continua Conversacion de Kit?',
};

wf.nodes.push(nodoChequeoContinuidad, nodoIfContinuidad);

// Ruteo Deteccion Kit -> AMBIGUO (index 1) apuntaba directo a
// [Chequear Conversacion Iniciada (Ambigua), ¿Hay Contexto Previo? (Ambigua)].
// Ahora pasa primero por el chequeo deterministico.
const ruteo = wf.connections['Ruteo Deteccion Kit'];
const salidaAmbiguo = ruteo.main[1];
const esperado = JSON.stringify(salidaAmbiguo.map(t => t.node));
const real = JSON.stringify(['Chequear Conversacion Iniciada (Ambigua)', '¿Hay Contexto Previo? (Ambigua)']);
if (esperado !== real) throw new Error('la salida AMBIGUO de Ruteo Deteccion Kit no es la esperada: ' + esperado);
ruteo.main[1] = [{ node: 'Chequear Continuidad de Kit', type: 'main', index: 0 }];

wf.connections['Chequear Continuidad de Kit'] = {
  main: [[{ node: '¿Continua Conversacion de Kit?', type: 'main', index: 0 }]],
};
wf.connections['¿Continua Conversacion de Kit?'] = {
  main: [
    [{ node: 'Parsear Deteccion Kit', type: 'main', index: 0 }], // true: se resuelve solo, sin preguntar ni nota
    [
      { node: 'Chequear Conversacion Iniciada (Ambigua)', type: 'main', index: 0 },
      { node: '¿Hay Contexto Previo? (Ambigua)', type: 'main', index: 0 },
    ], // false: camino de siempre, sin cambios
  ],
};

fs.writeFileSync(OUT, JSON.stringify(wf, null, 2));
console.log('Nodos nuevos: Chequear Continuidad de Kit, ¿Continua Conversacion de Kit?');
console.log('Guardado en', OUT);
