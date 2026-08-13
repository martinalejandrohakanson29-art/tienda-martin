const piezas = $json.piezas || [];
const prioridad = { precio: 0, envio: 1, negocio: 2, otro: 3 };

const resueltas = piezas.filter((p) => p.resuelto && p.mensaje)
  .sort((a, b) => (prioridad[a.categoria] ?? 9) - (prioridad[b.categoria] ?? 9));
const noResueltas = piezas.filter((p) => !p.resuelto || !p.mensaje);

let mensaje1 = null, mensaje2 = null;
if (resueltas.length === 1) {
  mensaje1 = resueltas[0].mensaje;
} else if (resueltas.length >= 2) {
  mensaje1 = resueltas[0].mensaje;
  mensaje2 = resueltas.slice(1).map((p) => p.mensaje).join('\n\n');
}

const piezasSinResolver = noResueltas.map((p) => p.texto).filter(Boolean).join('; ');
const escapar = (s) => (s || '').toString().replace(/'/g, "''");

return [{ json: {
  hayMensajes: !!mensaje1,
  mensaje1: mensaje1 || '',
  mensaje2: mensaje2 || '',
  hayMensaje2: !!mensaje2,
  haySinResolver: noResueltas.length > 0,
  piezas_sin_resolver_sql: escapar(piezasSinResolver),
} }];
