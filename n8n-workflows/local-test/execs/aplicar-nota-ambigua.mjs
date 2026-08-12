// Cuando "Detectar Mencion Kit" da AMBIGUO, el cliente ya recibe la pregunta
// generica ("sobre cual kit...") - eso no se toca. Este fix agrega, en paralelo
// y solo si hay historial previo en la charla, una nota privada al equipo con
// el mensaje del cliente + el contexto reciente, para que puedan guiarlo
// directo si reconocen a que kit se referia (en vez de que el bot lo adivine).
import fs from 'fs';

const IN = 'n8n-workflows/local-test/execs/wf_pre_notaambigua.json';
const OUT = 'n8n-workflows/local-test/execs/wf_post_notaambigua.json';

const wf = JSON.parse(fs.readFileSync(IN, 'utf8'));
const byName = (n) => {
  const node = wf.nodes.find(x => x.name === n);
  if (!node) throw new Error('nodo no encontrado: ' + n);
  return node;
};

const chequear = byName('Chequear Conversacion Iniciada (Ambigua)');
const configChatwootRef = byName('Config Chatwoot'); // solo para confirmar que existe

const nodoIf = {
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{
        id: 'a1b2c3d4-hay-contexto-ambigua-0001',
        leftValue: "={{ !!$('Formatear Historial (Pre-Kit)').item.json.historial_texto }}",
        rightValue: true,
        operator: { type: 'boolean', operation: 'true', singleValue: true },
      }],
      combinator: 'and',
    },
    options: {},
  },
  type: 'n8n-nodes-base.if',
  typeVersion: 2,
  position: [chequear.position[0], chequear.position[1] + 220],
  id: 'a1b2c3d4-e5f6-47a8-9b0c-hayctxambigua',
  name: '¿Hay Contexto Previo? (Ambigua)',
};

const nodoPreparar = {
  parameters: {
    assignments: {
      assignments: [{
        id: 'b2c3d4e5-nota-ambigua-content-0001',
        name: 'content',
        value: "=Pregunta ambigua sobre kits — quizas ya sepamos a cual se refiere por el contexto, para guiarlo directo sin esperar a que conteste de nuevo.\n\nCliente escribio: \"{{ $('datos_finales2').item.json.texto }}\"\n\nContexto reciente de la charla:\n{{ $('Formatear Historial (Pre-Kit)').item.json.historial_texto }}",
        type: 'string',
      }],
    },
    options: {},
  },
  type: 'n8n-nodes-base.set',
  typeVersion: 3.4,
  position: [chequear.position[0] + 220, chequear.position[1] + 220],
  id: 'b2c3d4e5-f6a7-48b9-0c1d-prepnotaambig',
  name: 'Preparar Nota Ambigua',
};

const nodoEnviar = {
  parameters: {
    method: 'POST',
    url: "={{ $('Config Chatwoot').item.json.chatwoot_api }}/accounts/{{ $('Webhook1').item.json.body.account.id }}/conversations/{{ $('Webhook1').item.json.body.conversation.messages[0].conversation_id }}/messages",
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'api_access_token', value: "={{ $('Config Chatwoot').item.json.chatwoot_token }}" },
        { name: 'Content-Type', value: 'application/json' },
      ],
    },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ content: $json.content, message_type: 'outgoing', private: true }) }}",
    options: {},
  },
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [chequear.position[0] + 440, chequear.position[1] + 220],
  id: 'c3d4e5f6-a7b8-49c0-1d2e-envnotaambig',
  name: 'Enviar Nota Ambigua',
};

wf.nodes.push(nodoIf, nodoPreparar, nodoEnviar);

// Ruteo Deteccion Kit -> output AMBIGUO (index 1) ya apunta a "Chequear
// Conversacion Iniciada (Ambigua)"; se agrega el nuevo IF como segundo
// destino del mismo output, en paralelo (no reemplaza nada existente).
const ruteo = wf.connections['Ruteo Deteccion Kit'];
const salidaAmbiguo = ruteo.main[1];
if (salidaAmbiguo.length !== 1 || salidaAmbiguo[0].node !== 'Chequear Conversacion Iniciada (Ambigua)') {
  throw new Error('la salida AMBIGUO de Ruteo Deteccion Kit no es la esperada, no se toca');
}
salidaAmbiguo.push({ node: '¿Hay Contexto Previo? (Ambigua)', type: 'main', index: 0 });

wf.connections['¿Hay Contexto Previo? (Ambigua)'] = {
  main: [
    [{ node: 'Preparar Nota Ambigua', type: 'main', index: 0 }], // true
    [], // false: no hay contexto previo, no se manda nada
  ],
};
wf.connections['Preparar Nota Ambigua'] = { main: [[{ node: 'Enviar Nota Ambigua', type: 'main', index: 0 }]] };
// "Enviar Nota Ambigua" no conecta a nada mas: rama independiente, no bloquea
// ni depende del chain principal (Marcar Auto-Eco -> Enviar Pregunta Ambigua -> ... -> Liberar Lock).

fs.writeFileSync(OUT, JSON.stringify(wf, null, 2));
console.log('Nodos agregados: ¿Hay Contexto Previo? (Ambigua), Preparar Nota Ambigua, Enviar Nota Ambigua');
console.log('Guardado en', OUT);
