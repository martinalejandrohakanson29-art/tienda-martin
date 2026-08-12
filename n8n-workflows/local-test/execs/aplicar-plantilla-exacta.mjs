// Agrega un atajo deterministico: si el mensaje del cliente coincide EXACTO
// (normalizado) con una plantilla de anuncio guardada en el kit, se salta el
// llamado a IA (Detectar Mencion Kit) y va directo a "Parsear Deteccion Kit"
// como si el clasificador hubiera dicho EXACTO. Si no matchea, sigue el
// camino de siempre sin cambios.
import fs from 'fs';

const IN = 'n8n-workflows/local-test/execs/wf_pre_plantilla.json';
const OUT = 'n8n-workflows/local-test/execs/wf_post_plantilla.json';

const wf = JSON.parse(fs.readFileSync(IN, 'utf8'));
const byName = (n) => {
  const node = wf.nodes.find(x => x.name === n);
  if (!node) throw new Error('nodo no encontrado: ' + n);
  return node;
};

// 1) Buscar Kits Activos: sumar plantillas_bienvenida al SELECT
const buscarKits = byName('Buscar Kits Activos');
const oldQuery = "SELECT COALESCE(json_agg(json_build_object('id', id, 'nombre', nombre, 'keywords', keywords, 'mensaje_bienvenida', mensaje_bienvenida, 'foto_url', foto_url, 'detalle', detalle) ORDER BY creado_en ASC), '[]'::json) AS kits FROM kits_publicidad WHERE activo = true;";
const newQuery = "SELECT COALESCE(json_agg(json_build_object('id', id, 'nombre', nombre, 'keywords', keywords, 'mensaje_bienvenida', mensaje_bienvenida, 'foto_url', foto_url, 'detalle', detalle, 'plantillas_bienvenida', plantillas_bienvenida) ORDER BY creado_en ASC), '[]'::json) AS kits FROM kits_publicidad WHERE activo = true;";
if (buscarKits.parameters.query !== oldQuery) throw new Error('Buscar Kits Activos: query no coincide con lo esperado');
buscarKits.parameters.query = newQuery;
console.log('OK Buscar Kits Activos: plantillas_bienvenida agregado al SELECT');

// 2) Nodos nuevos
const chequear = byName('Chequear Conversacion Iniciada (Ambigua)'); // solo para tomar una posicion de referencia cercana
const detectar = byName('Detectar Mencion Kit');

const nodoChequeoPlantilla = {
  parameters: {
    jsCode: `const texto = ($('datos_finales2').item.json.texto || '').toString();
const normalizar = (s) => s.toString().trim().toLowerCase().replace(/\\s+/g, ' ');
const textoNorm = normalizar(texto);
const kits = $('Formatear Kits Activos').item.json.kits || [];
for (const kit of kits) {
  const plantillas = (kit.plantillas_bienvenida || '').split('\\n').map(p => p.trim()).filter(Boolean);
  for (const p of plantillas) {
    if (normalizar(p) === textoNorm) {
      return [{ json: { matcheo: true, output: JSON.stringify({ estado: 'EXACTO', kit_nombre: kit.nombre }) } }];
    }
  }
}
return [{ json: { matcheo: false } }];
`,
  },
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [detectar.position[0] - 260, detectar.position[1] - 160],
  id: 'e5f6a7b8-9c0d-41e2-8f3a-chequeoplant01',
  name: 'Chequear Plantilla Exacta',
};

const nodoIfPlantilla = {
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{
        id: 'f6a7b8c9-matcheo-plantilla-0001',
        leftValue: '={{ $json.matcheo }}',
        rightValue: true,
        operator: { type: 'boolean', operation: 'true', singleValue: true },
      }],
      combinator: 'and',
    },
    options: {},
  },
  type: 'n8n-nodes-base.if',
  typeVersion: 2,
  position: [detectar.position[0] - 20, detectar.position[1] - 160],
  id: 'f6a7b8c9-0d1e-42f3-9a4b-ifmatcheo0001',
  name: '¿Matcheo Plantilla?',
};

wf.nodes.push(nodoChequeoPlantilla, nodoIfPlantilla);

// 3) Rewire: Formatear Historial (Pre-Kit) -> Chequear Plantilla Exacta -> ¿Matcheo Plantilla?
//    true -> Parsear Deteccion Kit (directo, saltea IA)
//    false -> Detectar Mencion Kit (como siempre)
const conexionActual = wf.connections['Formatear Historial (Pre-Kit)'];
if (!conexionActual || conexionActual.main[0].length !== 1 || conexionActual.main[0][0].node !== 'Detectar Mencion Kit') {
  throw new Error('Formatear Historial (Pre-Kit) no apunta a Detectar Mencion Kit como se esperaba, no se toca');
}
wf.connections['Formatear Historial (Pre-Kit)'] = {
  main: [[{ node: 'Chequear Plantilla Exacta', type: 'main', index: 0 }]],
};
wf.connections['Chequear Plantilla Exacta'] = {
  main: [[{ node: '¿Matcheo Plantilla?', type: 'main', index: 0 }]],
};
wf.connections['¿Matcheo Plantilla?'] = {
  main: [
    [{ node: 'Parsear Deteccion Kit', type: 'main', index: 0 }], // true: match exacto, saltea IA
    [{ node: 'Detectar Mencion Kit', type: 'main', index: 0 }],   // false: camino de siempre
  ],
};

fs.writeFileSync(OUT, JSON.stringify(wf, null, 2));
console.log('Nodos nuevos: Chequear Plantilla Exacta, ¿Matcheo Plantilla?');
console.log('Rewire: Formatear Historial (Pre-Kit) -> Chequear Plantilla Exacta -> ¿Matcheo Plantilla? -> [Parsear Deteccion Kit | Detectar Mencion Kit]');
console.log('Guardado en', OUT);
