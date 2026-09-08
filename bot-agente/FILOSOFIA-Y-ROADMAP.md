# Bot Agente de WhatsApp — Filosofía, Arquitectura y Roadmap

Este documento es la **constitución técnica y operativa** del nuevo Agente de WhatsApp para **Revolución Motos**.
Define las reglas intocables, el modelo mental de diseño, la separación de responsabilidades y la guía paso a paso para su desarrollo y evolución.

---

## 1. Por qué existe este Agente (El problema de raíz)

El bot de WhatsApp original (`workflow_mateo`, 257 nodos en n8n) y su sucesor ("Respuestas chatwoot 2.0", 450+ nodos en n8n) demostraron un problema estructural:
* Intentar resolver el **lenguaje natural humano** mediante grafos de nodos deterministas (`If`, `Switch`, `Code`, variables de Redis) genera una **explosión combinatoria**.
* Cada cliente formula sus preguntas de manera diferente (*"cuanto sale?"*, *"junto plata y te aviso"*, *"es para carrera corta y soy de Salta, tenés stock?"*).
* Tapar cada nuevo caso con más nodos o parsers termina rompiendo ramas anteriores (*"carrera contra los errores"*).

Por el otro lado, dejar a una IA "libre" con un prompt gigante de 5.000 palabras o un RAG descontrolado genera **alucinaciones**:
* Inventa compatibilidades mecánicas erróneas (peligroso en repuestos).
* Inventa precios viejos o stock inexistente.
* Se toma atribuciones que no le corresponden.

### La solución: Agente con Herramientas (Tool Calling) en Código
Un punto medio moderno, robusto y limpio:
1. **La IA es el cerebro de entendimiento y redacción.**
2. **El código y la Base de Datos son los dueños exclusivos de la verdad y los números.**
3. **Las Herramientas (Tools) son el puente entre ambos.**

---

## 2. Las 5 Reglas de Oro (Intocables)

1. **La IA es el Mozo, la Base de Datos es la Cocina:**
   * El mozo atiende al cliente con amabilidad, entiende lo que pide y le lleva la comanda a la cocina.
   * El mozo **NO cocina**. La IA nunca calcula precios, nunca asume stock y nunca inventa compatibilidades mecánicas por su cuenta.
   * Si una herramienta no devuelve el dato, la IA no tiene permitido afirmarlo.

2. **Silencio absoluto ante la duda (Cero alucinación):**
   * Si la consulta es técnica y no está en la base de datos, o si es un reclamo, problema de envío o situación compleja, la IA **no inventa excusas ni dice "esperame que pregunto"**.
   * Ejecuta inmediatamente la herramienta `escalar_a_humano()`, genera la nota privada en Chatwoot para el equipo y **se queda en silencio cara al cliente**.

3. **Voz de Revolución Motos:**
   * Habla en primera persona singular o plural como vendedor/dueño del negocio en mostrador ("tenemos", "somos de Córdoba", "te comento").
   * Tono amigable, de confianza, claro y conciso (estilo cordobés respetuoso).
   * **Sin signos de apertura `¿` en las preguntas:** Solo signo de cierre `?` (ej: *"Decime qué modelo de moto tenés?"*).
   * **Nunca revelar que es una IA** ni hablar en tercera persona impersonal.

4. **Cero riesgo para Producción** (regla original — superada a partir de Fase 6 con OK explícito de Martín, 07/09):
   * Hasta Fase 5 el workflow de n8n siguió en producción sin interrupciones y el agente solo tocó conversaciones del piloto.
   * En Fase 6 se hace el pasaje: bot-agente responde TODAS las conversaciones y n8n se apaga. Plan B siempre disponible (`activar-bot-agente-global.ts --off` + reactivar n8n).
   * El simulador (`/admin/chatwoot/simulador`) y el banco de pruebas siguen siendo el entorno de prueba.

5. **Simplicidad y Modularidad:**
   * Código TypeScript limpio, tipado y autocontenido.
   * Cada herramienta tiene un solo propósito y no supera las ~50 líneas.
   * Nada de archivos monolíticos inmanejables.

---

## 3. Arquitectura del Agente

