// Fix doble: encontrado revisando la charla real con +5493812408182 (contacto/conv 1983,
// 2026-08-14): escribio la plantilla exacta del Kit 8 y 0 segundos despues "Que precio esta ?"
// en la misma rafaga. El bot mando DOS mensajes de precio: el saludo del kit (que ya trae el
// precio corto, $175.000) y una respuesta de precio aparte ("El recorrido corto esta $175.000 y
// el largo $189.000."). Redundante y confuso -- ademas, por una carrera entre las dos ramas
// paralelas que se disparan al confirmar el kit, la respuesta de precio (sin ningun kit
// mencionado) llego ANTES que el saludo con el nombre del kit, asi que parecia que el bot
// contestaba sobre otra cosa.
//
// Fix acordado con Martin en 3 partes:
// 1. (ya aplicado directo en la base, sin este script) mensaje_bienvenida del Kit 8 reescrito
//    para mencionar los DOS precios (antes solo tenia el corto) -- asi el saludo ya contesta
//    "cuanto sale" completo, sin dejar afuera la opcion larga.
// 2. Con el punto 1 aplicado, TODOS los kits activos ya traen el precio completo en su saludo,
//    asi que la pregunta de precio pegada a la plantilla que recien confirma el kit es siempre
//    redundante -- "Preparar Contexto Sub-preguntas" ahora expone `kit_recien_confirmado`
//    (detecta si "Marcar Kit Pineado" corrio en esta misma ejecucion, mismo patron try/catch que
//    ya se usaba para kit_id) y "Parsear Sub-preguntas" descarta silenciosamente cualquier parte
//    categoria "precio" cuando el kit se acaba de confirmar (no se manda nada aparte, no se
//    escala -- ya esta contestado por el saludo que se manda en la misma rafaga).
// 3. Reordenado el envio: "Enviar Saludo Kit" ahora es un paso obligatorio ANTES de que arranque
//    "Marcar Kit Pineado" (y por lo tanto todo el pipeline de sub-preguntas que cuelga de ahi),
//    en vez de dispararse en paralelo. Asi el cliente siempre ve primero de que kit se esta
//    hablando, y recien despues cualquier otra respuesta (envio/negocio/otro) que haya quedado
//    en la rafaga.
//
// Gotcha encontrado aplicando el punto 3 (ver seccion de gotchas en CHATWOOT-BOT-CONTEXTO.md):
// insertar "Enviar Saludo Kit" en el medio de la cadena rompio en silencio a "Marcar Kit
// Pineado", que leia `$json.kit_id`/`$json.kit_nombre` asumiendo que su entrada directa era la
// clasificacion del kit -- con el reordenamiento, `$json` paso a ser la respuesta HTTP de
// Chatwoot, asi que pineaba un kit vacio (`{}`) sin tirar ningun error visible. Se corrigio
// apuntando explicito al nodo de origen (`$('Clasificar Mensaje (sin IA)').item.json.kit_id`)
// en vez del atajo `$json` -- parte 4 de este script.
//
// Aplicado sobre "Respuestas chatwoot 2.0" (s7EpPTjNFy6iCclg).
import { writeFileSync } from "fs";

const API_URL = "https://n8n.revolucionmotos.tech/api/v1";
const WORKFLOW_ID = "s7EpPTjNFy6iCclg";
const API_KEY = process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.APIKEY_N8N;
if (!API_KEY) throw new Error("Falta API_KEY_N8N (o N8N_KEY / APIKEY_N8N) en el entorno");

const BACKUP_PATH = new URL("./workflow_backup_pre-fix-precio-redundante-y-orden_2026-08-14.json", import.meta.url);

async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    console.error("ERROR", res.status, JSON.stringify(body, null, 2));
    throw new Error(`API ${path} devolvio ${res.status}`);
  }
  return body;
}

