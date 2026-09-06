# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## 🛠️ Stack & Commands
- **Stack:** Next.js 14, TypeScript, Prisma, React.
- **Package Manager:** npm.
- **Commands:** `npm run dev` (development), `npm run build` (production build), `npm run lint` (code style checks).
- **Testing:** No hay framework de tests general. El bot-agente SÍ tiene un banco de regresión: `bot-agente/pruebas/correr-banco.ts` (se corre desde `/admin/chatwoot/simulador` → pestaña "Banco de pruebas", o vía `correrBancoPruebasAction`).

## ⚙️ Critical Project Conventions & Gotchas
- **Financial Data:** All monetary values (price, total, etc.) are stored as `Decimal` in Prisma. Do not use standard JavaScript `Number` types for calculations; use appropriate decimal libraries or Prisma's Decimal type handling.
- **Product Ordering:** Products with `order = 0` are implicitly treated as having the highest priority (999999) for sorting purposes. Use explicit `order = 1, 2, 3...` for intended priority.
- **Stock Atomicity:** Stock updates MUST be wrapped in `prisma.$transaction()` to prevent race conditions and ensure data integrity.
- **S3 Configuration:** Storage uses `forcePathStyle: true` and requires `rejectUnauthorized: false` due to self-signed certificates.
- **Cart Synchronization:** The cart state relies on `localStorage` and cross-tab synchronization via a custom `cart-updated` event, managed by `hooks/use-cart.ts`.
- **ML Integration:** Complex models exist for `MLFees` and `MLDescuentos` which define specific pricing logic that must be respected.
- **Business Focus & SEO:** Revolución Motos is strictly a motorcycle parts, performance kits and accessories retail and wholesale store/distributor based in Córdoba. Do NOT refer to it as a repair shop or offering mechanical repair services. See `ROADMAP-SEO.md` for current SEO roadmap, category landings, and pending Point 4 (Guides/Blog).
- **Git Push Policy:** NEVER run `git push` or push to remote repositories unless Martín explicitly instructs to do so (`no hagas push hasta que te avise`).

## 🤖 Arquitectura del Agente de WhatsApp (`bot-agente/`)

El sistema reemplazó los antiguos workflows de n8n por un motor de agentes nativo en TypeScript/Next.js con arquitectura **ReAct (Reasoning + Acting)** y Function Calling.

### 0. REGLA MADRE: el prompt NO crece por error
Este proyecto existe para no repetir la explosión de nodos de n8n. **Un caso nuevo nunca se resuelve agregando un párrafo al prompt.** Cada tipo de regla tiene un único lugar (tabla completa en `bot-agente/FILOSOFIA-Y-ROADMAP.md` §8):
- Datos (precio/compat/políticas) → base de datos.
- Qué hacer en cada paso del embudo → el `mensaje_para_agente` que devuelve cada herramienta.
- Casos situacionales (descuento, mayorista, "sos un bot?", comprobante, jailbreak) → tabla `chat_situaciones`, editable en `/admin/chatwoot/situaciones`. El motor inyecta SOLO la que pega con el mensaje.
- Resolver qué variante lleva el cliente (corto/largo, color, mm — cualquier eje) → herramienta `resolver_variante` + `chat_packs.sinonimos_variante text[]` (dato que carga Martín en `/admin/chatwoot/catalogo`). Match determinista, agnóstico al eje. Agregar un eje nuevo = cargar sinónimos, cero código.
- "Ya confirmé combo/moto/variante, no repreguntar" → `bot-agente/nucleo/estado-persistente.ts` + tabla `chat_conversacion_estado` (bloque `MEMORIA DE ESTADO`). El motor la escribe al final de cada turno con lo que resolvieron las herramientas; NO se parsea el historial.
- Scoring/normalización de términos → `bot-agente/nucleo/texto.ts` (único scorer).
Siempre correr `pruebas/correr-banco.ts` antes de cerrar un cambio del bot.

