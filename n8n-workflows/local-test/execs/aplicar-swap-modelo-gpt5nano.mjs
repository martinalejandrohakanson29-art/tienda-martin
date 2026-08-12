// Reemplaza "DeepSeek Chat Model1" (el modelo que alimenta AI Agent2 y
// Responder Seguimiento Kit, es decir los 2 nodos que le hablan directo al
// cliente) por un nodo OpenAI Chat Model apuntando a gpt-5-nano.
// No se toca "DeepSeek Chat Model - Extraccion" (clasificador + 11 nodos de
// extraccion), que sigue en DeepSeek.
// El nodo DeepSeek viejo queda en el lienzo pero desconectado, por si hay que
// volver atras rapido desde la UI.
import fs from 'fs';

const IN = 'n8n-workflows/local-test/execs/wf_pre_modelswap.json';
const OUT = 'n8n-workflows/local-test/execs/wf_post_modelswap.json';
const CREDENCIAL = { id: 'XjYyT7i3oP95CavU', name: 'OpenAi account' };

const wf = JSON.parse(fs.readFileSync(IN, 'utf8'));

const viejo = wf.nodes.find(n => n.name === 'DeepSeek Chat Model1');
if (!viejo) throw new Error('no se encontro DeepSeek Chat Model1');

const nuevoNodo = {
  parameters: {
    model: { __rl: true, mode: 'id', value: 'gpt-5-nano' },
    options: {},
  },
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  typeVersion: 1.2,
  position: [viejo.position[0], viejo.position[1] + 160],
  id: 'b5a1c0f2-8e6a-4b1e-9c3d-gpt5nano0001',
  name: 'GPT-5 nano Chat Model',
  credentials: { openAiApi: CREDENCIAL },
};

wf.nodes.push(nuevoNodo);

// Rewire: la conexion ai_languageModel de "DeepSeek Chat Model1" -> [AI Agent2, Responder Seguimiento Kit]
// pasa a salir del nodo nuevo. El nodo viejo queda en el JSON sin conexiones salientes.
const targets = wf.connections['DeepSeek Chat Model1'].ai_languageModel[0];
wf.connections['GPT-5 nano Chat Model'] = { ai_languageModel: [targets] };
delete wf.connections['DeepSeek Chat Model1'];

fs.writeFileSync(OUT, JSON.stringify(wf, null, 2));
console.log('Nodo nuevo agregado: GPT-5 nano Chat Model');
console.log('Conectado a:', JSON.stringify(targets.map(t => t.node)));
console.log('DeepSeek Chat Model1 queda en el lienzo, desconectado.');
console.log('Guardado en', OUT);
