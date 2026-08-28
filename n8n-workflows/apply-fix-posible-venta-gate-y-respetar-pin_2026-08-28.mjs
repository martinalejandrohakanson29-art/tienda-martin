import fs from 'fs'
const env = Object.fromEntries(fs.readFileSync('C:/Users/marti/Desktop/Martin/proyectos/tienda-martin/.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'').replace(/\r$/,'')]}))
const NK = env.API_KEY_N8N
const API = 'https://n8n.revolucionmotos.tech/api/v1'
const h = { 'X-N8N-API-KEY': NK, 'Content-Type': 'application/json' }

const wf = await fetch(`${API}/workflows/s7EpPTjNFy6iCclg`, { headers: h }).then(r => r.json())
const dry = process.argv[2] !== 'go'

const N = (name) => wf.nodes.find(n => n.name === name)
if (wf.nodes.some(n => ['¿Sospecha de Compra?','LLM - Validar Interes Compra','Validar Interes de Compra (IA)','Parsear Validacion Interes','Respetar Kit Pineado (Identificacion)'].includes(n.name))) {
  console.log('ABORT: algun nodo nuevo ya existe'); process.exit(1)
}

// ---------- FIX 1: gate de IA para intencion de compra ----------
const credOpenAi = N('GPT Model - Extraer Modelo (Kit Confiado)').credentials

wf.nodes.push({
  parameters: {
    conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{ id: 'a1b2c3d4-0001-0001-0001-000000000001', leftValue: '={{ $json.interes_compra }}', rightValue: true, operator: { type: 'boolean', operation: 'equals' } }],
      combinator: 'and' },
    options: {}
  },
  type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [5544, 1120],
  id: 'aaaa1111-0001-4001-8001-000000000001', name: '¿Sospecha de Compra?'
})

wf.nodes.push({
  parameters: { model: { __rl: true, mode: 'id', value: 'gpt-5.6-luna' }, responsesApiEnabled: false, options: { timeout: 25000, maxRetries: 2 } },
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', typeVersion: 1.3, position: [5760, 1320],
  id: 'aaaa1111-0002-4002-8002-000000000002', name: 'LLM - Validar Interes Compra',
  credentials: credOpenAi
})

wf.nodes.push({
  parameters: {
    promptType: 'define',
    text: '=Mensaje del cliente:\n{{ $(\'Detectar Interes de Compra\').item.json.interes_compra_texto_original }}\n\nFrase que se detecto: "{{ $(\'Detectar Interes de Compra\').item.json.interes_compra_frase }}"',
    options: {
      systemMessage: [
        'El cliente ya tiene un kit/combo elegido en esta conversacion (ya se le mando la bienvenida con precio). En su mensaje se detecto una frase que PODRIA indicar que quiere comprar, pagar, senar, reservar o retirar.',
        '',
        'Tu unico trabajo es decidir si esa intencion de compra es REAL y ACTUAL, o si en realidad es una pregunta hipotetica, condicional o de informacion sobre COMO seria la compra/pago/envio.',
        '',
        'Son intencion REAL (intencion_real = true):',
        '- "listo, lo compro"',
        '- "lo quiero, como te pago"',
        '- "te hago la transferencia ahora"',
        '- "me lo llevo, pasame el cbu"',
        '- "quiero reservar uno"',
        '',
        'NO son intencion real (intencion_real = false):',
        '- "de que parte me lo mandarian al cilindro si lo compro" (pregunta de envio, condicional)',
        '- "cuando lo pague en cuantos dias me llega" (pregunta de plazos)',
        '- "como seria si quiero comprarlo" (pide info del proceso)',
        '- "y si lo reservo me lo guardan" (hipotetico)',
        '- "lo pago cuando llega a mi domicilio?" (pregunta sobre la forma de pago)',
        '',
        'Regla ante la duda: si el mensaje del cliente es sobre todo una PREGUNTA (aunque use las palabras comprar/pagar/reservar), responde false. Solo responde true si el cliente esta afirmando una decision, no preguntando por ella.',
        '',
        'Responde UNICAMENTE con un JSON valido, sin texto adicional, con este formato exacto:',
        '{"intencion_real": true | false}'
      ].join('\n')
    }
  },
  type: '@n8n/n8n-nodes-langchain.agent', typeVersion: 2, position: [5760, 1120],
  id: 'aaaa1111-0003-4003-8003-000000000003', name: 'Validar Interes de Compra (IA)',
  retryOnFail: true, maxTries: 2, waitBetweenTries: 1500
})

wf.nodes.push({
  parameters: {
    jsCode: [
      "// Gate de IA para intencion de compra (fix 2026-08-28, conv 2385 / +5493735466916).",
      "// La lista de frases de \"Detectar Interes de Compra\" solo dispara la sospecha; este",
      "// paso confirma con IA acotada si es una decision real o una pregunta condicional",
      "// (\"...si lo compro\", \"lo pago cuando llega?\"). Fallback conservador: si la IA falla,",
      "// se respeta el match de palabra clave (se pausa igual -- un falso positivo se",
      "// arregla con /bot on, una venta perdida no).",
      "let intencionReal = true;",
      "try {",
      "  const raw = ($json.output || '{}').toString().replace(/```json|```/g, '').trim();",
      "  const parsed = JSON.parse(raw);",
      "  if (typeof parsed.intencion_real === 'boolean') intencionReal = parsed.intencion_real;",
      "} catch (e) {}",
      "",
      "const base = $('Detectar Interes de Compra').first().json;",
      "return [{ json: { ...base, interes_compra: intencionReal } }];"
    ].join('\n')
  },
  type: 'n8n-nodes-base.code', typeVersion: 2, position: [5980, 1120],
  id: 'aaaa1111-0004-4004-8004-000000000004', name: 'Parsear Validacion Interes'
})