const OLD_CONTEXTO_CODE = "let kitId = null, kitNombre = null;\ntry {\n  const k = $('Parsear Kit Pineado').item.json;\n  if (k && k.kit_id) { kitId = k.kit_id; kitNombre = k.kit_nombre || null; }\n} catch (e) {}\n\nlet textoParaDividir = null;\ntry {\n  const c = $('Parsear Pregunta Compatibilidad').item.json;\n  if (c && typeof c.resto_mensaje === 'string') textoParaDividir = c.resto_mensaje;\n} catch (e) {}\nif (textoParaDividir === null) {\n  textoParaDividir = $('Clasificar Mensaje (sin IA)').item.json.resto_mensaje || $('Unir Mensajes').item.json.texto_completo;\n}\n\nreturn [{ json: { kit_id: kitId, kit_nombre: kitNombre, texto_para_dividir: textoParaDividir } }];\n";

const NEW_CONTEXTO_CODE = "let kitId = null, kitNombre = null;\ntry {\n  const k = $('Parsear Kit Pineado').item.json;\n  if (k && k.kit_id) { kitId = k.kit_id; kitNombre = k.kit_nombre || null; }\n} catch (e) {}\n\nlet kitRecienConfirmado = false;\ntry {\n  $('Marcar Kit Pineado').item;\n  kitRecienConfirmado = true;\n} catch (e) {}\n\nlet textoParaDividir = null;\ntry {\n  const c = $('Parsear Pregunta Compatibilidad').item.json;\n  if (c && typeof c.resto_mensaje === 'string') textoParaDividir = c.resto_mensaje;\n} catch (e) {}\nif (textoParaDividir === null) {\n  textoParaDividir = $('Clasificar Mensaje (sin IA)').item.json.resto_mensaje || $('Unir Mensajes').item.json.texto_completo;\n}\n\nreturn [{ json: { kit_id: kitId, kit_nombre: kitNombre, texto_para_dividir: textoParaDividir, kit_recien_confirmado: kitRecienConfirmado } }];\n";

const OLD_PARSEAR_SUB_CODE = "let partes = [];\ntry {\n  const raw = ($json.output || '{}').toString().trim();\n  const clean = raw.replace(/```json|```/g, '').trim();\n  const parsed = JSON.parse(clean);\n  if (Array.isArray(parsed.partes)) partes = parsed.partes;\n} catch (e) {}\n\nconst categoriasValidas = ['precio', 'envio', 'negocio', 'otro'];\nconst kitId = $('Preparar Contexto Sub-preguntas').item.json.kit_id;\nconst kitNombre = $('Preparar Contexto Sub-preguntas').item.json.kit_nombre;\nconst escapar = (s) => (s || '').toString().replace(/'/g, \"''\");\n\nconst limpio = partes\n  .map((p) => {\n    let categoria = categoriasValidas.includes(p && p.categoria) ? p.categoria : 'otro';\n    if (categoria === 'precio' && !kitId) categoria = 'otro';\n    return { texto: ((p && p.texto) || '').toString().trim(), categoria };\n  })\n  .filter((p) => p.texto.length > 0)\n  .map((p) => ({ ...p, texto_sql: escapar(p.texto), kit_id: kitId, kit_nombre: kitNombre }));\n\nreturn [{ json: { partes: limpio } }];\n";