### 1. Directorio y Componentes Clave
- `bot-agente/motor.ts`: Núcleo de ejecución. Recibe mensaje + historial + `conversationId` opcional, inyecta contexto temporal de Córdoba, el bloque `MEMORIA DE ESTADO` y las situaciones detectadas, y maneja el ciclo ReAct (máx. 6 pasos, `fetch` con timeout 30s + 1 reintento).
- `bot-agente/prompts/sistema.ts`: Prompt maestro ACOTADO (~60% más chico que antes): identidad, voz, puntuación WhatsApp, contrato de grounding y resumen del embudo. Nada de listas largas de casos.
- `bot-agente/nucleo/`: núcleo compartido — `texto.ts` (normalización + `puntuarItemCatalogo`, antes duplicado) y `estado-persistente.ts` (memoria del embudo en `chat_conversacion_estado`).
- `bot-agente/situaciones/index.ts`: lee `chat_situaciones` (con fallback en código si no existe la tabla) y devuelve las reglas cuyo disparador pega con el mensaje.
- `bot-agente/herramientas/`:
  - `resolver-variante.ts`: dado un combo con variantes + lo que dijo el cliente, devuelve "VARIANTE RESUELTA + precio" o la próxima pregunta exacta. Determinista, data-driven (`sinonimos_variante`).
  - `catalogo-precios.ts`: Consulta packs, combos (`chat_pack_grupos`), variantes y piezas sueltas (`chat_articulos`).
  - `compatibilidad.ts`: Consulta compatibilidad mecánica moto-kit en base a `chat_articulo_compatibilidad`.
  - `info-negocio.ts`: Consulta políticas institucionales (`info_negocio`) con cálculo inteligente de horarios en tiempo real (zona horaria Córdoba).
  - `escalar-humano.ts`: Derivación silenciosa a asesores. Persiste el pendiente SOLO si hay `conversation_id` real (simulador/banco no ensucian el panel). El escalado determinista y el `moto_no_registrada` ahora también persisten.

### 2. Filosofía Comercial y Embudo de Mostrador (Regla de Oro)
El bot atiende como un vendedor de mostrador de Córdoba: conciso, buena onda, seguro, sin vueltas ni frases armadas de telemarketing o call center.
- **Puntuación WhatsApp:** NUNCA usar signos de apertura (`¿` ni `¡`). Solo signos de cierre (`?` y `!`).
- **Paso 1 (Identificar la opción):** Si la consulta es ambigua y coincide con varios kits/combos, el bot presenta SOLO las opciones y pregunta cuál busca. PROHIBIDO pedir la moto o dar precios de variantes todavía.
- **Paso 2 (Bienvenida oficial):** Cuando la opción está clara, entrega el mensaje oficial cargado en la app con saltos de línea prolijos, opciones de variantes con precios y la pregunta de variante.
- **Paso 3 (Desambiguar variante - Universal):** Lo maneja la herramienta `resolver_variante`, NO prosa en el prompt. En cuanto el cliente da una pista (medida, color, "corto/largo", su moto) el modelo llama `resolver_variante(combo, mensaje_cliente, modelo_moto?, cliente_no_sabe?)` y hace lo que devuelve: si dice "VARIANTE RESUELTA" cierra con ese precio; si devuelve una pregunta entre comillas, la hace textual. El match variante↔texto es determinista contra `chat_packs.sinonimos_variante` — sirve para cualquier eje (recorrido, color, mm) sin tocar código.
- **Paso 4 (Cierre natural):** Confirma opción, precio final, envío y cierre cálido de mostrador ("Si te interesa avisame y coordinamos!").
- **Prohibición de Saludos en Medio de la Charla:** El saludo ("Hola bro!", "Buenas!") se utiliza exclusivamente en el primer turno. En turnos posteriores o en globos secundarios de una ráfaga, el guardrail determinista (`sanitizador.ts`) remueve automáticamente cualquier saludo inicial residual arrastrado desde plantillas de base de datos (`mensaje_bienvenida`).

