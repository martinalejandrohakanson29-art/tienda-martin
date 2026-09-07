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
- [ ] **Fase 6: Pasaje global (n8n → bot-agente para TODAS las conversaciones)** — código listo 07/09, activación pendiente
  - **Estado:** el código está pusheado pero **INERTE** (`chat_config.bot_agente_global` = false). Sin activar, todo se comporta como en Fase 5.
  - **Qué agrega el modo global** (`bot_agente_global` = true):
    - El webhook manda TODA conversación entrante al motor nuevo (no solo `bot_agente_piloto`).
    - **Gate de horario** en `procesarTurno`: usa `bot_horario` vía `botDentroDeHorario()` (mismo criterio que n8n). Dentro de hora → responde con la demora humana. Fuera de hora → la respuesta ya generada se difiere a `respuestas_pendientes` (origen `bot_agente`) y el despachador existente (`despacharCola`) la manda escalonada al abrir.
    - En el webhook, con el global activo, cada mensaje entrante llama `sincronizarEstadoBot()` para reconciliar el horario y disparar ese despacho (antes lo gatillaba `/api/chatwoot/enviar` de n8n, que ya no se usa). **Requiere `horario_automatico` = true.**
  - **Demora humana** (Fase 5.5, ya en prod inerte): `procesarTurno` espera un objetivo aleatorio en `chat_config.respuesta_delay_min_seg`–`respuesta_delay_max_seg` (default 45–75, el pasaje lo fija en 50–70) **descontando lo que ya tardó el modelo**, así el total percibido cae siempre en esa ventana. Tras la espera re-chequea Chatwoot y no pisa si contestó un humano. Cálculo puro y testeable: `calcularEsperaCadenciaHumanaMs()` en `lib/bot-agente-tiempo-real.ts`.
  - **`/bot off` en modo global = humano al mando** (resuelto 07/09): con n8n apagado, `/bot off` (switch de `/admin/chatwoot/chats-vivo`) y una respuesta pública de un humano real dejan la conversación fuera del alcance del motor. `procesarTurno` lo chequea con `calcularBotPausadoDesdeHistorial()` **solo si el global está activo** (en modo piloto `/bot off` sigue siendo el corte de n8n y no frena al motor). Re-chequeo después de la demora de cadencia humana por si el `/bot off` (nota privada) entró durante la espera. El reproceso aplica el mismo criterio y, en global, ya no marca `bot_agente_piloto` (redundante).
  - **Scripts** (todos en `scripts/`, se corren con `npx tsx`):
    - `activar-bot-agente-global.ts` — prende la perilla + demora 50-70s + deja horario automático prendido y reconcilia. `--off` vuelve a n8n. `--estado` inspecciona (ahora lista las conversaciones de piloto activas, que arrastran un `/bot off` viejo). `--reactivar-piloto` les manda `/bot on` y las desmarca (correr tras revisar que ningún humano las agarró de verdad). **NO toca n8n.**
    - `reprocesar-cola.ts` — drena `respuestas_pendientes` reprocesando cada conversación con el motor nuevo (reemplaza los borradores de n8n). `--estado`, `--forzar` (correr con el local cerrado).
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
  - **Riesgos conocidos:** el motor nuevo tiene menos kilómetros que n8n. `calcularBotPausadoDesdeHistorial()` solo mira la última página de mensajes de Chatwoot: un `/bot off` muy viejo en una charla larguísima podría quedar fuera de página (mismo límite que ya tiene la reconciliación del espejo). El scorer de `consultar_compatibilidad` puede confirmar de más cuando comparten marca pero no modelo (ej: "Corven Energy 110" contra una fila de "Corven Triax 150") si además pega el nombre del kit; y `chat_articulo_compatibilidad` del artículo 17 ("Cilindro 170 varillero") tiene nombres de moto tipeados mal ("onda storn", "honda strom") que a veces gana el match. Pendiente de una pasada con el banco.
  - **Kit 170 / Kit 220** (07/09): el Kit 170 (pack 11) SÍ está en el catálogo y su compatibilidad rica vive en `chat_articulo_compatibilidad` del artículo 17. Se limpiaron 14 filas legacy duplicadas y las que ofrecían un "kit 150 + leva $129.999" inexistente (`n8n-workflows/chat-kit170-compatibilidad.sql`). YBR 125 ahora escala en vez de ofrecer el fantasma. El Kit 220 no existe (el dakar es 200): cae solo en el escalado genérico, sin fila especial. El buffer de ráfaga vive en memoria: si el server reinicia mientras junta una ráfaga, esa ráfaga se pierde (la cola de horario lo mejora, no lo elimina). Es un cambio de golpe, no gradual.

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

## 7. Manejo de Ráfagas y Debounce de Cadencia Humana (60s)

- **Objetivo doble:**
  1. **Evitar respuestas inmediatas sospechosas:** Un bot que responde en 1 segundo revela inmediatamente que no es un asesor humano.
  2. **Consolidar ráfagas de mensajes:** Permitir que el cliente escriba varios mensajes consecutivos (ej. 3 seguidos con consultas de producto, envíos y dudas de confianza) sin interrumpirlo a mitad de camino ni pisar respuestas.
- **Implementación técnica:**
  - Configuración persistente en `chat_config` (`debounce_segundos: 60`, `debounce_activo: true`).
  - Cada mensaje entrante dentro de la ventana de 60 segundos se suma al buffer y **reinicia la cuenta regresiva**.
  - Al cumplirse 60 segundos de silencio, los mensajes se unen mediante `\n` y se entregan en un solo turno al motor ReAct.
  - En `/admin/chatwoot/simulador`: Switch para activar/desactivar el debounce a demanda durante pruebas, contador regresivo en vivo y botón `⚡ Responder ya` para despacho anticipado.

---

## 8. Anti-crecimiento: dónde va cada tipo de regla (LA regla del proyecto)

El bot de n8n murió de **explosión combinatoria**: un nodo (o un párrafo) por cada forma en que un cliente puede escribir algo. Este proyecto se diseñó para que **un error nuevo NUNCA agrande el prompt**. Cada tipo de conocimiento tiene un único lugar:

| Tipo de regla / conocimiento | Dónde vive | Agregar un caso nuevo = |
|---|---|---|
| Precios, stock, compatibilidad, políticas | Base de datos (`chat_packs`, `chat_combo_compatibilidad`, `info_negocio`...) | una fila / editar la fila |
| Qué hacer en cada paso del embudo | El `mensaje_para_agente` que devuelve cada herramienta (ya sabe el paso) | editar el builder de esa tool + su caso en el banco |
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


