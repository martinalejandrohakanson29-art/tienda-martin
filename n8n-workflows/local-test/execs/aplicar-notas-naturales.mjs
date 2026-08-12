// Reformula el texto de las notas internas de escalado (tecnica, precio/producto,
// info del negocio) para que se lean como una pregunta natural en vez de un log
// mecanico tipo "Consulta X sin dato: campo 'Y'. Pregunta original: Z".
// No toca logica, routing, labels ni ninguna otra cosa - solo el string del
// campo "motivo" en 6 nodos Set (version Multi + version legada de cada una
// de las 3 categorias).
import fs from 'fs';

const IN = 'n8n-workflows/local-test/execs/wf_pre_notatecnica.json';
const OUT = 'n8n-workflows/local-test/execs/wf_post_notasnaturales.json';

const wf = JSON.parse(fs.readFileSync(IN, 'utf8'));
const byName = (n) => {
  const node = wf.nodes.find(x => x.name === n);
  if (!node) throw new Error('nodo no encontrado: ' + n);
  return node;
};

function tecnicaExpr(ref) {
  return `={{ (() => {\n  const modelo = (${ref}.modelo_moto || '').toString().trim();\n  const kit = (${ref}.kit || '').toString().trim();\n  const texto = (${ref}.texto_original || '').toString().trim();\n  let resumen;\n  if (kit && modelo) resumen = 'El cliente pregunta si tenemos "' + kit + '" para su ' + modelo + '.';\n  else if (kit) resumen = 'El cliente pregunta por "' + kit + '" (no dijo el modelo de moto).';\n  else if (modelo) resumen = 'El cliente hizo una consulta tecnica sobre su ' + modelo + ' (no identificamos que pieza puntual pedia).';\n  else resumen = 'El cliente hizo una consulta tecnica que no pudimos identificar bien.';\n  return resumen + '\\n\\nMensaje original: "' + texto + '"';\n})() }}`;
}
function productoExpr(ref) {
  return `={{ (() => {\n  const producto = (${ref}.producto || '').toString().trim();\n  const texto = (${ref}.texto_original || '').toString().trim();\n  const resumen = producto ? ('El cliente pregunta por precio o stock de "' + producto + '".') : 'El cliente hizo una consulta de precio/stock que no pudimos identificar bien.';\n  return resumen + '\\n\\nMensaje original: "' + texto + '"';\n})() }}`;
}
function negocioExpr(ref) {
  return `={{ (() => {\n  const tema = (${ref}.tema || '').toString().trim();\n  const texto = (${ref}.texto_original || '').toString().trim();\n  const resumen = tema ? ('El cliente pregunta sobre "' + tema + '" del negocio (no tenemos ese dato cargado).') : 'El cliente hizo una consulta sobre el negocio que no pudimos identificar bien.';\n  return resumen + '\\n\\nMensaje original: "' + texto + '"';\n})() }}`;
}

const cambios = [
  { nodo: 'Preparar Escalado - Datos Tecnicos (Multi)', old: "=Consulta tecnica sin dato en la base: modelo '{{ $('Parsear Datos Tecnicos (Multi)').item.json.modelo_moto }}', kit '{{ $('Parsear Datos Tecnicos (Multi)').item.json.kit }}'. Pregunta original: {{ $('Parsear Datos Tecnicos (Multi)').item.json.texto_original }}", nueva: tecnicaExpr("$('Parsear Datos Tecnicos (Multi)').item.json") },
  { nodo: 'Preparar Escalado - Consulta Tecnica', old: "=Consulta tecnica sin dato en la base: modelo '{{ $('Parsear Extraccion').item.json.modelo_moto }}', kit '{{ $('Parsear Extraccion').item.json.kit }}'. Pregunta original: {{ $('Parsear Extraccion').item.json.texto_original }}", nueva: tecnicaExpr("$('Parsear Extraccion').item.json") },
  { nodo: 'Preparar Escalado - Producto (Multi)', old: "=Consulta de precio/stock sin dato en la base: producto '{{ $('Parsear Producto (Multi)').item.json.producto }}'. Pregunta original: {{ $('Parsear Producto (Multi)').item.json.texto_original }}", nueva: productoExpr("$('Parsear Producto (Multi)').item.json") },
  { nodo: 'Preparar Escalado - Consulta Precio', old: "=Consulta de precio/stock sin dato en la base: producto '{{ $('Parsear Extraccion Precio').item.json.producto }}'. Pregunta original: {{ $('Parsear Extraccion Precio').item.json.texto_original }}", nueva: productoExpr("$('Parsear Extraccion Precio').item.json") },
  { nodo: 'Preparar Escalado - Tema Negocio (Multi)', old: "=Consulta sobre el negocio sin dato registrado: tema '{{ $('Parsear Tema Negocio (Multi)').item.json.tema }}'. Pregunta original: {{ $('Parsear Tema Negocio (Multi)').item.json.texto_original }}", nueva: negocioExpr("$('Parsear Tema Negocio (Multi)').item.json") },
  { nodo: 'Preparar Escalado - Consulta Negocio', old: "=Consulta sobre el negocio sin dato registrado: tema '{{ $('Parsear Tema').item.json.tema }}'. Pregunta original: {{ $('Parsear Tema').item.json.texto_original }}", nueva: negocioExpr("$('Parsear Tema').item.json") },
];

for (const c of cambios) {
  const node = byName(c.nodo);
  const asg = node.parameters.assignments.assignments.find(a => a.name === 'motivo');
  if (!asg) throw new Error(c.nodo + ': no se encontro el assignment "motivo"');
  if (asg.value !== c.old) throw new Error(c.nodo + ': el valor actual no coincide con lo esperado, no se toca.\nActual: ' + asg.value);
  asg.value = c.nueva;
  console.log('OK', c.nodo);
}

fs.writeFileSync(OUT, JSON.stringify(wf, null, 2));
console.log('\nGuardado en', OUT);