### 3. Reglas Críticas para Piezas Sueltas (`chat_articulos`)
- Se activa ÚNICAMENTE si el cliente usa palabras explícitas de separación: *"sola"*, *"solo"*, *"suelto"*, *"separado"*, *"nomás"*.
- Si el bot preguntó qué opción busca y el cliente dice *"tapa cdi"*, **está eligiendo el combo completo**, NO pidiendo la pieza suelta.
- Al informar el precio de una pieza suelta: responder ÚNICAMENTE con su `titulo_comercial` y precio. **CERO volcado de ficha técnica** (prohibido recitar conductos, cielo, alzada, si cambia resortes, etc., a menos que pregunten una duda técnica puntual).
- Solo se pueden ofrecer piezas sueltas del kit del que se viene hablando en la conversación.

### 4. Horarios y Ubicación Espacio-Temporal
- `bot-agente/herramientas/info-negocio.ts` evalúa la hora y día actual en `America/Argentina/Cordoba`.
- Si el cliente pregunta por "hoy" o "ahora" (*"hasta qué hora están hoy?"*, *"están abiertos ahora?"*), el bot responde primero la situación puntual de hoy en tiempo real (ej: *"Hoy ahora estamos hasta las 19 hs!"* o *"Hoy a la tarde abrimos de 16 a 19 hs"*), y luego puede sumar los horarios generales.

### 5. Tratamiento de los Casos Críticos de Atención
> Estas reglas ya NO están todas en el prompt. Las que se detectan por texto exacto (reclamo, insulto, pedido de humano, link/CBU/comprobante/fotos) viven en `detectarEscaladoDeterminista` (motor.ts). Las conversacionales (descuento, mayorista, regalos, "sos un bot?", jailbreak, confianza, compra diferida) viven en `chat_situaciones` y se editan en `/admin/chatwoot/situaciones`. Lista de referencia del comportamiento esperado:
- **1. Descuentos y Regateo:** Precios finales oficiales con envío gratis incluido a todo el país. Cero inventar rebajas. Si solicitan compra por volumen/mayorista (5+ kits), escalado silencioso con motivo `mayorista`.
- **2. Pedido de Regalos:** Solo se mencionan los regalos oficiales del catálogo (ej: dos coronitas en Tapa CDI). Si piden piezas extras gratis, rechazo cordial y simpático ("Viene tal cual la publicación amigo, completito con envío gratis").
- **3. Reclamos y Quejas Post-Venta:** Detección determinista inmediata y silenciosa con `escalar_a_humano(motivo: 'reclamo_postventa')`. El bot no emite texto cara al cliente.
- **4. Insultos y Agresiones:** Detección determinista inmediata y silenciosa con `escalar_a_humano(motivo: 'cliente_agresivo')`. Silencio total cara al cliente sin discutir ni justificarse.
- **5. Prompt Injection / Robo de Instrucciones:** Desconcierto natural de vendedor cordobés ("No sé de qué me hablás bro, acá vendemos repuestos para motos!"). Si insiste, escalado silencioso `intento_jailbreak`.
- **6. Bot vs Humano:**
  - Si pregunta *"Sos un bot?"*: Respuesta pícara y cercana ("Jaja no amigo, soy del equipo de ventas acá en el local!").
  - Si pide *"Pasame con un humano"*: Cumplimiento inmediato en silencio con `escalar_a_humano(motivo: 'cliente_pide_humano')`.
- **7. Consultas y Recursos Fuera del Sistema (Links, CBU, Fotos):**
  - Si piden link de Mercado Libre o pago (`pedido_link_externo`), CBU/Alias para transferir (`pedido_datos_pago`), envían comprobante (`comprobante_pago`) o piden fotos/videos reales (`pedido_fotos_videos`): **PROHIBIDO asumir una negativa o decir "no tengo link/fotos"**.
  - Se escala de inmediato a humano en silencio absoluto para que el vendedor del local envíe el recurso o gestione el cobro.