const NEW_PARSEAR_SUB_CODE = "let partes = [];\ntry {\n  const raw = ($json.output || '{}').toString().trim();\n  const clean = raw.replace(/```json|```/g, '').trim();\n  const parsed = JSON.parse(clean);\n  if (Array.isArray(parsed.partes)) partes = parsed.partes;\n} catch (e) {}\n\nconst categoriasValidas = ['precio', 'envio', 'negocio', 'otro'];\nconst kitId = $('Preparar Contexto Sub-preguntas').item.json.kit_id;\nconst kitNombre = $('Preparar Contexto Sub-preguntas').item.json.kit_nombre;\nconst kitRecienConfirmado = $('Preparar Contexto Sub-preguntas').item.json.kit_recien_confirmado === true;\nconst escapar = (s) => (s || '').toString().replace(/'/g, \"''\");\n\nconst limpio = partes\n  .map((p) => {\n    let categoria = categoriasValidas.includes(p && p.categoria) ? p.categoria : 'otro';\n    if (categoria === 'precio' && !kitId) categoria = 'otro';\n    return { texto: ((p && p.texto) || '').toString().trim(), categoria };\n  })\n  .filter((p) => p.texto.length > 0)\n  .filter((p) => !(p.categoria === 'precio' && kitRecienConfirmado))\n  .map((p) => ({ ...p, texto_sql: escapar(p.texto), kit_id: kitId, kit_nombre: kitNombre }));\n\nreturn [{ json: { partes: limpio } }];\n";

const OLD_MARCAR_PINEADO_VALUE = "={{ JSON.stringify({ kit_id: $json.kit_id, kit_nombre: $json.kit_nombre }) }}";
const NEW_MARCAR_PINEADO_VALUE = "={{ JSON.stringify({ kit_id: $('Clasificar Mensaje (sin IA)').item.json.kit_id, kit_nombre: $('Clasificar Mensaje (sin IA)').item.json.kit_nombre }) }}";