```
                                  ┌────────────────────────┐
                                  │   WhatsApp / Cliente   │
                                  └───────────┬────────────┘
                                              │ Mensaje
                                              ▼
                                  ┌────────────────────────┐
                                  │   Chatwoot / Webhook   │
                                  └───────────┬────────────┘
                                              │
                                              ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Tu App Web: /api/bot (Motor del Agente)                                                │
│                                                                                        │
│   1. Contexto & Historial ──► LLM (OpenAI / Anthropic / DeepSeek)                      │
│                                 │                                                      │
│                                 │ [Pide ejecutar herramienta en JSON]                  │
│                                 ▼                                                      │
│   2. Ejecución de Herramienta:                                                         │
│      ├── consultar_compatibilidad(moto, kit)     ──► SQL / Prisma                      │
│      ├── consultar_precio_y_pack(kit_o_id)       ──► SQL / chat_packs                  │
│      ├── consultar_info_negocio(envio, etc.)     ──► SQL / info_negocio                │
│      └── escalar_a_humano(motivo, resumen)       ──► Nota Chatwoot (Silencio)          │
│                                 │                                                      │
│                                 │ [Datos duros retornados]                             │
│                                 ▼                                                      │
│   3. Síntesis y Redacción ──► LLM (Genera mensaje amigable final con la voz del local) │
└─────────────────────────────────────────────┬──────────────────────────────────────────┘
                                              │
                                              ▼
                                  ┌────────────────────────┐
                                  │ Mensaje a Chatwoot     │
                                  └────────────────────────┘
```

---

## 4. Estructura de Archivos en `bot-agente/`

* `FILOSOFIA-Y-ROADMAP.md`: Este documento.
* `tipos.ts`: Tipos TypeScript compartidos (mensajes, herramientas, respuestas). `RespuestaAgente.fotoUrl` lleva la foto del kit cuando el turno entrega un mensaje de bienvenida (match exacto de plantilla o descubierto por el LLM vía `consultar_catalogo_y_precios`), igual criterio que usaba chatwoot 2.0 (`lib/chatwoot-bot.ts` → `enviarImagenChatwoot`).
* `motor.ts`: Bucle de ejecución Tool Calling (llamada a la IA -> ejecución de tools -> síntesis). Inyecta contexto temporal, memoria de estado y situaciones detectadas. `fetch` al LLM con timeout + 1 reintento.
* `nucleo/`: **Núcleo compartido — acá se toca una sola vez, no se copia a cada tool.**
  * `texto.ts`: `normalizarTexto`, `distanciaLevenshtein` y `puntuarItemCatalogo` (el ÚNICO scorer del proyecto, antes duplicado en 2 tools).
  * `estado-persistente.ts`: lee/escribe `chat_conversacion_estado` (combo pineado, variante resuelta, moto confirmada) y arma el bloque `MEMORIA DE ESTADO`. El motor lo escribe al final de cada turno con lo que resolvieron las herramientas — NO se parsea el historial con regex.
* `situaciones/`:
  * `index.ts`: lee `chat_situaciones` y devuelve solo las reglas cuyo disparador pega con el mensaje del cliente. Fallback en código si la tabla no existe.
* `herramientas/`:
  * `index.ts`: Registro central + `ejecutarHerramienta(nombre, args, contexto)` (el contexto trae el `conversationId`).
  * `compatibilidad.ts`: Consulta compatibilidad moto-kit (combos, artículos, legacy).
  * `catalogo-precios.ts`: Consulta de `chat_packs`, `chat_pack_grupos` y piezas sueltas.
  * `resolver-variante.ts`: resuelve qué variante lleva el cliente (o la próxima pregunta). Determinista, agnóstico al eje vía `chat_packs.sinonimos_variante`.
  * `info-negocio.ts`: Consulta de `info_negocio` con cálculo de horario en tiempo real.
  * `escalar-humano.ts`: Escala al panel de pendientes en silencio. Solo persiste si hay `conversation_id` real (el simulador/banco no ensucian el panel).
* `prompts/`:
  * `sistema.ts`: Prompt maestro ACOTADO — solo identidad, voz, puntuación, contrato de grounding y resumen del embudo. **No crece por caso: ver sección 8.**
* `guardrails/`:
  * `sanitizador.ts`: limpieza determinista de la salida (voseo, signos de apertura, frases de call center, frases que delatan IA, palabras prohibidas).
* `pruebas/`:
  * `casos-reales.ts`: Banco de casos históricos difíciles.
  * `correr-banco.ts`: **Runner que ejecuta el banco contra el motor real y verifica escalado / silencio / herramientas / patrón.** Es la red de seguridad que permite achicar el prompt sin miedo. Se corre desde el simulador (pestaña "Banco de pruebas").

---

## 5. Roadmap de Implementación

- [x] **Fase 1: Constitución y Estructura Base**
  - Documentación rectora (`FILOSOFIA-Y-ROADMAP.md`).
  - Definición de tipos e interfaces TypeScript.
  - Implementación de las 4 herramientas base contra PostgreSQL/Prisma.
  - Redacción del Prompt del Sistema con la voz de Revolución Motos.
