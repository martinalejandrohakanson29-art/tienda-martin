// Cuando la pregunta ambigua sobre kits tiene contexto previo en la charla,
// el cliente NO debe recibir el mensaje generico "sobre cual kit..." (ya le
// llega la nota interna al equipo, que es lo que realmente ayuda aca). Solo
// cuando es la primera vez que pregunta por un kit sin dato puntual (nunca
// hablamos antes) tiene sentido preguntarle. Se inserta un IF entre
// "Chequear Conversacion Iniciada (Ambigua)" (ya calcula "cantidad") y
// "Preparar Pregunta Ambigua": si cantidad>0, se saltea directo a liberar el
// lock, sin armar ni mandar nada al cliente. La nota privada
// (¿Hay Contexto Previo? (Ambigua)) sigue exactamente igual, sin tocar.
import fs from 'fs';

const IN = 'n8n-workflows/local-test/execs/wf_pre_supresion.json';
const OUT = 'n8n-workflows/local-test/execs/wf_post_supresion.json';

const wf = JSON.parse(fs.readFileSync(IN, 'utf8'));
const byName = (n) => {
  const node = wf.nodes.find(x => x.name === n);
  if (!node) throw new Error('nodo no encontrado: ' + n);
  return node;
};

const chequear = byName('Chequear Conversacion Iniciada (Ambigua)');

const nodoIf = {
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{
        id: 'e1f2a3b4-hay-que-preguntar-0001',
        leftValue: '={{ ($json.cantidad || 0) === 0 }}',
        rightValue: true,
        operator: { type: 'boolean', operation: 'true', singleValue: true },
      }],
      combinator: 'and',
    },
    options: {},
  },
  type: 'n8n-nodes-base.if',
  typeVersion: 2,
  position: [chequear.position[0] + 220, chequear.position[1]],
  id: 'e1f2a3b4-c5d6-47e8-9f0a-hayquepreg001',
  name: '¿Hay Que Preguntar? (Ambigua)',
};

wf.nodes.push(nodoIf);

const conexionActual = wf.connections['Chequear Conversacion Iniciada (Ambigua)'];
if (conexionActual.main[0].length !== 1 || conexionActual.main[0][0].node !== 'Preparar Pregunta Ambigua') {
  throw new Error('la conexion de Chequear Conversacion Iniciada (Ambigua) no es la esperada, no se toca');
}
wf.connections['Chequear Conversacion Iniciada (Ambigua)'] = {
  main: [[{ node: '¿Hay Que Preguntar? (Ambigua)', type: 'main', index: 0 }]],
};
wf.connections['¿Hay Que Preguntar? (Ambigua)'] = {
  main: [
    [{ node: 'Preparar Pregunta Ambigua', type: 'main', index: 0 }], // true: sin contexto previo, sigue como siempre
    [{ node: 'Liberar Lock - Pregunta Ambigua', type: 'main', index: 0 }], // false: hay contexto, no se le manda nada al cliente
  ],
};

fs.writeFileSync(OUT, JSON.stringify(wf, null, 2));
console.log('Nodo nuevo: ¿Hay Que Preguntar? (Ambigua)');
console.log('Guardado en', OUT);