async function main() {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 0));
  console.log("Backup fresco guardado. Nodos actuales:", wf.nodes.length);

  const nodeByName = (name) => {
    const n = wf.nodes.find((x) => x.name === name);
    if (!n) throw new Error(`No se encontro el nodo "${name}"`);
    return n;
  };

  const contexto = nodeByName("Preparar Contexto Sub-preguntas");
  if (contexto.parameters.jsCode !== OLD_CONTEXTO_CODE) {
    throw new Error('El jsCode de "Preparar Contexto Sub-preguntas" no es el esperado -- revisar a mano.');
  }
  contexto.parameters.jsCode = NEW_CONTEXTO_CODE;

  const parsearSub = nodeByName("Parsear Sub-preguntas");
  if (parsearSub.parameters.jsCode !== OLD_PARSEAR_SUB_CODE) {
    throw new Error('El jsCode de "Parsear Sub-preguntas" no es el esperado -- revisar a mano.');
  }
  parsearSub.parameters.jsCode = NEW_PARSEAR_SUB_CODE;

  // Reordenar: "Enviar Saludo Kit" pasa a ser paso obligatorio antes de "Marcar Kit Pineado",
  // en vez de disparar los dos en paralelo desde el nodo anterior.
  const hayResto = wf.connections["¿Hay Resto en la Rafaga?"];
  if (!hayResto) throw new Error('No se encontro la conexion de "¿Hay Resto en la Rafaga?"');
  const falseBranch = hayResto.main?.[1] || [];
  const falseTargets = falseBranch.map((c) => c.node).sort();
  if (JSON.stringify(falseTargets) !== JSON.stringify(["Enviar Saludo Kit", "Marcar Kit Pineado"].sort())) {
    throw new Error('La rama false de "¿Hay Resto en la Rafaga?" no tiene la forma esperada -- puede que ya se haya tocado. Revisar a mano.');
  }
  hayResto.main[1] = [{ node: "Enviar Saludo Kit", type: "main", index: 0 }];

  const esMismoTema = wf.connections["¿Es Mismo Tema?"];
  if (!esMismoTema) throw new Error('No se encontro la conexion de "¿Es Mismo Tema?"');
  const trueBranch = esMismoTema.main?.[0] || [];
  const trueTargets = trueBranch.map((c) => c.node).sort();
  if (JSON.stringify(trueTargets) !== JSON.stringify(["Enviar Saludo Kit", "Marcar Kit Pineado"].sort())) {
    throw new Error('La rama true de "¿Es Mismo Tema?" no tiene la forma esperada -- puede que ya se haya tocado. Revisar a mano.');
  }
  esMismoTema.main[0] = [{ node: "Enviar Saludo Kit", type: "main", index: 0 }];

  const enviarSaludo = wf.connections["Enviar Saludo Kit"];
  if (!enviarSaludo) throw new Error('No se encontro la conexion de "Enviar Saludo Kit"');
  const saludoTargets = (enviarSaludo.main?.[0] || []).map((c) => c.node);
  if (JSON.stringify(saludoTargets) !== JSON.stringify(["Fin - Saludo Kit Enviado"])) {
    throw new Error('"Enviar Saludo Kit" no conecta solo a "Fin - Saludo Kit Enviado" como se esperaba -- puede que ya se haya tocado. Revisar a mano.');
  }
  enviarSaludo.main[0] = [
    { node: "Fin - Saludo Kit Enviado", type: "main", index: 0 },
    { node: "Marcar Kit Pineado", type: "main", index: 0 },
  ];

  // Parte 4: "Marcar Kit Pineado" ahora recibe su entrada de "Enviar Saludo Kit" (HTTP Request) en
  // vez de directo del nodo de clasificacion -- el atajo `$json` ya no apunta a los datos del kit,
  // asi que hay que apuntar explicito al nodo de origen.
  const marcarPineado = nodeByName("Marcar Kit Pineado");
  if (marcarPineado.parameters.value !== OLD_MARCAR_PINEADO_VALUE) {
    throw new Error('El value de "Marcar Kit Pineado" no es el esperado -- revisar a mano.');
  }
  marcarPineado.parameters.value = NEW_MARCAR_PINEADO_VALUE;

  const allowedSettingsKeys = [
    "saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
    "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder",
  ];
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => allowedSettingsKeys.includes(k)));

  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: "PUT", body: JSON.stringify(body) });
  console.log("Actualizado. Nodos ahora:", updated.nodes.length, "| activo:", updated.active);

  const fresh = await api(`/workflows/${WORKFLOW_ID}`);
  const checks = [
    ["Preparar Contexto Sub-preguntas", (n) => n.parameters.jsCode === NEW_CONTEXTO_CODE],
    ["Parsear Sub-preguntas", (n) => n.parameters.jsCode === NEW_PARSEAR_SUB_CODE],
    ["Marcar Kit Pineado", (n) => n.parameters.value === NEW_MARCAR_PINEADO_VALUE],
  ];
  let ok = true;
  for (const [name, check] of checks) {
    const n = fresh.nodes.find((x) => x.name === name);
    const nodeOk = !!n && check(n);
    console.log(`Verificacion "${name}":`, nodeOk ? "OK" : "ALGO NO CUADRA");
    ok = ok && nodeOk;
  }
  const rewireOk1 = JSON.stringify((fresh.connections["¿Hay Resto en la Rafaga?"].main[1] || []).map((c) => c.node)) === JSON.stringify(["Enviar Saludo Kit"]);
  const rewireOk2 = JSON.stringify((fresh.connections["¿Es Mismo Tema?"].main[0] || []).map((c) => c.node)) === JSON.stringify(["Enviar Saludo Kit"]);
  const rewireOk3 = JSON.stringify((fresh.connections["Enviar Saludo Kit"].main[0] || []).map((c) => c.node).sort()) === JSON.stringify(["Fin - Saludo Kit Enviado", "Marcar Kit Pineado"].sort());
  console.log("Rewire orden (Hay Resto false -> solo Saludo):", rewireOk1 ? "OK" : "ALGO NO CUADRA");
  console.log("Rewire orden (Es Mismo Tema true -> solo Saludo):", rewireOk2 ? "OK" : "ALGO NO CUADRA");
  console.log("Rewire orden (Saludo -> Fin + Marcar Pineado):", rewireOk3 ? "OK" : "ALGO NO CUADRA");
  console.log((ok && rewireOk1 && rewireOk2 && rewireOk3) ? "Fix aplicado correctamente." : "REVISAR A MANO.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