- [x] **Fase 2: Motor de Ejecución (Tool Calling Runner)**
  - Implementación de `motor.ts` con ciclo ReAct, tool calling y guardrails.
  - Manejo inteligente del escalado silencioso (cuando la herramienta es de escalado, el bot no manda texto público).
  - Filtro determinista para saludos simples y plantillas de anuncios de Instagram a costo $0.
  - Detección determinista de escalado (reclamos, agresiones, pedido expreso de humano).
- [x] **Fase 3: Simulador Web en `/admin/chatwoot/simulador`**
  - Interfaz visual para que Martín pueda probar cualquier mensaje.
  - Muestra en pantalla: mensaje de entrada, herramientas ejecutadas, datos devueltos de la DB, tiempo de respuesta (ms) y respuesta final.
  - Persistencia en Postgres (`bot_simulador_conversaciones`) y configuración dinámica (`chat_config`).
- [x] **Fase 4: Validación del Banco de Pruebas y Casos Críticos**
  - Runner ejecutable (`pruebas/correr-banco.ts`) + pestaña "Banco de pruebas" en el simulador.
  - Calibración del tono, embudo de mostrador y casos límite.
- [x] **Fase 4.5: Refactor anti-crecimiento (ver sección 8)**
  - Prompt del sistema recortado (~60%): solo identidad + voz + grounding + resumen del embudo.
  - Situaciones especiales movidas a `chat_situaciones` (editable desde `/admin/chatwoot/situaciones`).
  - Memoria de estado del embudo derivada del historial en vez de repetida en prosa.
  - Scorer de catálogo unificado en `nucleo/texto.ts` (estaba duplicado).
  - `conversation_id` propagado hasta los escalados; escalado determinista ahora persiste.
- [x] **Fase 4.6: Resolución de variante estructural (agnóstica al eje)**
  - Herramienta `resolver_variante` reemplaza los "Caminos 1-4" del prompt.
  - `chat_packs.sinonimos_variante text[]`: match determinista variante↔texto para cualquier eje (recorrido, color, mm).
  - `chat_conversacion_estado`: memoria persistente del embudo; se acabó el parseo de historial con regex (`estado-embudo.ts` eliminado).
  - Campo "sinónimos" por variante en `/admin/chatwoot/catalogo`.
- [x] **Fase 5: Prueba Piloto Controlada** (06/09)
  - Webhook real: `app/api/chatwoot/webhook/route.ts` → `lib/bot-agente-tiempo-real.ts` (`manejarMensajeEntrantePiloto` con debounce de ráfaga en Map en memoria → `procesarTurno`).
  - Piloto acotado por la tabla `bot_agente_piloto` (activo=true); n8n queda pausado en esa conversación con nota `/bot off`.
  - `reprocesarColaPendienteConBotAgente()` migra la cola vieja de n8n conversación por conversación.
  - Turnos reales → `bot_agente_turnos_reales` (para inspección).
