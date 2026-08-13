// Clasificacion sin IA, en orden de confianza:
//  1) plantilla exacta: el mensaje del cliente coincide letra por letra
//     (normalizado) con una linea del campo "Plantillas exactas de
//     Instagram/Meta Ads" del kit -> kit. NO se usa "keywords" para matchear
//     (2026-08-12: probado y descartado, ver nota abajo).
//  2) si no matcheo ningun kit pero el mensaje es un saludo sin pedido
//     especifico (ej. "Hola", "Hola buenas tarde", "quiero mas info") -> saludo
//  3) cualquier otra cosa -> sin_match (todavia sin manejar)
//
// Por que no keywords: la cobertura de keywords (ej. alias "kit 120" de
// 2 palabras sueltas) matcheaba mensajes que solo tenian esas palabras
// dispersas en el texto sin relacion real, ej. una consulta de precio de
// piezas sueltas ("...consulto que sale el kit de 120 tapa de cilindro
// cdi...") disparaba el saludo del combo como si fuera la respuesta
// correcta. Se probo agregar una guarda por palabras de precio y no alcanzo
// — el usuario pidio sacar "keywords" del matching por completo y dejar
// SOLO la plantilla exacta, que no tiene ambiguedad posible porque es
// texto literal.
const kits = $('Buscar Kits Activos').item.json.kits || [];
const mensaje = ($('Unir Mensajes').item.json.texto_completo || '').toString();

const STOPWORDS = new Set([
  'para','con','del','las','los','una','uno','que','por','sus','esa','ese','esta','este','hay',
  'mas','tiene','tienen','quiero','necesito','busco','tengo','como','cual','cuanto',
  // saludo / relleno (para que "Hola, queria mas info" quede sin tokens de contenido)
  'hola','holis','buenas','buenos','buen','dias','dia','tardes','tarde','noches','noche','tal',
  'hey','alo','informacion','info','ayuda','favor','porfa','porfavor','consultar','saber','onda',
  'todo','bien','gracias','disculpa','disculpe','perdon',
]);

const normalizar = (s) => s.toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

function tokens(txt) {
  const plano = normalizar(txt).replace(/[^a-z0-9]+/g, ' ');
  const vistos = new Set();
  for (const t of plano.split(' ')) {
    if (t.length < 3 || STOPWORDS.has(t)) continue;
    vistos.add(t.replace(/s$/, ''));
  }
  return [...vistos];
}

const mensajeNorm = normalizar(mensaje);
const mensajeTokens = tokens(mensaje);

function salidaKit(tipo, kit) {
  return [{ json: { tipo: 'kit', deteccion: tipo, kit_id: kit.id, kit_nombre: kit.nombre, mensaje_bienvenida: kit.mensaje_bienvenida, foto_url: kit.foto_url || null } }];
}

// 1) Plantilla exacta
for (const kit of kits) {
  const plantillas = (kit.plantillas_bienvenida || '').split('\n').map(normalizar).filter(Boolean);
  if (plantillas.includes(mensajeNorm)) return salidaKit('plantilla_exacta', kit);
}

// 2) Saludo sin pedido especifico: tiene alguna palabra de saludo Y no le
// quedan palabras de contenido despues de sacar saludo/relleno.
const GREETING_WORDS = ['hola', 'holis', 'buenas', 'buenos', 'que tal', 'hey', 'alo'];
const tieneSaludo = GREETING_WORDS.some((w) => mensajeNorm.includes(w));
if (tieneSaludo && mensajeTokens.length === 0) {
  return [{ json: { tipo: 'saludo' } }];
}

// 3) Sin match
return [{ json: { tipo: 'sin_match' } }];
