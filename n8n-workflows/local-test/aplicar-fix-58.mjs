// Fix del hallazgo #58 (re-auditoria 2026-08-11): "Responder Seguimiento
// Kit" solo devuelve SIN_DATO para preguntas de compatibilidad tecnica
// (regla 8). Cualquier otra pregunta fuera del alcance del kit (horarios,
// ubicacion, medios de pago, etc.) cae en la regla 2 generica, que responde
// localmente ("no tengo el dato a mano") SIN escalar ni registrar nada --
// la pregunta se pierde en silencio. Extiende la regla 8 para que SIN_DATO
// tambien cubra esos casos, asi vuelve al clasificador general y sigue el
// camino estructurado normal (INFO_NEGOCIO u otra rama, con escalado y
// registro de pendiente).
//
// Uso: node aplicar-fix-58.mjs <entrada.json> <salida.json>
import fs from 'fs';

const [entrada, salida] = process.argv.slice(2);
if (!entrada || !salida) { console.error('Uso: node aplicar-fix-58.mjs <entrada.json> <salida.json>'); process.exit(1); }

const wf = JSON.parse(fs.readFileSync(entrada, 'utf8'));
const byName = (name) => {
  const n = wf.nodes.find((x) => x.name === name);
  if (!n) throw new Error('nodo no encontrado: ' + name);
  return n;
};
function replaceOrThrow(str, search, replacement, label) {
  if (typeof search === 'string' && !str.includes(search)) throw new Error('no matcheo: ' + label);
  const out = str.replace(search, replacement);
  if (out === str) throw new Error('replace no cambio nada: ' + label);
  return out;
}

{
  const n = byName('Responder Seguimiento Kit');
  n.parameters.options.systemMessage = replaceOrThrow(
    n.parameters.options.systemMessage,
    'Para cualquier otra pregunta que SI se pueda responder con el dato interno de arriba (precio, que incluye, envio, etc.) segui respondiendo normal en texto libre como indican las reglas anteriores.',
    'Para cualquier otra pregunta que SI se pueda responder con el dato interno de arriba (precio, que incluye, envio, etc.) segui respondiendo normal en texto libre como indican las reglas anteriores. Esta misma salida con SIN_DATO (asi, sin comillas, sin puntuacion, sin nada mas alrededor) tambien aplica para CUALQUIER otra pregunta que no sea sobre la compatibilidad ni sobre los datos propios de este kit (por ejemplo horarios, ubicacion del local, medios de pago, garantia, envios en general, u otro tema del negocio que no este en el [Dato interno] de este kit): en esos casos respondé SIN_DATO en vez de aplicar la regla 2 localmente, para que la pregunta se derive al circuito normal (que sí escala y registra la pendiente) en vez de perderse en una respuesta generica sin seguimiento.',
    'Responder Seguimiento Kit systemMessage regla 8 (extension SIN_DATO fuera de compatibilidad)'
  );
}

fs.writeFileSync(salida, JSON.stringify(wf, null, 2));
console.log('OK, escrito', salida, '-- fix #58 aplicado.');