- [x] **Fase 6: Pasaje global (n8n → bot-agente para TODAS las conversaciones)** — **ACTIVADO 07/09 ~14:30 AR**
  - **Estado:** EN VIVO. `chat_config.bot_agente_global` = `true`. El workflow n8n "Respuestas chatwoot 2.0" (`s7EpPTjNFy6iCclg`) está **desactivado**. El motor nuevo es el ÚNICO que responde WhatsApp.
  - **Cómo se apagó n8n:** REST API n8n (`APIKEY_N8N` del `.env`, base `https://n8n.revolucionmotos.tech/api/v1`): `POST /workflows/s7EpPTjNFy6iCclg/deactivate`. El MCP de n8n **no** tiene acceso a ese workflow ("not available in MCP"). Plan B: `.../activate` + `activar-bot-agente-global.ts --off`.
  - **Bugs encontrados y arreglados DURANTE el cutover (07/09):**
    - **Webhook con `void promise`** (`45a49bb`): el webhook hacía el trabajo de bot-agente sin `await` → Next cerraba el contexto del request y las continuaciones async no corrían. El piloto **nunca produjo un turno por webhook** en toda la Fase 5 (los de anoche fueron por los scripts de reproceso). Ahora se awaitea antes de responder el webhook.
    - **`sender.type` faltante** (`f787468`): el bloque bot-agente del webhook exigía `mensajeEntrante.sender?.type === "contact"`. El payload del webhook de Chatwoot **no siempre trae ese campo** (la API REST sí). Cuando faltaba, `esDeCliente` era false y todo el bloque se salteaba. Ahora: `incoming` + no privado = del cliente.
    - **Plantilla solo en el 1er mensaje** (`3b4e3fe`): `detectarPlantillaAnuncio` estaba gateado a `historialPrevio.length === 0`. Un cliente que re-clickea un anuncio (mismo u otro producto) mid-charla no recibía la bienvenida automática. Ahora corre en cada turno. INNEGOCIABLE que la plantilla dispare la bienvenida.
    - **Guardrail de respuesta no confiable** (`10cd2c8`): `pareceRespuestaNoConfiable()` en el sanitizador detecta inglés / razonamiento interno / nombres de herramientas / `mensaje_para_agente` crudo. El motor ante eso NO manda nada: escala con motivo `respuesta_no_confiable`.
    - **"170cc" no matcheaba** (`cb380d8`): `normalizarTexto` ahora separa el número pegado a "cc"/letras. Y el mensaje de "sin match en catálogo" ya no dice "no lo tenemos" (prohibido) — manda a escalar.
  - **Piloto:** al activar quedaban 81 conversaciones con `/bot off` viejo. Se les mandó `/bot on` (nota privada con el **token del bot** — funciona, no hace falta `CHATWOOT_ADMIN_API_TOKEN`) a 77; 4 quedaron con el equipo (humano activo en la última hora). El `--reactivar-piloto` del script necesita el admin token, por eso se hizo con un script ad-hoc con el bot token.
  - **Los scripts NO corren en el server** (build standalone de Next: sin `scripts/`, sin `tsx`, sin fuente). Se corren desde una máquina con el código + `.env`. Falta `CHATWOOT_ADMIN_API_TOKEN` local → cualquier cosa que mande `/bot off`/`/bot on` como "agente humano" no corre desde ahí (pero el token del bot sí puede mandar notas privadas `/bot on`/`/bot off`).
  - **Qué agrega el modo global** (`bot_agente_global` = true):
    - El webhook manda TODA conversación entrante al motor nuevo (no solo `bot_agente_piloto`).
    - **Gate de horario** en `procesarTurno`: usa `bot_horario` vía `botDentroDeHorario()` (mismo criterio que n8n). Dentro de hora → responde con la demora humana. Fuera de hora → ver **Fase 7** (antes: generaba y encolaba una respuesta por mensaje en `respuestas_pendientes`; ahora: solo marca la conversación y responde consolidado al abrir).
    - En el webhook, con el global activo, cada mensaje entrante llama `sincronizarEstadoBot()` para reconciliar el horario y disparar ese despacho (antes lo gatillaba `/api/chatwoot/enviar` de n8n, que ya no se usa). **Requiere `horario_automatico` = true.**
  - **Demora humana** (Fase 5.5, ya en prod inerte): `procesarTurno` espera un objetivo aleatorio en `chat_config.respuesta_delay_min_seg`–`respuesta_delay_max_seg` (default 45–75, el pasaje lo fija en 50–70) **descontando lo que ya tardó el modelo**, así el total percibido cae siempre en esa ventana. Tras la espera re-chequea Chatwoot y no pisa si contestó un humano. Cálculo puro y testeable: `calcularEsperaCadenciaHumanaMs()` en `lib/bot-agente-tiempo-real.ts`.
  - **`/bot off` en modo global = humano al mando** (resuelto 07/09): con n8n apagado, `/bot off` (switch de `/admin/chatwoot/chats-vivo`) y una respuesta pública de un humano real dejan la conversación fuera del alcance del motor. `procesarTurno` lo chequea con `calcularBotPausadoDesdeHistorial()` **solo si el global está activo** (en modo piloto `/bot off` sigue siendo el corte de n8n y no frena al motor). Re-chequeo después de la demora de cadencia humana por si el `/bot off` (nota privada) entró durante la espera. El reproceso aplica el mismo criterio y, en global, ya no marca `bot_agente_piloto` (redundante).
  - **Scripts** (todos en `scripts/`, se corren con `npx tsx`):
    - `activar-bot-agente-global.ts` — prende la perilla + demora 50-70s + deja horario automático prendido y reconcilia. `--off` vuelve a n8n. `--estado` inspecciona (ahora lista las conversaciones de piloto activas, que arrastran un `/bot off` viejo). `--reactivar-piloto` les manda `/bot on` y las desmarca (correr tras revisar que ningún humano las agarró de verdad). **NO toca n8n.**
    - `reprocesar-cola.ts` — drena `respuestas_pendientes` reprocesando cada conversación con el motor nuevo (reemplaza los borradores de n8n). `--estado`, `--forzar` (correr con el local cerrado).
    - `atender-pendientes.ts` — dispara a mano el barrido de entrantes pendientes (Fase 7 / 7.1). `--estado` lista, `--forzar` saltea horario + grace.
    - `responder-conversaciones.ts <id> <id> ...` — responde conversaciones puntuales con el motor (misma demora + re-chequeo). Para las que quedaron colgadas sin mensaje nuevo.
    - `probar-demora-humana.ts` — chequeo del cálculo de la demora + dry-run read-only de punta a punta (`--conv <id>`).
  - **Apagar n8n:** workflow "Respuestas chatwoot 2.0" (id `s7EpPTjNFy6iCclg`) — es el único activo. Desde n8n (o MCP `unpublish_workflow`). Plan B: reactivarlo + `activar-bot-agente-global.ts --off`.
  - **Secuencia de activación (hacer cerca de abrir el local):**
    1. Verificar que el deploy quedó sano.
    2. `npx tsx scripts/activar-bot-agente-global.ts` → perilla ON.
    3. Apagar workflow n8n "Respuestas chatwoot 2.0".
    4. Revisar el listado "piloto activo" que imprime el script; si hay y ningún humano las agarró de verdad: `npx tsx scripts/activar-bot-agente-global.ts --reactivar-piloto`.
    5. `npx tsx scripts/reprocesar-cola.ts` → la cola de la noche sale re-evaluada por el nuevo.
    6. `npx tsx scripts/responder-conversaciones.ts <ids>` → conversaciones colgadas sin mensaje nuevo.
    7. Mirar `/admin/chatwoot/chats-vivo` de cerca las primeras horas.
  - **Cola de envíos — timeout y auto-recuperación** (07/09): `enviarMensajeChatwoot` y todos los `fetch` a Chatwoot ahora van por `chatwootFetch()` con timeout de 15s. Antes, una conexión colgada congelaba el bucle de `despacharCola` (proceso único → flag `despachando` pegado en true) y **cortaba TODA la cola hasta un redeploy** — pasó ese día, la fila 1274 quedó en `enviando` y 10 saludos no salieron. Además: el flag ahora es un timestamp (`despachandoDesde`) que se da por muerto tras 5 min; al arrancar un despacho, las filas en `enviando` huérfanas vuelven a `pendiente`; y el webhook llama `empujarCola()` con cada mensaje entrante del cliente (drena la cola sin depender de que el flip de horario lo agarre un request en vuelo).
  - **Pendientes de corregir EN VIVO** (el motor tiene menos kilómetros que n8n; se decidió ajustar con casos reales):
    - ~~**Compatibilidad de más**~~ **RESUELTO 07/09 (Opción 3, commit `ba74b05`)**: `nucleo/motos.ts` → `resolverMoto(texto)` clasifica su resolución con **nivel de confianza** (`exacta`/`aproximada`/`ambigua`/`ninguna`). `ambigua` (cilindrada que no consta, o familia con varios modelos) → `consultar_compatibilidad` y `resolver_variante` devuelven `confianza: "parcial"` con los candidatos y la IA repregunta ("tenés la 110 o la 125?"), sin confirmar ni escalar. Un solo concepto, no una regla por atributo. Repro "blitz 150" arreglado. Banco 30/30 (caso-30). Residual: modelos de nombre corto (`s2`, `zb`, `rx`) no entran a la lógica de familia → caen en `ninguna` → escalan (safe, no repreguntan).
    - **`chat_articulo_compatibilidad` art. 17** ("Cilindro 170 varillero") tiene nombres de moto tipeados mal ("onda storn", "honda strom") que a veces ganan el match.
    - **Formato de precio**: sale `$ 175.000` con espacio, debería ser `$175.000` (es-AR).
    - **API de IA intermitente**: se vio `AbortError` en el motor. Falta reintento ante caída del modelo.
    - `calcularBotPausadoDesdeHistorial()` solo mira la última página de mensajes de Chatwoot: un `/bot off` muy viejo en una charla larguísima podría quedar fuera de página.
    - **Simulador ≠ producción**: el simulador usa un `estadoKey` propio (session, no `conversationId`) y el historial que armás a mano; no reconstruye el hilo real, no aplica pausa/demora/debounce. Fiel en el razonamiento y el texto, no en el estado multi-turno.
  - **Kit 170 / Kit 220** (07/09): el Kit 170 (pack 11) SÍ está en el catálogo y su compatibilidad rica vive en `chat_articulo_compatibilidad` del artículo 17. Se limpiaron 14 filas legacy duplicadas y las que ofrecían un "kit 150 + leva $129.999" inexistente (`n8n-workflows/chat-kit170-compatibilidad.sql`). YBR 125 ahora escala en vez de ofrecer el fantasma. El Kit 220 no existe (el dakar es 200): cae solo en el escalado genérico, sin fila especial. El buffer de ráfaga vive en memoria: si el server reinicia mientras junta una ráfaga, esa ráfaga se pierde (la cola de horario lo mejora, no lo elimina). Es un cambio de golpe, no gradual.

