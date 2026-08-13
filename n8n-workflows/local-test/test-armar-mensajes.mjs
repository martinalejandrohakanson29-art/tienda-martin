import fs from 'fs';

const code = fs.readFileSync('n8n-workflows/local-test/armar-mensajes-extraido.js', 'utf8');

function correr(piezas) {
  const $json = { piezas };
  const fn = new Function('$json', code);
  return fn($json);
}

const casos = [
  {
    nombre: '0 resueltas -> silencio total, todo escala',
    piezas: [
      { texto: 'tienen cilindro de zanella zb', categoria: 'otro', resuelto: false },
    ],
    esperado: { hayMensajes: false, haySinResolver: true },
  },
  {
    nombre: '1 resuelta -> un solo mensaje, sin forzar el 2do',
    piezas: [
      { texto: 'cuanto sale', categoria: 'precio', resuelto: true, mensaje: 'Te queda en $99.000 con envío gratis.' },
    ],
    esperado: { hayMensajes: true, hayMensaje2: false, haySinResolver: false },
  },
  {
    nombre: '2 resueltas -> mensaje1 = mayor prioridad (precio), mensaje2 = el resto',
    piezas: [
      { texto: 'hacen envios', categoria: 'envio', resuelto: true, mensaje: 'Sí, hacemos envíos a todo el país.' },
      { texto: 'cuanto sale', categoria: 'precio', resuelto: true, mensaje: 'Te queda en $99.000.' },
    ],
    esperado: { hayMensajes: true, hayMensaje2: true, mensaje1Empieza: 'Te queda en $99.000.', haySinResolver: false },
  },
  {
    nombre: '3+ resueltas con 1 sin resolver -> prioridad precio>envio>negocio, y la sin resolver igual escala',
    piezas: [
      { texto: 'donde estan ubicados', categoria: 'negocio', resuelto: true, mensaje: 'Estamos en Córdoba capital.' },
      { texto: 'hacen envios', categoria: 'envio', resuelto: true, mensaje: 'Sí, hacemos envíos a todo el país.' },
      { texto: 'cuanto sale', categoria: 'precio', resuelto: true, mensaje: 'Te queda en $99.000.' },
      { texto: 'tienen cilindro de zanella zb', categoria: 'otro', resuelto: false },
    ],
    esperado: { hayMensajes: true, hayMensaje2: true, mensaje1Empieza: 'Te queda en $99.000.', haySinResolver: true },
  },
];

let fallas = 0;
for (const c of casos) {
  const r = correr(c.piezas)[0].json;
  console.log('---');
  console.log('caso:', c.nombre);
  console.log('resultado:', JSON.stringify(r, null, 2));

  const checks = [];
  if (c.esperado.hayMensajes !== undefined) checks.push(['hayMensajes', r.hayMensajes === c.esperado.hayMensajes]);
  if (c.esperado.hayMensaje2 !== undefined) checks.push(['hayMensaje2', r.hayMensaje2 === c.esperado.hayMensaje2]);
  if (c.esperado.haySinResolver !== undefined) checks.push(['haySinResolver', r.haySinResolver === c.esperado.haySinResolver]);
  if (c.esperado.mensaje1Empieza !== undefined) checks.push(['mensaje1', r.mensaje1 === c.esperado.mensaje1Empieza]);

  for (const [campo, ok] of checks) {
    if (!ok) { fallas++; console.log(`  FALLA en ${campo}`); }
  }
}

console.log('\n===', fallas === 0 ? 'TODO OK' : `${fallas} FALLAS`, '===');
process.exit(fallas === 0 ? 0 : 1);
