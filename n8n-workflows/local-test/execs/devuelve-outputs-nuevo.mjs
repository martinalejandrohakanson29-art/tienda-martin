export const JS_CODE = `// n8n Code node (JavaScript)
// Espera: item.json.output (string)
// Devuelve multiples items: cada uno con { text: "..." }
// Si el modelo devuelve vacio, no tira [] (eso deja todo en silencio mas
// adelante sin error ni aviso): manda un item con vacio:true para poder
// escalar al equipo en vez de perder el mensaje.

// Si el mensaje del cliente es solo un acuse de recibo (emoji, "ok", "dale",
// "gracias", etc.) no hace falta contestar nada: se corta con [] (silencio
// limpio, sin pasar por AI Agent2 ni por la escalada de "respuesta vacia" -
// eso es para fallos inesperados, esto es a proposito).
function esSoloAcuseDeRecibo(texto) {
  if (!texto) return false;
  const sinEmojis = texto.replace(/[\\p{Extended_Pictographic}\\p{Emoji_Modifier}\\u200d\\ufe0f\\u2600-\\u27BF]/gu, "").trim();
  if (sinEmojis === "") return true;
  const normalizado = sinEmojis.toLowerCase().replace(/[¡!¿?.,]/g, "").trim();
  const acuses = ["ok","okay","oka","dale","joya","genial","perfecto","gracias","muchas gracias","buenisimo","buenísimo","excelente","de acuerdo","listo","bien","10-4","entendido","recibido","buenardo","barbaro","bárbaro"];
  return acuses.includes(normalizado);
}
let textoCliente = "";
try { textoCliente = ($('datos_finales2').item.json.texto || "").toString(); } catch (e) {}
if (esSoloAcuseDeRecibo(textoCliente)) {
  return [];
}

let inputText = ($('AI Agent2').first().json.output ?? "").toString();
inputText = inputText
  .replace(/\\\\n|\\\\r/g, " ")
  .replace(/\\n|\\r/g, " ")
  .replace(/\\\\"/g, "")
  .replace(/¿/g, "")
  .replace(/\\s+/g, " ")
  .trim();
if (!inputText) return [{ json: { vacio: true, text: "" } }];
const DOT_TOKEN = "__DOT__";
let protectedText = inputText.replace(/(\\d)\\.(\\d)/g, \`$1\${DOT_TOKEN}$2\`);
// Abreviaturas frecuentes: sin esto "Av. 9 de Julio" se parte en dos mensajes.
protectedText = protectedText.replace(
  /\\b(av|avda|sr|sra|dr|dra|ing|lic|depto|dpto|tel|aprox|ej|etc|nro|hs|uds|km|cm|mm)\\.(?=\\s|$)/gi,
  \`$1\${DOT_TOKEN}\`
);
const rawParts = protectedText
  .split(".")
  .map(s => s.trim())
  .filter(Boolean);
let parts = rawParts.map(s => {
  // Primero se sacan los puntos sueltos y RECIEN despues se restauran los
  // protegidos: al reves se borraban tambien los decimales y las abreviaturas.
  let restored = s.replace(/\\./g, "");
  restored = restored.replaceAll(DOT_TOKEN, ".");
  restored = restored.replace(/\\s+/g, " ").trim();
  return restored;
}).filter(Boolean);

// Si esta consulta tiene una parte derivada al equipo (hay_pendientes), nunca
// hay que decirle al cliente que nos falta el dato: el prompt ya le pide al
// modelo omitirlo, pero como red de seguridad filtramos cualquier frase que
// igual lo mencione (ej "no lo tengo a mano").
let hayPendientes = false;
try { hayPendientes = !!$('Consolidar Resultados (Multi)').item.json.hay_pendientes; } catch (e) {}
if (hayPendientes) {
  const patronFaltante = /\\bno\\s+(lo\\s+|los\\s+|la\\s+|las\\s+)?tengo(\\s+a\\s+mano)?\\b|\\bno\\s+tenemos\\s+ese\\s+dato\\b|\\bno\\s+cuento\\s+con\\s+(ese\\s+)?dato\\b|\\bno\\s+tengo\\s+esa\\s+informaci[oó]n\\b|\\bno\\s+encuentro\\s+ese\\s+dato\\b/i;
  parts = parts.filter(p => !patronFaltante.test(p));
}

if (parts.length === 0) return [{ json: { vacio: true, text: "" } }];
return parts.map(p => ({
  json: { vacio: false, text: p }
}));
`;