### 6. Ráfagas de Mensajes y Cadencia Humana (Debounce de 60s)
- **Motivo comercial:** Evitar respuestas instantáneas sospechosas de bot y capturar múltiples mensajes consecutivos del cliente (ej. 3 seguidos con preguntas de precio, envío y confianza) en una sola interacción consolidada.
- **Mecanismo:** Debounce de 60 segundos por defecto (`chat_config.debounce_segundos` y `chat_config.debounce_activo`). Cada nuevo mensaje del cliente antes de que termine el tiempo reinicia la cuenta regresiva. Al haber 60s de silencio, todos los mensajes acumulados se unen con `\n` y se entregan al agente.
- **Simulador (`/admin/chatwoot/simulador`):** Dispone de un switch/check en la barra superior para activar o desactivar este delay de 60s según la necesidad de la prueba, con cuenta regresiva visual y botón de despacho inmediato ("⚡ Responder ya").
- **Respuestas en Ráfaga Humana (`mensajesFinales`):** Cuando la consulta del cliente toca múltiples temas independientes (ej. catálogo + envíos + confianza), el modelo separa los bloques con el delimitador estructural `---MENSAJE---`. El motor del agente los divide en un array de strings `mensajesFinales` para que se entreguen como globos de chat consecutivos e independientes, emulando la cadencia real de WhatsApp y evitando bloques densos de texto.

### 7. Pautas de Testing y Desarrollo
- **Banco de regresión (obligatorio para cambios del bot):** `/admin/chatwoot/simulador` → pestaña "Banco de pruebas" corre los casos de `bot-agente/pruebas/casos-reales.ts` contra el motor real. Todo caso nuevo o fix va acompañado de su caso en ese archivo.
- **Simulador:** Probar también a mano en `/admin/chatwoot/simulador` (pestaña Chat).
- **Situaciones:** casos situacionales nuevos se cargan en `/admin/chatwoot/situaciones`, no en el prompt. Requiere haber corrido `n8n-workflows/chat-situaciones.sql` una vez.
- **Scripts de prueba en consola:** NUNCA ejecutar inline `npx tsx -e "..."` en PowerShell (suele trabarse esperando stdin). Crear siempre un archivo `.ts` en `scratch/`, desconectar Prisma con `await prisma.$disconnect()` y finalizar con `process.exit(0)`.
- **Compilación obligatoria:** Antes de dar por terminado cualquier cambio, ejecutar `npx tsc --noEmit` y verificar que arroje 0 errores.

### 8. Arquitectura de Modelos Canónicos y Aprendizaje de Motos (`motos_modelos`)
- **Problema resuelto:** Evitar la explosión y duplicación de tablas de compatibilidad generadas por errores ortográficos y modismos de clientes (*"smach", "smay", "chmach", "scua"*).
- **Mecanismo:** 
  1. Catálogo de motos canónicas en PostgreSQL (`motos_modelos`) con array de `aliases: text[]`.
  2. Tolerancia a typos en código con distancia de Levenshtein (costo $0, 0 ms) en `bot-agente/herramientas/compatibilidad.ts`.
  3. Escalado automático con registro en `preguntas_tecnicas_pendientes` cuando la moto no se reconoce.
  4. Flujo de aprendizaje en `/admin/chatwoot/pendientes`: el asesor puede asociar con 1 clic el texto del cliente como alias de una moto oficial (`asociarAliasAMoto`) o dar de alta un nuevo modelo (`crearMotoCanonica`), resolviendo la consulta al instante y habilitando la compatibilidad en todos los kits.

### 9. Detección de Kits Ambiguos en Consultas de Compatibilidad
- **Problema resuelto:** Cuando el cliente pregunta compatibilidad por un término genérico que abarca múltiples combos (ej: *"le va el kit 120 a mi ZB?"*), el bot solía saltarse el Paso 1 y preguntar la variante de carrera (corto/largo) de un solo combo elegido al azar.
- **Mecanismo estructural:** 
  1. `bot-agente/herramientas/compatibilidad.ts` detecta si el kit buscado coincide con múltiples grupos activos (`chat_pack_grupos`).
  2. Si hay más de un combo (ej: Kit 120 común vs Combo Tapa CDI + 120), confirma la compatibilidad de la moto pero instruye al agente a listar las opciones disponibles y preguntar cuál de los combos busca armar (Paso 1).
  3. Queda prohibido indagar variantes de carrera/leva hasta que el combo principal esté seleccionado.


