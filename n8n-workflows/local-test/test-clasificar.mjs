import fs from 'fs';

const kits = JSON.parse(fs.readFileSync('n8n-workflows/local-test/kits-reales.json', 'utf8'));
const code = fs.readFileSync('n8n-workflows/local-test/clasificar-extraido.js', 'utf8');

function correr(mensaje, telefono) {
  const store = {
    'Buscar Kits Activos': { item: { json: { kits } } },
    'Unir Mensajes': { item: { json: { texto_completo: mensaje } } },
    'Webhook1': { item: { json: { body: { conversation: { messages: [{ sender: { phone_number: telefono } }] } } } } },
  };
  const $ = (name) => store[name];
  const fn = new Function('$', code);
  return fn($);
}

const casos = [
  ['¡Hola! Quiero conocer mas sobre el combo 110 a 120 + Codo y carbu!!', '+5493510000000', 'plantilla exacta -> kit 1'],
  ['Hola buenos día te consulto que sale el kit de 120 tapa de cilindri cdi y el cilindro que cuesta', '+5493510000000', 'BUG: antes matcheaba kit 1, ahora deberia dar sin_match'],
  ['Hola', '+5493510000000', 'saludo puro'],
  ['Hola buenas tarde', '+5493510000000', 'saludo puro'],
  ['¡Hola! Quiero más información', '+5493510000000', 'saludo puro'],
  ['Hola, tienen el escape dm curvo?', '+5493510000000', 'keyword -> kit 2 (sin precio)'],
  ['cuanto sale el escape dm curvo', '+5493510000000', 'consulta de precio -> sin_match (todavia)'],
  ['una consulta cualquiera sin sentido', '+5493513784909', 'numero demo -> siempre kit 1'],
];

for (const [msg, tel, esperado] of casos) {
  const r = correr(msg, tel);
  console.log('---');
  console.log('mensaje:', msg);
  console.log('esperado:', esperado);
  console.log('resultado:', JSON.stringify(r[0].json));
}
