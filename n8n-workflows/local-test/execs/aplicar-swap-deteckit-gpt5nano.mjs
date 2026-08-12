// Le da a "Detectar Mencion Kit" su propio modelo (GPT-5 nano), separandolo
// de "DeepSeek Chat Model - Extraccion" que siguen usando los otros 11 nodos
// de extraccion/clasificacion. Motivo: mismo mensaje literal, clasificado
// distinto (EXACTO vs NINGUNO) por DeepSeek en dos ejecuciones separadas, sin
// ninguna red de seguridad downstream para ese caso puntual (a diferencia de
// las demas extracciones, que despues pasan por un match contra la base).
import fs from 'fs';

const IN = 'n8n-workflows/local-test/execs/wf_pre_deteckit.json';
const OUT = 'n8n-workflows/local-test/execs/wf_post_deteckit.json';
const CREDENCIAL = { id: 'XjYyT7i3oP95CavU', name: 'OpenAi account' };

const wf = JSON.parse(fs.readFileSync(IN, 'utf8'));

const objetivo = wf.nodes.find(n => n.name === 'Detectar Mencion Kit');
if (!objetivo) throw new Error('no se encontro Detectar Mencion Kit');

const nuevoNodo = {
  parameters: {
    model: { __rl: true, mode: 'id', value: 'gpt-5-nano' },
    options: {},
  },
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  typeVersion: 1.2,
  position: [objetivo.position[0] - 220, objetivo.position[1] + 160],
  id: 'd4e5f6a7-8b9c-4d1e-9f2a-gpt5nanodetkit',
  name: 'GPT-5 nano Chat Model - Deteccion Kit',
  credentials: { openAiApi: CREDENCIAL },
};
wf.nodes.push(nuevoNodo);

const targets = wf.connections['DeepSeek Chat Model - Extraccion'].ai_languageModel[0];
const idx = targets.findIndex(t => t.node === 'Detectar Mencion Kit');
if (idx === -1) throw new Error('Detectar Mencion Kit no estaba conectado a DeepSeek Chat Model - Extraccion como se esperaba');
targets.splice(idx, 1); // se lo saca de la lista compartida

wf.connections['GPT-5 nano Chat Model - Deteccion Kit'] = {
  ai_languageModel: [[{ node: 'Detectar Mencion Kit', type: 'ai_languageModel', index: 0 }]],
};

fs.writeFileSync(OUT, JSON.stringify(wf, null, 2));
console.log('Nodo nuevo: GPT-5 nano Chat Model - Deteccion Kit -> Detectar Mencion Kit');
console.log('DeepSeek Chat Model - Extraccion ahora conectado a', targets.length, 'nodos (antes 12)');
console.log('Guardado en', OUT);
