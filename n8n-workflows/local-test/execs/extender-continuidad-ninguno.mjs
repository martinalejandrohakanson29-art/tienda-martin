// Extiende "Chequear Continuidad de Kit" para que tambien intercepte el caso
// NINGUNO (antes solo interceptaba AMBIGUO). El nodo ahora sabe de cual de
// los dos estados vino (via $json.estado, que ya trae "Parsear Deteccion
// Kit") y si no logra resolverlo, vuelve exactamente al camino que tenia
// antes segun el estado original - no los mezcla.
import fs from 'fs';

const IN = 'n8n-workflows/local-test/execs/wf_pre_ninguno.json';
const OUT = 'n8n-workflows/local-test/execs/wf_post_ninguno.json';

const wf = JSON.parse(fs.readFileSync(IN, 'utf8'));
const byName = (n) => {
  const node = wf.nodes.find(x => x.name === n);
  if (!node) throw new Error('nodo no encontrado: ' + n);
  return node;
};

// 1) Actualizar el jsCode de "Chequear Continuidad de Kit"
const chequeo = byName('Chequear Continuidad de Kit');
chequeo.parameters.jsCode = `const normalizar = (s) => s.toString().toLowerCase()
  .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
  .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u');

const estadoOriginal = ($json.estado || 'NINGUNO').toString().toUpperCase();
const resultadoSinContinuar = estadoOriginal === 'AMBIGUO' ? 'ambiguo_sin_continuar' : 'ninguno_sin_continuar';

const historial = ($('Formatear Historial (Pre-Kit)').item.json.historial_texto || '').toString();
const historialNorm = normalizar(historial);

// ultimo tramo del Asesor: todo despues de la ultima vez que aparece "asesor:"
const idxAsesor = historialNorm.lastIndexOf('asesor:');
if (idxAsesor === -1) return [{ json: { resultado: resultadoSinContinuar } }];
const idxClienteDespues = historialNorm.indexOf('cliente:', idxAsesor);
const ultimoTurnoAsesor = idxClienteDespues === -1
  ? historialNorm.slice(idxAsesor)
  : historialNorm.slice(idxAsesor, idxClienteDespues);

if (!/para\\s*qu?e?\\s*moto/.test(ultimoTurnoAsesor)) {
  return [{ json: { resultado: resultadoSinContinuar } }];
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

if (!mejorKit) return [{ json: { resultado: resultadoSinContinuar } }];

return [{ json: { resultado: 'continua', output: JSON.stringify({ estado: 'EXACTO', kit_nombre: mejorKit.nombre }) } }];
`;
console.log('OK: jsCode de Chequear Continuidad de Kit actualizado con soporte para NINGUNO');

// 2) Convertir el IF "¿Continua Conversacion de Kit?" en un Switch de 3 salidas
const ifNode = byName('¿Continua Conversacion de Kit?');
if (ifNode.type !== 'n8n-nodes-base.if') throw new Error('el nodo ya no es el IF esperado, no se toca');
ifNode.type = 'n8n-nodes-base.switch';
ifNode.typeVersion = 3.4;
ifNode.parameters = {
  rules: {
    values: [
      {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
          conditions: [{
            id: 'c3d4e5f6-continua-0001',
            leftValue: '={{ $json.resultado }}',
            rightValue: 'continua',
            operator: { type: 'string', operation: 'equals' },
          }],
          combinator: 'and',
        },
        renameOutput: true,
        outputKey: 'Continua',
      },
      {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
          conditions: [{
            id: 'd4e5f6a7-ambiguo-0001',
            leftValue: '={{ $json.resultado }}',
            rightValue: 'ambiguo_sin_continuar',
            operator: { type: 'string', operation: 'equals' },
          }],
          combinator: 'and',
        },
        renameOutput: true,
        outputKey: 'AmbiguoSinContinuar',
      },
    ],
  },
  options: { fallbackOutput: 'extra', renameFallbackOutput: 'NingunoSinContinuar' },
};
console.log('OK: ¿Continua Conversacion de Kit? convertido a Switch de 3 salidas');

// 3) Rewire conexiones
wf.connections['¿Continua Conversacion de Kit?'] = {
  main: [
    [{ node: 'Parsear Deteccion Kit', type: 'main', index: 0 }], // Continua
    [
      { node: 'Chequear Conversacion Iniciada (Ambigua)', type: 'main', index: 0 },
      { node: '¿Hay Contexto Previo? (Ambigua)', type: 'main', index: 0 },
    ], // AmbiguoSinContinuar: exactamente el camino que ya tenia AMBIGUO
    [{ node: 'Clasificador Intento', type: 'main', index: 0 }], // NingunoSinContinuar: exactamente el camino que ya tenia NINGUNO
  ],
};

// Ruteo Deteccion Kit -> salida NINGUNO (index 2, fallback) apuntaba directo a
// "Clasificador Intento". Ahora pasa primero por el mismo chequeo.
const ruteo = wf.connections['Ruteo Deteccion Kit'];
const salidaNinguno = ruteo.main[2];
if (salidaNinguno.length !== 1 || salidaNinguno[0].node !== 'Clasificador Intento') {
  throw new Error('la salida NINGUNO de Ruteo Deteccion Kit no es la esperada, no se toca');
}
ruteo.main[2] = [{ node: 'Chequear Continuidad de Kit', type: 'main', index: 0 }];
console.log('OK: salida NINGUNO de Ruteo Deteccion Kit ahora pasa por Chequear Continuidad de Kit');

fs.writeFileSync(OUT, JSON.stringify(wf, null, 2));
console.log('Guardado en', OUT);
