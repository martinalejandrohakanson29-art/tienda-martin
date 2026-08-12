function runExpr(jsCode, mockData) {
  const $ = (name) => ({ item: { json: mockData[name] } });
  const fn = new Function('$', jsCode);
  return fn($);
}

const jsCode = `
const normalizar = (s) => s.toString().toLowerCase()
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

const kits = [
  { id: 1, nombre: 'Kit 120 para 110', mensaje_bienvenida: 'Hola amigo, ¿cómo va?\n\nEl combo incluye cilindro 120,\ncarburador CG 125, codo de admisión y filtro.\n\n¿Para qué moto lo estás buscando?' },
  { id: 2, nombre: 'Escape Dm Curvo para 110', mensaje_bienvenida: 'Hola bro!\n\nEl precio del escape Dm curvo es de $129.999 Envio gratis a todo el pais.\n\n¿Para qué moto lo estás buscando?' },
  { id: 3, nombre: 'KIT POTENCIADO 220cc', mensaje_bienvenida: 'Hola amigo como va!   \n🔥 KIT POTENCIADO 220cc (Para varilleros sin balnaceador) 🔥\n✅ Cilindro Dakar 200: Carrera larga (65.5mm).' },
  { id: 7, nombre: 'Combo Escape pwr + Leva 6.40', mensaje_bienvenida: '¡Buenas! El Combo Escape PWR + Leva 6.40 incluye:\n- leva 6.40, resortes de válvulas\n\nPara que moto estas buscando?' },
];

const casos = [
  {
    nombre: 'caso real: Gilera Smash despues de Kit 120',
    historial: 'Cliente: ¡Hola! Quiero conocer mas sobre el combo 110 a 120 + Codo y carbu!!\nAsesor: Hola amigo, ¿cómo va?\n\nEl combo incluye cilindro 120,\ncarburador CG 125, codo de admisión y filtro.\n\n¿Para qué moto lo estás buscando?',
  },
  {
    nombre: 'sin pregunta de moto (asesor dijo otra cosa)',
    historial: 'Cliente: hola\nAsesor: Hola! En que te podemos ayudar?',
  },
  {
    nombre: 'dos kits discutidos, el ultimo es el escape',
    historial: 'Cliente: info del kit 120\nAsesor: Hola amigo, ¿cómo va?\n\nEl combo incluye cilindro 120,\ncarburador CG 125, codo de admisión y filtro.\n\n¿Para qué moto lo estás buscando?\nCliente: mejor el escape\nAsesor: Hola bro!\n\nEl precio del escape Dm curvo es de $129.999 Envio gratis a todo el pais.\n\n¿Para qué moto lo estás buscando?',
  },
  {
    nombre: 'historial vacio',
    historial: '',
  },
  {
    nombre: 'kit 220 (sin pregunta de moto en su plantilla)',
    historial: 'Cliente: info del 220\nAsesor: Hola amigo como va!   \n🔥 KIT POTENCIADO 220cc (Para varilleros sin balnaceador) 🔥\n✅ Cilindro Dakar 200: Carrera larga (65.5mm).',
  },
  {
    nombre: 'CASO REAL: saludo con el primer parrafo recortado (sin re-saludar)',
    historial: 'Cliente: [auditoria-continuidad] quiero el kit 120\nAsesor: El combo incluye cilindro 120,\ncarburador CG 125, codo de admisión y filtro.\nEs ideal para mejorar la respuesta y el andar en uso diario.\n\nEl precio es $99.000, con envío gratis.\n\n¿Para qué moto lo estás buscando?',
  },
];

for (const c of casos) {
  const mock = { 'Formatear Historial (Pre-Kit)': { historial_texto: c.historial }, 'Formatear Kits Activos': { kits } };
  console.log('--- ' + c.nombre + ' ---');
  console.log(JSON.stringify(runExpr(jsCode, mock)));
}
