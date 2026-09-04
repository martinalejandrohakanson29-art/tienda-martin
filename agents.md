# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## 🛠️ Stack & Commands
- **Stack:** Next.js 14, TypeScript, Prisma, React.
- **Package Manager:** npm.
- **Commands:** `npm run dev` (development), `npm run build` (production build), `npm run lint` (code style checks).
- **Testing:** No dedicated test files were found; testing setup needs investigation.

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

### 1. Directorio y Componentes Clave
- `bot-agente/motor.ts`: Núcleo de ejecución del agente. Recibe el mensaje, el historial previo, inyecta contexto temporal de Córdoba Capital y maneja el ciclo de llamadas a herramientas (`tool_calls`).
- `bot-agente/prompts/sistema.ts`: Prompt maestro con la identidad de mostrador cordobés, tono natural, reglas de signos de puntuación, embudo comercial de 4 pasos y guardrails estrictos.
- `bot-agente/herramientas/`:
  - `catalogo-precios.ts`: Consulta packs, combos (`chat_pack_grupos`), variantes y piezas sueltas (`chat_articulos`).
  - `compatibilidad.ts`: Consulta compatibilidad mecánica moto-kit en base a `chat_articulo_compatibilidad`.
  - `info-negocio.ts`: Consulta políticas institucionales (`info_negocio`) con cálculo inteligente de horarios en tiempo real (zona horaria Córdoba).
  - `escalar-humano.ts`: Derivación silenciosa a asesores humanos cuando no hay datos o por temas mayoristas/quejas.

### 2. Filosofía Comercial y Embudo de Mostrador (Regla de Oro)
El bot atiende como un vendedor de mostrador de Córdoba: conciso, buena onda, seguro, sin vueltas ni frases armadas de telemarketing o call center.
- **Puntuación WhatsApp:** NUNCA usar signos de apertura (`¿` ni `¡`). Solo signos de cierre (`?` y `!`).
- **Paso 1 (Identificar la opción):** Si la consulta es ambigua y coincide con varios kits/combos, el bot presenta SOLO las opciones y pregunta cuál busca. PROHIBIDO pedir la moto o dar precios de variantes todavía.
- **Paso 2 (Bienvenida oficial):** Cuando la opción está clara, entrega el mensaje oficial cargado en la app con saltos de línea prolijos, opciones de variantes con precios y la pregunta de variante.
- **Paso 3 (Desambiguar variante - Universal):** Toda pregunta intermedia tiene un solo fin: determinar qué variante de la lista corresponde (sea recorrido corto/largo, color azul/negro, leva corta/larga, etc.). **Teniendo la variante definida, YA NO HAY NADA MÁS QUE AVERIGUAR.** PROHIBIDO seguir preguntando la moto si la variante ya está elegida.
- **Paso 4 (Cierre natural):** Confirma opción, precio final, envío y cierre cálido de mostrador ("Si te interesa avisame y coordinamos!").

### 3. Reglas Críticas para Piezas Sueltas (`chat_articulos`)
- Se activa ÚNICAMENTE si el cliente usa palabras explícitas de separación: *"sola"*, *"solo"*, *"suelto"*, *"separado"*, *"nomás"*.
- Si el bot preguntó qué opción busca y el cliente dice *"tapa cdi"*, **está eligiendo el combo completo**, NO pidiendo la pieza suelta.
- Al informar el precio de una pieza suelta: responder ÚNICAMENTE con su `titulo_comercial` y precio. **CERO volcado de ficha técnica** (prohibido recitar conductos, cielo, alzada, si cambia resortes, etc., a menos que pregunten una duda técnica puntual).
- Solo se pueden ofrecer piezas sueltas del kit del que se viene hablando en la conversación.

### 4. Horarios y Ubicación Espacio-Temporal
- `bot-agente/herramientas/info-negocio.ts` evalúa la hora y día actual en `America/Argentina/Cordoba`.
- Si el cliente pregunta por "hoy" o "ahora" (*"hasta qué hora están hoy?"*, *"están abiertos ahora?"*), el bot responde primero la situación puntual de hoy en tiempo real (ej: *"Hoy ahora estamos hasta las 19 hs!"* o *"Hoy a la tarde abrimos de 16 a 19 hs"*), y luego puede sumar los horarios generales.

### 5. Pautas de Testing y Desarrollo
- **Simulador:** Probar siempre en la interfaz `/admin/chatwoot/simulador`.
- **Scripts de prueba en consola:** NUNCA ejecutar inline `npx tsx -e "..."` en PowerShell (suele trabarse esperando stdin). Crear siempre un archivo `.ts` en `scratch/`, desconectar Prisma con `await prisma.$disconnect()` y finalizar con `process.exit(0)`.
- **Compilación obligatoria:** Antes de dar por terminado cualquier cambio, ejecutar `npx tsc --noEmit` y verificar que arroje 0 errores.