- [x] **Fase 7: Consolidación de ráfagas fuera de horario ("regeneración a la apertura")** — 07/09
  - **Problema:** con el local cerrado, cada mensaje entrante del cliente que se salía de la ventana de debounce (60s) disparaba su propio `procesarTurno` → su propia llamada al LLM → su propia fila en `respuestas_pendientes` (`origen: bot_agente`). Al abrir, `despacharCola` las mandaba TODAS seguidas (2s entre partes) → el cliente recibía 3-6 mensajes desfasados y contradictorios, generados en momentos distintos con contexto parcial (un turno preguntaba la moto que el siguiente ya daba por sabida). Detectado en las convs **3528** (+5493425486263), **3565** (+5491128156286) y **2900** (+5493513230494) — domingo 07/09, local cerrado todo el día.
  - **Solución:** fuera de horario el bot **no llama al modelo ni encola nada**. El webhook marca la conversación en **`bot_agente_entrantes_pendientes`** (ver abajo, Fase 7.1) y `procesarTurno` corta. Cuando el local abre, `atenderEntrantesPendientes()` (`lib/bot-agente-tiempo-real.ts`) hace **una** pasada: por cada conversación reconstruye el hilo completo desde Chatwoot y genera **una sola** respuesta, escalonadas 6s. Si contestó un humano / se pasó la ventana de 24hs / hay `/bot off` → borra la fila y sigue. Lock de módulo (muerto a los 5min). Corte anti-loop a los 3 intentos → escala.
  - **Fix chico de la misma raíz, dentro de horario:** si llega un mensaje nuevo mientras un turno está en vuelo, los mensajes de ese turno se **devuelven al frente del buffer nuevo** (`devolverMensajesSiHayRafagaNueva`) en vez de perderse.
  - **`respuestas_pendientes` / `despacharCola` quedan intactos** para la cola legacy de n8n. Las filas `origen='bot_agente'` viejas se drenan como siempre (si molestan: `UPDATE respuestas_pendientes SET estado='descartado' WHERE origen='bot_agente' AND estado='pendiente'`).