// ---------- FIX 2: respetar kit pineado en Identificar Necesidad ----------
wf.nodes.push({
  parameters: {
    jsCode: [
      "// Si YA hay un pack simple pineado (no un grupo en resolucion) y la IA de",
      "// \"Identificar Necesidad\" intento pinear OTRO kit / re-saludar / repreguntar",
      "// candidatos, lo ignoramos y forzamos 'ninguno' -> el mensaje lo maneja el",
      "// partidor de sub-preguntas con el kit pineado como contexto, sin pisar el pin",
      "// ni mandar una bienvenida que nadie pidio.",
      "// (fix 2026-08-28, conv 2385: \"Y lo pago cuando llega?\" con Kit 170 pineado",
      "//  disparaba la bienvenida del Combo Escape+Leva). Misma logica de deteccion",
      "//  de 'mismo kit / mismo grupo' que \"Chequear Kit Ya Resuelto\".",
      "const parsed = $json;",
      "let pinKitId = null, pinEsGrupo = null;",
      "try {",
      "  const pin = $('Parsear Kit Pineado').item.json;",
      "  pinKitId = pin.kit_id; pinEsGrupo = pin.es_grupo;",
      "} catch (e) {}",
      "",
      "if (pinEsGrupo === false && pinKitId) {",
      "  const identificadoId = parsed.kit_id;",
      "  let mismoKit = identificadoId === pinKitId;",
      "  if (!mismoKit && identificadoId) {",
      "    const grupos = ($('Buscar Kits Activos').item.json.grupos) || [];",
      "    const grupoDelPin = grupos.find((g) => (g.variantes || []).some((v) => v.id === pinKitId));",
      "    if (grupoDelPin && grupoDelPin.id === identificadoId) mismoKit = true;",
      "  }",
      "  if (!mismoKit) {",
      "    return [{ json: { tipo: 'ninguno', kit_id: null, kit_nombre: '', candidatos: [], mensaje: '' } }];",
      "  }",
      "}",
      "return [{ json: parsed }];"
    ].join('\n')
  },
  type: 'n8n-nodes-base.code', typeVersion: 2, position: [5704, 960],
  id: 'aaaa1111-0005-4005-8005-000000000005', name: 'Respetar Kit Pineado (Identificacion)'
})

// ---------- CONEXIONES ----------
const C = wf.connections
// fix 1
C['Detectar Interes de Compra'].main[0] = [{ node: '¿Sospecha de Compra?', type: 'main', index: 0 }]
C['¿Sospecha de Compra?'] = { main: [
  [{ node: 'Validar Interes de Compra (IA)', type: 'main', index: 0 }],
  [{ node: '¿Detecto Interes de Compra?', type: 'main', index: 0 }]
] }
C['Validar Interes de Compra (IA)'] = { main: [[{ node: 'Parsear Validacion Interes', type: 'main', index: 0 }]] }
C['Parsear Validacion Interes'] = { main: [[{ node: '¿Detecto Interes de Compra?', type: 'main', index: 0 }]] }
C['LLM - Validar Interes Compra'] = { ai_languageModel: [[{ node: 'Validar Interes de Compra (IA)', type: 'ai_languageModel', index: 0 }]] }
// fix 2
C['Parsear Identificar Necesidad'].main[0] = [{ node: 'Respetar Kit Pineado (Identificacion)', type: 'main', index: 0 }]
C['Respetar Kit Pineado (Identificacion)'] = { main: [[{ node: '¿Qué Identificó?', type: 'main', index: 0 }]] }

// ---------- reachability BFS desde Webhook1 ----------
const adj = {}
for (const [src, outs] of Object.entries(C)) {
  adj[src] = adj[src] || []
  for (const branches of Object.values(outs)) for (const b of branches) for (const c of (b||[])) adj[src].push(c.node)
}
const seen = new Set(['Webhook1']); const q = ['Webhook1']
while (q.length) { const cur = q.shift(); for (const nx of (adj[cur]||[])) if (!seen.has(nx)) { seen.add(nx); q.push(nx) } }
const nuevos = ['¿Sospecha de Compra?','LLM - Validar Interes Compra','Validar Interes de Compra (IA)','Parsear Validacion Interes','Respetar Kit Pineado (Identificacion)']
console.log('nodos nuevos alcanzables desde Webhook1:', nuevos.map(n => `${n}=${seen.has(n)}`).join(', '))
const huerfanos = wf.nodes.filter(n => !seen.has(n.name) && !['Manual Trigger - Flush Pines','Listar Pines Kit','Separar Claves','Borrar Pin'].some(x=>n.name.includes(x))).map(n=>n.name)
console.log('total nodos:', wf.nodes.length)

if (dry) { console.log('\n--- DRY RUN (pasar "go" para aplicar) ---'); process.exit(0) }

const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings }
const res = await fetch(`${API}/workflows/s7EpPTjNFy6iCclg`, { method: 'PUT', headers: h, body: JSON.stringify(body) })
console.log('PUT', res.status)
const after = await fetch(`${API}/workflows/s7EpPTjNFy6iCclg`, { headers: h }).then(r => r.json())
console.log('despues -> active:', after.active, 'nodos:', after.nodes.length)
