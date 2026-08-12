// Corrige el jsCode de "Chequear Continuidad de Kit" (ya desplegado con un bug:
// no contemplaba que "Preparar Envio Kit" recorta el primer parrafo del saludo
// del kit cuando ya habia conversacion previa con el cliente).
import fs from 'fs';

const IN = 'n8n-workflows/local-test/execs/wf_pre_continuidad_fix2.json';
const OUT = 'n8n-workflows/local-test/execs/wf_post_continuidad_fix2.json';

const wf = JSON.parse(fs.readFileSync(IN, 'utf8'));
const nodo = wf.nodes.find(n => n.name === 'Chequear Continuidad de Kit');
if (!nodo) throw new Error('nodo no encontrado');

nodo.parameters.jsCode = `const normalizar = (s) => s.toString().toLowerCase()
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
`;

fs.writeFileSync(OUT, JSON.stringify(wf, null, 2));
console.log('jsCode corregido y guardado en', OUT);