- [x] **Fase 7.1: Recuperación de mensajes que se pierden en un deploy/crash** — 07/09
  - **Problema:** el webhook responde 200 a Chatwoot y recién después (async, en memoria) corre el modelo + la demora de 50-70s. Si Coolify reinicia el contenedor en esos ~2 min, el trabajo se evapora y **Chatwoot no reintenta**. Conv **3575** (+5493718506927): "Recorrido corto" cayó justo durante el deploy de `87f222f` y quedó sin respuesta, sin rastro.
  - **Solución:** el mismo mecanismo de Fase 7, generalizado. Tabla renombrada `bot_agente_pendiente_apertura` → **`bot_agente_entrantes_pendientes`** (`n8n-workflows/bot-agente-entrantes-pendientes.sql`). El **webhook** hace `marcarEntrantePendiente()` (upsert) con CADA mensaje del cliente, ANTES del trabajo async. `procesarTurno` **borra la fila** cuando atendió (guard por `ultimo_mensaje_en` para no pisar una ráfaga nueva). El barrido `atenderEntrantesPendientes()` recoge lo que sobrevive al **grace de 4 min** (un turno vivo tarda hasta ~2): local cerrado (espera apertura) o turno muerto (lo recupera ya).
  - **Disparadores** (auto-protegidos: fuera de horario salvo `--forzar` / lock / nada vencido = no-op):
    - webhook, tras cada mensaje entrante → `atenderEntrantesPendientesEnSegundoPlano()`.
    - `sincronizarEstadoBot` (cola.ts) al abrir el local (import dinámico).
    - **`setInterval` cada 3 min** en `lib/bot-agente-tiempo-real.ts` (`unref`, dedup por `globalThis`) — cubre el caso "no llega tráfico nuevo que lo dispare".
    - `scripts/atender-pendientes.ts` a mano (`--estado` lista, `--forzar` saltea horario + grace).
  - **Sigue dependiendo de `bot_horario` bien cargado + `horario_automatico=true`.** Válvula: `atender-pendientes.ts --forzar`.

---

## 6. Blindaje de los 6 Casos Críticos

1. **Descuentos y Regateo:** Precios finales oficiales con envío gratis incluido a todo el país. Cero inventar rebajas. Si solicitan compra por volumen/mayorista (5+ kits), escalado silencioso con motivo `mayorista`.
2. **Pedido de Regalos:** Solo se mencionan los regalos oficiales cargados en el catálogo (ej: dos coronitas en Tapa CDI). Si piden piezas extras gratis, rechazo cordial y simpático ("Viene tal cual la publicación amigo, completito con envío gratis").
3. **Reclamos y Quejas Post-Venta:** Detección determinista inmediata y silenciosa con `escalar_a_humano(motivo: 'reclamo_postventa')`. El bot no emite texto cara al cliente.
4. **Insultos y Agresiones:** Detección determinista inmediata y silenciosa con `escalar_a_humano(motivo: 'cliente_agresivo')`. Silencio total cara al cliente sin discutir ni justificarse.
5. **Prompt Injection / Robo de Instrucciones:** Desconcierto natural de vendedor cordobés ("No sé de qué me hablás bro, acá vendemos repuestos para motos!"). Si insiste, escalado silencioso `intento_jailbreak`.
6. **Bot vs Humano:**
   - Si pregunta *"Sos un bot?"*: Respuesta pícara y cercana ("Jaja no amigo, soy del equipo de ventas acá en el local!").
   - Si pide *"Pasame con un humano"*: Cumplimiento inmediato en silencio con `escalar_a_humano(motivo: 'cliente_pide_humano')`.

