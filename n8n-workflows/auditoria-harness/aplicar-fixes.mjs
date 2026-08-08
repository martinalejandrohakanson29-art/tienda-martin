// Aplica los 5 fixes acordados sobre workflow_live.json (bajado en caliente de
// producción) y escribe workflow_updated.json. No toca nada más.
import fs from 'fs';

const wf = JSON.parse(fs.readFileSync('workflow_live.json', 'utf8'));
const byName = name => {
  const n = wf.nodes.find(x => x.name === name);
  if (!n) throw new Error('nodo no encontrado: ' + name);
  return n;
};
// Todo replace() pasa por acá para que un match fallido tire error en vez de
// no-opear en silencio (nos mordió una vez con backslashes anidados).
function replaceOrThrow(str, search, replacement, label) {
  if (typeof search === 'string' && !str.includes(search)) throw new Error('no matcheo: ' + label);
  const out = str.replace(search, replacement);
  if (out === str) throw new Error('replace no cambio nada: ' + label);
  return out;
}

// --- FIX 1: pipeline de "detalle" del kit (compatibilidades/incompatibilidades) ---
// Hoy Buscar Kits Activos ni siquiera trae la columna `detalle` de la DB, así que
// Responder Seguimiento Kit nunca tuvo la lista de motos compatibles/incompatibles
// para responder — por eso alucinaba o devolvía SIN_DATO siempre.
{
  const n = byName('Buscar Kits Activos');
  n.parameters.query = replaceOrThrow(
    n.parameters.query,
    "json_build_object('id', id, 'nombre', nombre, 'keywords', keywords, 'mensaje_bienvenida', mensaje_bienvenida)",
    "json_build_object('id', id, 'nombre', nombre, 'keywords', keywords, 'mensaje_bienvenida', mensaje_bienvenida, 'detalle', detalle)",
    'Buscar Kits Activos query'
  );
}
{
  const n = byName('Parsear Deteccion Kit');
  n.parameters.jsCode = replaceOrThrow(
    n.parameters.jsCode,
    "    mensaje_bienvenida: match ? match.mensaje_bienvenida : '',",
    "    mensaje_bienvenida: match ? match.mensaje_bienvenida : '',\n    detalle: match ? match.detalle : '',",
    'Parsear Deteccion Kit jsCode'
  );
}
{
  // Ojo: este campo es una expresion n8n que a su vez arma texto con comillas y
  // "\n" anidados, asi que el string real en el JSON trae backslashes dobles.
  // En vez de reconstruir el prefijo entero (fragil), anclamos por el final fijo
  // " }}" y le agregamos la ficha tecnica del kit ahi.
  const n = byName('Responder Seguimiento Kit');
  const before = n.parameters.text;
  if (!before.trim().endsWith('}}')) throw new Error('Responder Seguimiento Kit: no termina en }} como se esperaba');
  const sinCierre = before.replace(/\s*\}\}\s*$/, '');
  n.parameters.text = sinCierre +
    ` + ($('Parsear Deteccion Kit').item.json.detalle ? ('\\n\\n[Ficha tecnica completa del kit, incluye a que motos anda y a cuales NO:\\n' + $('Parsear Deteccion Kit').item.json.detalle + ']') : '') }}`;
  if (n.parameters.text === before) throw new Error('Responder Seguimiento Kit: el texto no cambio');

  n.parameters.options.systemMessage = replaceOrThrow(
    n.parameters.options.systemMessage,
    /8\. EXCEPCION puntual a la regla 2 en este contexto:[\s\S]*$/,
    `8. EXCEPCION puntual a la regla 2 en este contexto: si para responder sobre compatibilidad de un modelo de moto puntual con el kit, primero revisá el bloque [Ficha tecnica completa del kit...] si esta presente — ahi suele estar la lista de motos compatibles y la lista de motos NO compatibles. Si el modelo que pregunta el cliente aparece explicitamente en cualquiera de esas dos listas (o es un caso obvio de la misma familia claramente nombrada, ej. "Smash 110 recorrido corto" cubre una pregunta por "Smash 110"), respondé con un si/no directo basado en eso, citando el motivo si esta (ej. "no, el kit 120 no anda en la Wave S"). NUNCA afirmes que un modelo es compatible si no esta en la lista de compatibles - la ausencia de una moto en la lista de NO compatibles no significa que sí ande. Si el modelo no aparece mencionado en ninguna de las dos listas ni en el resto del [Dato interno confirmado...], y por eso no podes responder con certeza, NO le respondas al cliente con la frase de la regla 2 ni con ninguna otra cosa inventada o generica. En ese caso respondé UNICAMENTE con el texto SIN_DATO (asi, sin comillas, sin puntuacion, sin nada mas alrededor). Para cualquier otra pregunta que SI se pueda responder con el dato interno de arriba (precio, que incluye, envio, etc.) segui respondiendo normal en texto libre como indican las reglas anteriores.`,
    'Responder Seguimiento Kit systemMessage regla 8'
  );
}

