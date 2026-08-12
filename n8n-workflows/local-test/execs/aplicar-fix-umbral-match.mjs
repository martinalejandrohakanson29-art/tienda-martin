// Aplica el fix de "matching difuso demasiado laxo" sobre una copia del workflow:
// - sube rm_score >= 0.5 a >= 0.75 en las 8 queries que matchean contra
//   precios_stock / compatibilidades / kits_publicidad (no toca conocimiento_libre,
//   ya esta en 0.75, ni rm_modelo_ok).
// - en Buscar Producto (Multi) y Buscar Precio Stock: agrega producto_real al SELECT
//   y lo propaga a Preparar Contexto Producto (Multi) / Preparar Contexto Precio Encontrado.
import fs from 'fs';

const IN = process.argv[2] || 'n8n-workflows/local-test/execs/workflow_current.json';
const OUT = process.argv[3] || 'n8n-workflows/local-test/execs/workflow_fixed.json';

const wf = JSON.parse(fs.readFileSync(IN, 'utf8'));
const byName = (n) => {
  const node = wf.nodes.find(x => x.name === n);
  if (!node) throw new Error('nodo no encontrado: ' + n);
  return node;
};

function replaceExact(node, field, from, to, path) {
  const cur = path ? path(node) : node.parameters[field];
  if (!cur.includes(from)) throw new Error(`no se encontro el string esperado en ${node.name}.${field}:\n---\n${from}\n---`);
  const next = cur.split(from).join(to);
  if (path) path(node, next); else node.parameters[field] = next;
  return next;
}

let changes = 0;
function bump(nodeName, count) {
  const node = byName(nodeName);
  const q = node.parameters.query;
  const n = (q.match(/>= 0\.5/g) || []).length;
  if (n !== count) throw new Error(`${nodeName}: esperaba ${count} ocurrencias de '>= 0.5', encontre ${n}`);
  node.parameters.query = q.replace(/>= 0\.5/g, '>= 0.75');
  changes += count;
  console.log(`OK ${nodeName}: ${count} umbral(es) 0.5 -> 0.75`);
}

// 1) Umbrales: precios_stock / compatibilidades / kits_publicidad, 0.5 -> 0.75
bump('Buscar Producto (Multi)', 2);
bump('Buscar Precio Stock', 2);
bump('Buscar Datos Tecnicos (Multi)', 5);
bump('Buscar Compatibilidad', 5);
bump('Buscar Pendiente Producto (Multi) Existente', 2);
bump('Buscar Pendiente Precio Existente', 2);
bump('Buscar Pendiente Datos Tecnicos (Multi) Existente', 2);
bump('Buscar Pendiente Tecnica Existente', 2);

// 2) producto_real: SELECT + propagacion a la etiqueta de contexto
function agregarProductoReal(nodeName) {
  const node = byName(nodeName);
  const before = node.parameters.query;
  let q = before;
  q = replaceExactStr(q,
    'SELECT precio, stock, detalle FROM (',
    'SELECT precio, stock, detalle, producto_real FROM (', nodeName);
  q = replaceExactStr(q,
    'SELECT p.precio, p.stock, p.detalle, p.creado_en, 1 AS prio,',
    'SELECT p.precio, p.stock, p.detalle, p.producto AS producto_real, p.creado_en, 1 AS prio,', nodeName);
  q = replaceExactStr(q,
    "SELECT NULL::text, NULL::text, k.respuesta, k.creado_en, 2,",
    "SELECT NULL::text, NULL::text, k.respuesta, NULL::text, k.creado_en, 2,", nodeName);
  node.parameters.query = q;
  console.log(`OK ${nodeName}: producto_real agregado al SELECT`);
}
function replaceExactStr(hay, from, to, ctx) {
  if (!hay.includes(from)) throw new Error(`(${ctx}) no se encontro:\n${from}`);
  return hay.split(from).join(to);
}
agregarProductoReal('Buscar Producto (Multi)');
agregarProductoReal('Buscar Precio Stock');

function usarProductoReal(nodeName, refExpr) {
  const node = byName(nodeName);
  const asg = node.parameters.assignments.assignments[0];
  const from = `'Producto: ' + ${refExpr}.producto + ' | Precio: '`;
  const to = `'Producto: ' + ($json.producto_real || ${refExpr}.producto) + ' | Precio: '`;
  if (!asg.value.includes(from)) throw new Error(`(${nodeName}) no se encontro el fragmento esperado en la etiqueta`);
  asg.value = asg.value.split(from).join(to);
  console.log(`OK ${nodeName}: etiqueta usa producto_real (con fallback)`);
}
usarProductoReal('Preparar Contexto Producto (Multi)', "$('Parsear Producto (Multi)').item.json");
usarProductoReal('Preparar Contexto Precio Encontrado', "$('Parsear Extraccion Precio').item.json");

fs.writeFileSync(OUT, JSON.stringify(wf, null, 2));
console.log(`\nTotal umbrales cambiados: ${changes}`);
console.log('Guardado en', OUT);