---

## 7. Manejo de Ráfagas y Debounce de Cadencia Humana

- **Objetivo doble:**
  1. **Evitar respuestas inmediatas sospechosas:** Un bot que responde en 1 segundo revela inmediatamente que no es un asesor humano.
  2. **Consolidar ráfagas de mensajes:** Permitir que el cliente escriba varios mensajes consecutivos (ej. 3 seguidos con consultas de producto, envíos y dudas de confianza) sin interrumpirlo a mitad de camino ni pisar respuestas.
- **Implementación técnica:**
  - Configuración persistente en `chat_config` (`debounce_segundos: 15`, `debounce_activo: true`). **15s** (era 60: demasiada espera para el cliente). Con `debounce_activo=false` igual se agrupan 5s — **NO menos**: con 3s las ráfagas reales de WhatsApp (mensajes 5-10s aparte) se partían en turnos separados y las respuestas se pisaban entre sí (turno A "De una!" salía y hacía `salteado` a los turnos B/C que tenían la respuesta real — conv 3579, 07/09).
  - Cada mensaje entrante dentro de la ventana se suma al buffer y **reinicia la cuenta regresiva**.
  - Al cumplirse la ventana de silencio, los mensajes se unen mediante `\n` y se entregan en un solo turno al motor ReAct.
  - **Candado por conversación (07/09):** `turnosEnVuelo` garantiza **un solo turno a la vez por conversación**. Antes, una ráfaga partida en dos turnos corría en paralelo: los dos generaban respuesta, el segundo veía un saliente más nuevo y **se tiraba a la basura** — la pregunta del cliente quedaba sin contestar (conv 3561: "Un Motomel s2" + "Hay q modificar sigueñal?" a 24s; se contestó la moto, la del cigüeñal se perdió). Medido: **19 respuestas descartadas así en 3 días**. Ahora el lote espera y se procesa cuando el historial ya incluye la respuesta anterior, así el modelo contesta lo que falta.
  - **Reencolado en vez de descarte:** cuando la respuesta se descarta porque apareció un saliente más nuevo, se mira **quién** lo mandó (`delBot`, vía `sender.id` vs `CHATWOOT_BOT_USER_ID`). Si fue el propio bot, el lote se **reencola** (tope `MAX_REENCOLADOS = 1`) para responder lo que falta. Si fue un humano del equipo, se descarta: el equipo se hizo cargo.
  - En `/admin/chatwoot/simulador`: Switch para activar/desactivar el debounce a demanda durante pruebas, contador regresivo en vivo y botón `⚡ Responder ya` para despacho anticipado.

---

## 8. Anti-crecimiento: dónde va cada tipo de regla (LA regla del proyecto)

El bot de n8n murió de **explosión combinatoria**: un nodo (o un párrafo) por cada forma en que un cliente puede escribir algo. Este proyecto se diseñó para que **un error nuevo NUNCA agrande el prompt**. Cada tipo de conocimiento tiene un único lugar:

| Tipo de regla / conocimiento | Dónde vive | Agregar un caso nuevo = |
|---|---|---|
| Precios, stock, compatibilidad, políticas | Base de datos (`chat_packs`, `chat_combo_compatibilidad`, `info_negocio`...) | una fila / editar la fila |
| Qué hacer en cada paso del embudo | El `mensaje_para_agente` que devuelve cada herramienta (ya sabe el paso) | editar el builder de esa tool + su caso en el banco |
| Info institucional (envíos, pagos, ubicación, garantía) | Fila en `info_negocio`, partida en párrafos = **hechos** | editar la fila; la tool entrega hechos numerados, no un guion |
| "Ya le contesté este tema, no se lo repitas" | `chat_conversacion_estado.temas_respondidos` → bloque `MEMORIA DE ESTADO` | nada: el motor lo anota solo cuando la tool entrega el tema |
| Casos situacionales (descuento, mayorista, "sos un bot?", comprobante, jailbreak...) | Tabla `chat_situaciones` (`/admin/chatwoot/situaciones`) | **un INSERT / una fila** |
| Resolver qué variante lleva el cliente (corto/largo, color, mm, cualquier eje futuro) | Herramienta `resolver_variante` + `chat_packs.sinonimos_variante` | **cargar los sinónimos de la variante nueva, cero código** |
| "Ya confirmé el combo / la moto / la variante, no repreguntar" | `chat_conversacion_estado` + `nucleo/estado-persistente.ts` → bloque `MEMORIA DE ESTADO` | nada: el motor lo escribe solo con lo que devuelven las tools |
| Cómo normalizar / puntuar un término de catálogo | `nucleo/texto.ts` (único scorer) | tocar una función, un solo lugar |
| Identidad, voz, puntuación, contrato de grounding | `prompts/sistema.ts` | **casi nunca se toca** |
| Limpieza determinista de la salida (voseo, call center...) | `guardrails/sanitizador.ts` | una regla de regex |