// --- FIX 1a: Detectar Mencion Kit no debe resolver una NO-respuesta (emoji, "gracias",
// "dale", "ok") como confirmación del kit único. ---
{
  const n = byName('Detectar Mencion Kit');
  n.parameters.options.systemMessage = replaceOrThrow(
    n.parameters.options.systemMessage,
    'Fuera de ese contexto (el ultimo mensaje tuyo no fue esa pregunta), seguí aplicando las reglas de arriba con normalidad.',
    'Fuera de ese contexto (el ultimo mensaje tuyo no fue esa pregunta), seguí aplicando las reglas de arriba con normalidad. IMPORTANTE: un mensaje del cliente sin contenido identificatorio real (un emoji suelto como "🙏" o "👍", un "gracias", "dale", "ok", o cualquier confirmacion generica sin ningun dato puntual) NO cuenta como respuesta valida a esa pregunta de desambiguacion, aunque haya un solo kit activo en la lista — seguí clasificando ese mensaje como AMBIGUO (volvé a preguntar), nunca asumas EXACTO a partir de una no-respuesta.',
    'Detectar Mencion Kit systemMessage'
  );
}

// --- FIX 3: la rama AMBIGUO de kit no debe tragarse el resto del mensaje (precio,
// ubicacion, etc. mencionados en el mismo texto). Hoy termina en un nodo sin salida
// (Fin - Pregunta Ambigua Enviada) apenas manda la pregunta de aclaracion. Lo
// conectamos tambien a Clasificador Intento, igual que ya hacen las ramas NINGUNO
// y SIN_DATO, para que el resto del mensaje se siga clasificando y, si corresponde,
// se responda o se escale.
{
  const conns = wf.connections['Guardar Historial Pregunta Ambigua'];
  if (!conns || !conns.main || !conns.main[0]) throw new Error('Guardar Historial Pregunta Ambigua sin conexiones como se esperaba');
  const yaConectado = conns.main[0].some(c => c.node === 'Clasificador Intento');
  if (yaConectado) throw new Error('Guardar Historial Pregunta Ambigua ya conectaba a Clasificador Intento (¿ya se aplico este fix?)');
  conns.main[0].push({ node: 'Clasificador Intento', type: 'main', index: 0 });
}

// --- FIX 4: extraccion tecnica no debe perder un modelo de moto cuando se
// mencionan dos en el mismo mensaje. ---
for (const nombre of ['Extraer Datos Tecnicos', 'Extraer Datos Tecnicos (Multi)']) {
  const n = byName(nombre);
  n.parameters.options.systemMessage = replaceOrThrow(
    n.parameters.options.systemMessage,
    'Si no podés identificar alguno de los dos campos con claridad, dejalo como string vacio "". No inventes valores.',
    'Si no podés identificar alguno de los dos campos con claridad, dejalo como string vacio "". No inventes valores.\n\nSi el mensaje menciona MAS DE UN modelo de moto puntual (ej. pregunta si un mismo kit/pieza anda en dos motos distintas), no elijas uno solo: poné los dos (o mas) en "modelo_moto" separados por " y " (ej. "wave 110 y keller 110"), para no perder ninguno.',
    nombre + ' systemMessage'
  );
}

// --- FIX 5: no prometer un seguimiento ("ya lo confirmo con el equipo y te aviso")
// desde el agente generico, que no dispara ningun registro real de pregunta
// pendiente — la promesa solo es real cuando pasa por un flujo estructurado de
// extraccion+escalado. Se comparte el mismo texto de regla 2 en AI Agent2 y
// Responder Seguimiento Kit.
for (const nombre of ['AI Agent2', 'Responder Seguimiento Kit']) {
  const n = byName(nombre);
  n.parameters.options.systemMessage = replaceOrThrow(
    n.parameters.options.systemMessage,
    'Si no tenes esa informacion, decilo con naturalidad (ej: "ese dato no lo tengo a mano ahora, ya lo confirmo con el equipo y te aviso") y NO completes el hueco con una respuesta inventada.',
    'Si no tenes esa informacion, decilo con naturalidad SIN prometer un seguimiento o aviso posterior que no depende de vos (ej: "ese dato no lo tengo a mano ahora" o, si podes pedir un dato puntual que falta para ayudar, pedilo) y NO completes el hueco con una respuesta inventada. No digas frases como "ya lo confirmo con el equipo y te aviso" salvo que el mensaje ya incluya una [Nota interna: ...] confirmando que eso efectivamente se registro.',
    nombre + ' systemMessage regla 2'
  );
}

fs.writeFileSync('workflow_updated.json', JSON.stringify(wf, null, 2));
console.log('OK, escrito workflow_updated.json, todos los replace() confirmados.');

const orig = JSON.stringify(JSON.parse(fs.readFileSync('workflow_live.json', 'utf8')));
const upd = JSON.stringify(wf);
console.log('bytes original:', orig.length, '| bytes actualizado:', upd.length);