**Presupuesto del prompt:** la parte de procedimiento de `sistema.ts` no debería superar ~1.200 tokens. Si después de resolver un incidente el prompt creció, es un smell: el fix iba en una tool, en `chat_situaciones` o en el estado.

**Por qué el modelo puede ser fluido igual:** la mayoría de las micro-prohibiciones ("no digas 'en qué más puedo ayudarte'") las cubre el sanitizador o un modelo más capaz. El prompt da la voz con pocos ejemplos, no enumera cada anti-patrón.

**El banco de pruebas es lo que habilita achicar.** Antes nadie refactorizaba por miedo a romper un fix viejo, así que solo se agregaba. Con `pruebas/correr-banco.ts` fallando en rojo se pueden fusionar reglas y saber al instante si algo regresionó. **Correr el banco es obligatorio antes de dar por cerrado cualquier cambio del bot.**

Notas sobre el banco:
- Corre contra el motor real + la DB real + el modelo configurado, así que hay algo de varianza de modelo turno a turno (sobre todo en mensajes multi-intento). Los casos afirman lo estructural (escaló / guardó silencio / qué herramientas llamó), no la redacción exacta.
- Cada fix de un bug nuevo va con su caso en `casos-reales.ts`.
- Se corre desde `/admin/chatwoot/simulador` → pestaña "Banco de pruebas", o `npx tsx` con un harness (ver `scratch/banco.ts` de referencia).
- Un caso puede **sembrar estado** (`estadoInicial`) para probar reglas que dependen de la memoria, y afirmar en **negativo** (`patronProhibido`) — por ejemplo "no puede volver a recitar la demora de envío".
- Las piezas puras (dedup de oraciones, partido en hechos, unión de temas, cadencia humana) tienen pruebas sin costo de API: `node scratch/probar-mejoras.cjs`. Correr eso primero: es instantáneo y gratis.

---

## 9. La trampa a vigilar: el determinismo se muda, no desaparece

Diagnóstico del 07/09 sobre la conv 3561. El prompt efectivamente no creció, pero las reglas se habían repartido en **cuatro** fuentes que se inyectan en el mismo turno y compiten entre sí: `prompts/sistema.ts`, el `mensaje_para_agente` de cada tool, `chat_situaciones` y `MEMORIA DE ESTADO`. Dos consecuencias medidas:

1. **La guía de la tool le gana al prompt.** `sistema.ts` dice "no repitas info que ya diste", pero también "seguí la guía de cada herramienta al pie"; la tool decía "redactá basándote estrictamente en este dato". El modelo obedeció a la tool y repitió el bloque de envíos entero dos mensajes seguidos.
2. **Los ejemplos de tono se usaban como plantilla.** El cierre "Le va bien bro, cualquier cosa avisanos y coordinamos." salía textual porque estaba escrito textual en el prompt.

Reglas que salieron de ahí:

- **Una tool devuelve DATOS, no un libreto.** Si el `mensaje_para_agente` contiene una redacción lista para copiar, el modelo la va a copiar. Entregá hechos numerados + **una** regla de qué hacer con ellos. Ver `construirGuiaInfoNegocio()` como forma canónica.
- **Una tool que no ve la conversación no puede decidir qué decir.** Lo que el modelo ya dijo lo sabe el motor (estado persistente), y se le inyecta a la tool por `ContextoEjecucion` — nunca por un argumento que el modelo pueda falsear.
- **Los ejemplos del prompt son registro, no frases.** Van con la prohibición explícita de copiarlos palabra por palabra, y la repetición literal la corta el sanitizador (`quitarOracionesYaDichas`), que es higiene de texto y no una regla de negocio.
- **Cuando un fix "obvio" sería un párrafo nuevo en el prompt, casi siempre el bug real está en otro lado.** Acá el duplicado de envíos no era un problema de redacción: era que la herramienta no tenía memoria.


