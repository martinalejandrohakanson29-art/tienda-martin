# Bot de WhatsApp (Chatwoot + n8n) — contexto completo

> Este documento reemplaza toda la documentación dispersa anterior (auditorías de
> `workflow_mateo`, notas de migración, etc.). Están en el historial de git si hace falta
> desenterrar algo puntual, pero para entender el estado actual **alcanza con este archivo**.
> Actualizalo cuando cambie algo importante — la idea es que una conversación nueva pueda
> arrancar leyendo esto, sin tener que repetir toda la explicación de cero. **Hacelo de forma
> compacta**: 3-5 líneas por fix (qué se rompía / causa / fix / gotcha nuevo si lo hay), sin
> transcribir la investigación paso a paso ni citar conversaciones reales textuales — ese nivel de
> detalle infla el archivo con el tiempo (pasó una vez, ver la nota de poda de abajo) y una
> conversación nueva no lo necesita para seguir trabajando.
>
> Para una vista visual del árbol de decisión completo (qué pasa con cada mensaje entrante,
> según lo que dice), ver `rutas-bot-chatwoot.html` en esta misma carpeta — se puede abrir tal
> cual en el navegador. Igual que este `.md`, tiene que actualizarse en el mismo commit que
> cualquier cambio real al workflow (nodo nuevo, rewire, nodo eliminado); si el diagrama y el
> workflow real se desincronizan, dejó de servir.
>
> **2026-08-20: este archivo se podó** (de 1441 a este tamaño) para que no pese tanto leerlo en
> cada conversación nueva. El changelog de fixes viejos se comprimió a lo esencial (qué se
> rompía / causa / fix), los casos reales que quedaron sin contestar ya fueron atendidos a mano y
> se sacaron de "pendiente", y las entradas que ya tenían el detalle completo en la memoria del
> proyecto (`[[nombre]]`) se dejaron como referencia corta en vez de repetir la narrativa. Ningún
> gotcha técnico de n8n se perdió — están todos en la sección de gotchas más abajo.

## Cómo hablar de esto con el usuario (Martín)

- **No es técnico.** Explicá todo en criollo, sin asumir que conoce n8n, SQL, o jerga de
  desarrollo. Si hace falta un término técnico, acompañalo de una explicación simple en la
  misma frase.
- **Le gusta pensar antes de construir.** El patrón que funciona bien: charlar la idea a fondo,
  entender las implicancias juntos, y recién ahí — con su OK explícito — pasar a implementar.
  No asumas que "aprobar el plan" significa que ya se puede tocar producción sin avisar en cada
  paso grande.
- **Prioridad número uno: simplicidad por sobre todo.** El motivo de fondo de todo este
  rediseño (ver más abajo) es que el workflow viejo (`workflow_mateo`) se volvió tan grande y
  enredado que cualquier arreglo rompía otra cosa. Cuando dudes entre una solución simple y una
  más "inteligente" pero compleja, para este proyecto la simple gana casi siempre — salvo que
  él pida explícitamente lo contrario.
- **El bot nunca debe demostrar que es IA, ni mostrar duda.** Siempre habla en primera persona
  como si fuera el dueño/vendedor del negocio ("tenemos este kit", "somos de tal dirección").
  Cuando el bot no sabe algo y hace falta que un humano intervenga, eso pasa **siempre en
  silencio** para el cliente — nunca un mensaje tipo "ya te confirmo" o "dejame consultarlo".
- Sin alarma sonora para avisar de pendientes por ahora — se acumulan en el panel
  `/admin/chatwoot/pendientes` y listo.

## La historia, resumida

- El bot original (`workflow_mateo`, un workflow de n8n de 257 nodos) fue creciendo a los
  parches durante semanas hasta volverse inmanejable: cada fix destapaba un bug nuevo en otro
  lado ("carrera contra errores"). El 2026-08-12 se decidió no seguir parchando y arrancar un
  workflow nuevo desde cero.
- Nació **"Respuestas chatwoot 2.0"** (n8n, id `s7EpPTjNFy6iCclg`), con una filosofía
  deliberadamente distinta: caminos rápidos y deterministas primero, IA solo en pasos chicos y
  acotados (ver "Filosofía de diseño" abajo). El mismo día se activó en producción y se pausó
  `workflow_mateo` (queda inactivo, se conserva como referencia — no se toca ni se borra, todavía
  se le portan piezas de tanto en tanto).
- Un caso real (cliente Emanuel Reta, conversación 1875, preguntó 3 veces por un repuesto puntual
  y nunca recibió respuesta) destapó que el 2.0 todavía no tenía manejo para nada que no fuera
  "plantilla exacta de kit" o "saludo puro" — todo lo demás cae en un nodo que no hacía nada. De
  ahí salió la ronda de mejoras documentada abajo.

## Cómo llegan los mensajes (importante para no reinventar la rueda)

La mayoría de las conversaciones **no arrancan con un mensaje libre**: nacen de un anuncio de
Instagram/Meta Ads, donde marketing le asigna a cada kit un texto fijo ("¡Hola! Quiero conocer
más sobre el combo 110 a 120 + Codo y carbu!!"). Cuando el cliente toca el botón de WhatsApp del
anuncio, ese texto llega tal cual como primer mensaje — no es lenguaje natural ambiguo, es casi
un código de campaña. Por eso el matching por **plantilla exacta** (comparación literal de texto,
sin IA) cubre records ~80% de las conversaciones sin necesitar entender nada. Esa pieza no se
toca — es la base de todo lo demás.

## Arquitectura actual del workflow "Respuestas chatwoot 2.0"

Orden real del procesamiento de un mensaje entrante:

1. **Auth + filtros básicos** (token del webhook, solo mensajes creados, solo entrantes, chequeo
   de bot pausado/horario).
2. **Agrupado por ráfaga**: si un cliente manda varios mensajes seguidos, se juntan en uno antes
   de procesar. Mecanismo: Redis (`INCR seq2:{teléfono}`) + esperar **90 segundos** desde el
   último mensaje (se estira solo con cada mensaje nuevo, no es una ventana fija desde el
   primero). Nodo: `Esperar Rafaga (45s)` — el nombre quedó desactualizado, el valor real está en
   `parameters.amount = 90`.
3. **Clasificador rápido, sin IA** (`Clasificar Mensaje (sin IA)`): compara el **primer mensaje**
   de la ráfaga (no el texto completo agrupado) contra las plantillas exactas de
   `kits_publicidad` y detecta saludo puro. Si no matchea ninguna de las dos → `sin_match`.
4. **Si matcheó un kit**: manda el saludo/foto del kit (con los dos precios si el kit los tiene
   ambiguos, ver Fase 10 abajo) y lo "pinea" en Redis (`kit_pineado:{teléfono}`, TTL 96hs) para
   que las siguientes preguntas de esa conversación sepan de qué kit se está hablando. Si además
   de la plantilla vino texto de más en la misma ráfaga, un paso de IA acotada
   (`Validar Continuidad de Tema`) decide si sigue siendo del mismo kit o es tema distinto antes
   de pinear (ver Fase 10).
5. **Si hay un kit pineado y el mensaje no matcheó nada nuevo**: se chequea con IA acotada si es
   pregunta de compatibilidad, cilindrada sola, o pedido de stock — cada una con su propio camino
   determinista de resolución (ver Fase 6/9/17-ago abajo). Si no hay dato, escala al equipo.
6. **Sin kit pineado y sin match de plantilla/saludo**: `Identificar Necesidad` (IA, lee el
   historial reciente) intenta pinear un kit desde lenguaje natural antes de caer en el partidor
   de sub-preguntas genérico. Ver la entrada "Identificar Necesidad" abajo — acá es donde vale la
   pena leer el resto de este documento para cualquier caso que no sea plantilla exacta.

## Cómo se armó (arquitectura base, cronológico)

- **Fase 1-4** (2026-08-12/13): pineo de kit + compatibilidad, escalado al equipo con
  aprendizaje, pausa de conversación cuando responde un humano (Redis `bot_pausado:{conv}`, TTL
  30 días).
- **Fase 5**: tabla `preguntas_sin_match_pendientes` (`escalado-sin-match.sql`) para guardar lo
  que no se puede resolver automáticamente.
- **Fase 6 — el partidor de sub-preguntas**, el corazón de todo lo que no es plantilla exacta:
  cuando cae en `sin_match`, un paso de IA acotada (nunca redacta, solo separa y etiqueta) parte
  el mensaje en categorías — `precio`, `envio`, `negocio`, `otro`, y más tarde se sumaron
  `cierre` y `stock` (ver abajo). Cada una se resuelve contra datos ya cargados
  (`kits_publicidad`, `info_negocio` vía `rm_score`, o `conocimiento_libre` lo ya enseñado) y se
  redacta con otro paso de IA acotada que **nunca inventa, solo redacta el dato que ya se
  encontró**. Lo que no se resuelve escala en silencio con protección anti-duplicado por
  conversación. `Parsear Sub-preguntas` (el Code node que interpreta la salida de la IA) tiene su
  propia lista blanca hardcodeada de categorías válidas — **cualquier categoría nueva que se
  agregue al prompt también hay que agregarla ahí**, si no se pisa en silencio a `'otro'` (ver
  gotcha, encontrado con la categoría "cierre").
- **Fase 7**: cuando el equipo contesta una escalada de sin_match (nota privada en Chatwoot), se
  interpreta con IA acotada, se manda al cliente con la voz del bot (nunca revela que hubo un
  humano), se marca como respondida, y se guarda en `conocimiento_libre` para la próxima.
- **Fase 8** (`app/admin/chatwoot/pendientes/`): panel de pendientes con 4 categorías.
- **Fase 9** (2026-08-13): fix de pausa falsa (una nota que respondía sin_match no debía pausar
  el bot solo porque la rama de compatibilidad no encontraba nada) + nota privada de aviso cuando
  llega un mensaje con el bot ya pausado. Quedó anotado como riesgo aceptado que Fase 7 "duplica
  el camino del equipo" en vez de unificarlo con la rama técnica — **se terminó materializando en
  un caso real y se resolvió el 19/08** (ver "cruce compat/sin_match" abajo).
- **Fase 10 — continuidad de plantilla con resto** (2026-08-13): el matching de plantilla exacta
  compara solo el primer mensaje de la ráfaga (antes comparaba el texto completo agrupado, y se
  rompía si el cliente agregaba algo en un segundo mensaje). Si hay resto, `Validar Continuidad de
  Tema` decide mismo-tema (se resuelve en el mismo turno) o tema-distinto (ante la duda, esto —
  escala normal, sin pinear nada). Ver [[project-chatwoot-fase10-continuidad-plantilla]].
- **Identificar Necesidad — pin de kit desde lenguaje natural** (2026-08-17): la única forma de
  pinear un kit era el match letra por letra con la plantilla de Meta Ads; cualquier conversación
  que arrancaba distinto nunca pineaba nada (~20% de los pendientes eran este patrón). Ahora,
  cuando no hay pin ni match, `Identificar Necesidad` (IA, ve el mensaje + ~8 mensajes de
  historial real + la lista cerrada de kits activos) devuelve `saludo` / `kit_confiado` (pinea +
  bienvenida) / `candidatos` (repregunta nombrando opciones) / `ninguno`. El parser revalida
  cualquier id contra la lista real de kits — nunca confía un id inventado por el modelo.
- **Repreguntar Modelo** (2026-08-18): si el cliente contesta solo la cilindrada ("110") sin
  marca/modelo, en vez de escalar en el balde genérico "otro", se manda una repregunta corta
  pidiendo marca+modelo (nunca confirma ni descarta compatibilidad). Estilo de las preguntas del
  bot: solo signo de cierre "?", nunca el de apertura "¿" — ver
  [[feedback-bot-preguntas-sin-apertura]] (pendiente aplicar el mismo estilo al resto de prompts
  que redactan preguntas, listados ahí).
- **Categoría "cierre"** (2026-08-18): comentarios afirmativos que no piden nada ("dale",
  "gracias", "a la tarde me llegó") se contestan con un texto fijo corto en vez de escalar con
  una nota engañosa. Exclusión a pedido de Martín: cualquier intención de pago/reserva/retiro
  sigue como "otro" y escala normal. Redis (`cierre_reciente:{tel}`, TTL 24hs) evita repetir el
  mismo texto fijo dos veces en la misma charla (fix 19/08, ver
  [[fix-bot-cierre-repetido-envio-ambiguo]]).
  - **Fix falso positivo "cierre" (2026-08-21):** encontrado por Martín como patrón recurrente en
    varias conversaciones reales (ej. conv 1036, conv 2318) — frases que CONTESTAN algo que el bot
    preguntó ("Recorrido corto es la mia") o dan contexto del mismo pedido activo ("Soy mecánico")
    se etiquetaban "cierre" y disparaban "Dale, cualquier cosa nos escribís." sin sentido, a veces
    justo al lado de algo que se estaba escalando en silencio en la misma ráfaga (señal
    contradictoria para el cliente). Dos fixes juntos: (1) prompt de `Dividir y Etiquetar
    Sub-preguntas` ahora excluye explícitamente esos dos casos, con los ejemplos reales; (2)
    `Armar Mensajes` (Code, determinístico) ya no manda el "cierre" si en la misma ráfaga queda
    algo sin resolver, sea cual sea la clasificación — red de seguridad además del prompt. Probado
    en vivo replicando el caso real (mismo texto de conv 1036): las 3 partes del mensaje quedaron
    "otro" (antes 2 de 3 caían "cierre"), escalaron juntas en una sola nota, cero "Dale, cualquier
    cosa..." disparado.
  - **Tercer caso del mismo bug (2026-08-21, más tarde):** encontrado reprocesando pendientes
    viejos (ver "Barrido de reprocesamiento" más abajo) — "Nevada era perdón" (el cliente corrige
    el modelo de moto que había dicho antes, tras la repregunta "sos seguro que es la 110?")
    también caía "cierre" en vez de "otro". Mismo prompt, mismo patrón: se sumó como tercer
    ejemplo explícito junto a los otros dos. Confirmado en vivo contra la conversación de prueba:
    el mismo texto que antes disparaba el cierre genérico ahora escala en silencio como "otro".
  - **Fix de fondo (2026-08-21, más tarde todavía) — el nodo ahora ve nuestra última pregunta,
    ya no adivina a ciegas:** cuarto caso real (conv 2335, +5493447558519): el bot preguntó "¿Te
    referís al Kit 120 para 110, a la Tapa cdi, o al combo de ambos?" y el cliente contestó
    "Sisi" — cayó "cierre" de nuevo y mandó el "Dale, cualquier cosa nos escribís." a mitad de
    una desambiguación sin resolver. Los 3 parches anteriores (sumar ejemplos al prompt) no
    alcanzaban porque `Dividir y Etiquetar Sub-preguntas` nunca recibía el historial — el prompt
    le pedía "detectar si el cliente está contestando algo que preguntamos antes" sin darle ese
    dato, así que solo podía reconocer las frases ya vistas como ejemplo. Se agregaron 2 nodos
    (`Traer Ultimo Mensaje Nuestro` HTTP + `Extraer Ultimo Mensaje Nuestro` Code, mismo patrón de
    llamada que `Traer Historial Conversacion`) que traen el último mensaje saliente real de la
    conversación y se lo pasan a `Preparar Contexto Sub-preguntas` → el prompt de `Dividir y
    Etiquetar` ahora tiene una regla general (no una lista de ejemplos): si nuestro último mensaje
    terminaba en pregunta y el cliente le responde de cualquier forma -- aunque sea ambigua, tipo
    "sí" sin elegir opción -- nunca es "cierre". Cubre cualquier frase nueva, no solo las ya vistas.
    **Gotcha nuevo de n8n encontrado acá** (ver sección de gotchas): la primera versión conectó
    estos 2 nodos en paralelo desde `Unir Mensajes`, referenciados solo por `$('Nodo').first()` —
    corrieron, pero AL FINAL de la ejecución (n8n no los priorizó por no tener nada wireado río
    abajo), después de que `Preparar Contexto Sub-preguntas` ya los había consultado y encontrado
    vacíos. Fix: sacar esa conexión en paralelo e insertar los 2 nodos EN SERIE en las 3 ramas que
    ya alimentaban a `Preparar Contexto Sub-preguntas` (mismo patrón de convergencia de varias
    ramas que ese nodo ya usaba) — así el orden queda garantizado sin importar cuál de las 3
    dispare. Validado en vivo repitiendo el caso real (mismo mensaje de desambiguación + "Sisi" en
    la conversación de prueba): primera versión mantuvo el bug (contexto vacío, "cierre"),
    segunda versión clasificó "otro" y escaló en silencio, sin mandar nada al cliente.
- **Categoría "stock"** (2026-08-18): como todo lo publicitado con plantilla de Meta Ads está en
  stock por definición, cualquier pregunta de disponibilidad se contesta "Sí, tenemos stock."
  directo, sin escalar nunca.
- **Consulta mayorista de número nuevo → nota silenciosa, sin respuesta (2026-08-28).** Antes: solo
  los teléfonos ya cargados en `NumerosMayoristas` se ignoraban (nodo `Chequear Es Mayorista` al
  frente); un mayorista nuevo ("me pasás lista por mayor") caía en `sin_match` y escalaba como
  "algo que no ubicamos" (caso real +5493888456092, conv 2953). Fix: nodo `¿Consulta Mayoreo? (sin
  IA)` justo después de `Unir Mensajes` (ve toda la ráfaga) — si el texto contiene `mayorista` /
  `mayoreo` / `por mayor` / `x mayor` / `revende` / `reventa` / `distribuidor` → `Preparar Nota
  Mayorista` → `Enviar Nota Mayorista` (privada, misma mecánica que las escaladas) → `Fin -
  Mayorista Detectado`. El cliente **no recibe nada** (ni la bienvenida del kit si venía pegada en
  la misma ráfaga). Los números ya conocidos siguen igual (ignorados sin nota). 4 nodos, 423→427.
- **Bienvenida con foto en vez de confirmación de texto** (2026-08-18) — **diseño vigente hoy**:
  cuando `Identificar Necesidad` confirma un kit por lenguaje natural, en vez de un texto corto
  de confirmación manda la misma bienvenida con foto que ya usan las plantillas exactas (un solo
  mensaje rico, con los dos precios si aplica). Como ya trae el precio y ya pregunta la moto, la
  categoría "precio" del partidor y la "Repreguntar Modelo" se suprimen cuando la bienvenida se
  acaba de mandar en esa misma ejecución. Esto reemplazó por completo un mecanismo de
  "confirmación de texto" más viejo (nodos borrados) que tuvo su propio fix de orden el mismo
  día — queda solo como historia de por qué se llegó a este diseño, no como estado vigente.
- **Migración de los 11 nodos de IA de DeepSeek a OpenAI GPT-5.6** (2026-08-19): los 7 nodos de
  clasificación/extracción pasaron a `gpt-5.6-luna`, los 4 de mayor riesgo (compatibilidad,
  redacción cara al cliente, detalle) a `gpt-5.6-terra` — misma credencial OpenAI que ya usaba
  `Transcribir Audio`. Nombres de nodo sin cambiar a propósito (siguen como "DeepSeek Chat Model -
  \*") para no recablear conexiones. Dos gotchas de esta migración están en la sección de gotchas
  abajo (Agent v2 + `temperature` en modelos de razonamiento). **Sin validar todavía con casos
  variados si la calidad de redacción es equivalente a DeepSeek** — si algo suena raro en el tono
  de una respuesta a partir del 19/08, puede ser esto y no un bug de prompt.
- **Árbol de artículos, capa 1** (2026-08-19): el bot solo entendía **kits** (combos), nunca
  **artículos** sueltos dentro de un combo — un cliente pidiendo una pieza suelta o excluyendo una
  pieza del combo se malinterpretaba. Se cargó la base (tabla `kit_articulos` con `alias` propio,
  admin en `/admin/chatwoot/conocimiento`, datos reales del Kit 8) pero **el workflow de n8n
  todavía no toca esto — falta diseñar el paso de matching**. Detalle completo, decisiones de
  diseño (frase de alcance vs. palabra pelada, alias ambiguo entre 2 artículos) y estado de datos
  en [[project-chatwoot-arbol-articulos-idea]] — no repetido acá para no duplicar.
- **Unificar el "resto de la ráfaga" de los grupos en la máquina de sub-preguntas — PUT 1
  (2026-08-31).** Plan completo en `PLAN-unificar-resto-grupos.md`. Patrón que Martín marcó como
  recurrente: cliente entra por plantilla de un **grupo** + pega una pregunta simple ("Precio?",
  "es para recorrido corto?") → el resto se asumía siempre como la moto (`Extraer Modelo Grupo`)
  → no encontraba moto → escalaba al equipo, para un dato que ya está en la bienvenida (convs
  reales 3044, 3021, 2981; execs 91126/91089). Causa: los grupos mientras esperan la moto no
  tienen ningún paso que se pregunte "¿esto es una moto, o precio/negocio/cierre?" — esa lógica
  solo la tenía el kit simple (partidor Fase 6). **PUT 1 = solo el estado `esperando_moto`**: la
  rama `¿Otro Kit en Resto? (Grupo)` (false) ya no va directo a `Extraer Modelo Grupo`, entra a
  la máquina (`Traer Ultimo Mensaje Nuestro` → ... → `Parsear Sub-preguntas`). Cambios: categoría
  nueva `moto` en `Dividir y Etiquetar` (solo cuando `esperando_moto_grupo`; `precio`/`stock`
  también válidos ahí aunque `kit_id` sea null); `Preparar Contexto Sub-preguntas` expone
  `es_grupo`/`estado_grupo`/`esperando_moto_grupo`/`bienvenida_fresca`/`grupo_bienvenida_texto`/
  `grupo_repregunta_texto`; `Parsear Sub-preguntas` rama grupo (precio/stock/envío → bienvenida
  fresca: silencio / vieja: `reenvio_bienvenida`; `otro` → fresca: silencio, vieja: intenta el
  extractor de modelo; negocio → máquina + repregunta la moto; pedazo `moto` → `ruteo_moto=true`);
  `Consolidar`/`Marcar Resuelto` resuelven las 2 categorías nuevas (se mandan TAL CUAL, sin
  reescritura IA); nodo nuevo `¿Rutear al Extractor de Modelo? (Grupo)` (If) entre
  `Parsear Sub-preguntas` y `Separar Pedazos`. Script: `apply-put1-resto-grupo-maquina.mjs`
  (431→432 nodos). Validado en vivo (conv 2411): "Precio?" pegado → silencio (bienvenida ya salió);
  "cual es el precio" al otro día → reenvía la bienvenida; "es para recorrido corto?" pegado →
  silencio; "para una zanella zb 110" → extractor → compatibilidad OK; "están en Córdoba?" →
  contesta + repregunta la moto. Ver [[project-chatwoot-grupo-vs-kit-simple-drift]].
- **PUT 2 (2026-08-31, versión ACOTADA).** La versión amplia (recablear las 3 cascadas restantes
  a la máquina) se descartó: son demasiado poco uniformes (3 prompts distintos, 3 parsers, 3
  re-preguntas, contadores propios) y el riesgo no compensaba. En su lugar, un fix quirúrgico:
  **una pregunta de precio del combo en un grupo esperando corto/largo ya no escala (ni se
  ignora) — contesta con la línea de precio del grupo.** Cambios: los 3 nodos
  `Extraer Tema Negocio (Grupo)/(Variante)/(Esperando Variante)` reconocen una categoría/flag
  nueva `precio`; los 3 `Parsear Tema Negocio (*)` exponen `es_precio` + `precio_texto` (armado
  desde `chat_pack_grupos.variantes[].precio` + `criterio_variante`; si el grupo no tiene 2
  variantes con precio, `es_precio` vuelve a false → camino normal); nodo nuevo `¿Es Precio? (X)`
  (If) entre `Parsear Tema Negocio (X)` y `¿Es Negocio? (X)`; nodos compartidos
  `Enviar Precio Grupo` (HTTP) + `Fin - Precio Grupo Enviado`. Script
  `apply-put2-precio-grupo-no-escala.mjs` (432→437 nodos). Rollback: versión n8n
  `62670389-2ef1-4e3b-bc2e-719bc296225d`. Validado en vivo (conv 2411): burst "plantilla Tapa CDI
  + moto + cuanto sale" → tras confirmar compat y preguntar corto/largo, manda "El Tapa cdi sale:
  Recorrido corto $175.000 / Recorrido largo $189.000..." (antes **escalaba**); "y cuanto sale?"
  con el grupo ya esperando corto/largo → misma respuesta (antes lo **ignoraba** y re-preguntaba).
  **Nota:** las ramas `(Grupo)` y `(Variante)` del fix son mayormente red de seguridad — PUT 1 ya
  intercepta casi todo "precio?" en esos caminos; la que arregla un bug real es
  `(Esperando Variante)`.
- **PUT 2b (2026-08-31) — cierre de pendientes.** (a) **Tope de reintentos** en el camino nuevo
  de PUT 1: si el cliente pregunta cosas en un grupo `esperando_moto` y nunca da la moto, el bot
  le contestaba (precio / bienvenida / negocio) + re-preguntaba la moto **sin límite**. Ahora
  contador en Redis (`resto_grupo_intentos:{tel}`, TTL 24h): tras 3 "nudges" (reenvío bienvenida /
  repregunta moto), la 4ta vez **escala al equipo** (categoría `escalar_grupo` en
  `Parsear Sub-preguntas` → la máquina la deja sin resolver → nota privada). Nodos nuevos:
  `Leer Reintentos Resto (Grupo)` (Redis GET, en el front-chain), `¿Nudge Resto Grupo? (contar)`
  (If) + `Sumar Reintento Resto (Grupo)` (Redis INCR, side-effect). (b) **Dedup de precio (PUT 2):**
  si las 2 variantes de un grupo tienen el mismo precio (Escape pwr + Leva, ambos $125.000), la
  línea muestra "sale $X" una vez en vez de repetir el número. Script
  `apply-put2b-tope-reintentos-y-dedup-precio.mjs` (437→440). Rollback: versión n8n
  `cb6d0475-333e-4f4e-bf21-e67ffa4bd9fe`. Validado en vivo (conv 2411): regresión PUT 1 (Precio?
  pegado → silencio) sigue OK; contador 0→1→2 con cada "cual es el precio"; al leer 3 →
  `escalar_grupo` → nota "El cliente preguntó algo que todavía no supimos ubicar".
- **PUT 3 (borrar las ~35 caseras) — DESCARTADO (2026-08-31).** Tras PUT 1/2/2b ninguna casera
  quedó huérfana: siguen siendo el mecanismo de los estados 2/3/4 y PUT 2 les metió adentro el
  camino de precio. "Borrarlas" = primero re-rutear esos 3 estados a la máquina (la versión amplia
  ya descartada). Las caseras se quedan. Ya no escalan info conocida ni loopean sin fin. Detalle
  en `PLAN-unificar-resto-grupos.md`.
- **Compra diferida = "cierre", ya no escala (2026-08-31).** Caso real conv 3033
  (+5493854560850): tras confirmar compatibilidad y precio del combo Tapa CDI + Cilindro 120, el
  cliente dijo **"junto plata y compro"** y el bot lo escaló con la nota engañosa *"preguntó algo
  que todavía no supimos ubicar"* (no preguntó nada — avisó que va a comprar más adelante). Causa:
  el prompt de `Dividir y Etiquetar Sub-preguntas` mandaba "cualquier cosa sobre
  pagar/reservar/retirar" a `otro` → sin dato → escala. Fix (2 ediciones de texto, sin nodos):
  (1) systemMessage de `Dividir y Etiquetar` — se parte esa regla: intención de pago/reserva/retiro
  **inmediata o que pide acción/dato ahora** ("te hago la transferencia", "pasame el cbu", "quiero
  reservarlo", "paso a buscarlo mañana") sigue en `otro` (escala); **aviso de compra a futuro sin
  pedir nada** ("junto plata y compro", "cuando cobre lo compro", "la semana que viene lo llevo")
  pasa a `cierre`. (2) `Consolidar Dato Resuelto` — el texto fijo de `cierre` pasa de "Dale,
  cualquier cosa nos escribís." a "dale bro! cualquier cosa nos escribis y coordinamos.." (aplica
  a TODOS los cierres; el paso de redacción con IA lo entrega pulido, "Dale bro, cualquier cosa
  nos escribís y coordinamos."). El anti-bucle `cierre_reciente:{tel}` (TTL 24h) ya existente evita
  que un "dale ok" posterior dispare otra respuesta. `Detectar Interes de Compra` (frases tipo "lo
  quiero" → rama "posible venta") NO se tocó, a propósito. Script
  `apply-fix-compra-diferida-es-cierre.mjs` (440 nodos, sin cambio). Rollback: versión n8n
  `210b06ef-56c8-4fe2-a408-10a018d77039`. Validado en vivo (conv 2411): plantilla → moto →
  "recorrido largo" → "junto plata y compro" → respondió el cierre, sin nota de escalado.
- **Grupo esperando la moto: una pregunta de envío ya no se descarta, se contesta (2026-08-31).**
  Caso real conv 3078 (+5493758433040, Gabriel): plantilla del grupo "Combo 110 a 120 + Codo y
  carbu" + "Envian a misiones" pegado. PUT 1 mandaba el resto a la máquina, `Dividir y Etiquetar`
  lo clasificaba bien `envio`, pero `Parsear Sub-preguntas` (rama grupo `esperando_moto`,
  bienvenida fresca) lo **descartaba** junto a precio/stock, asumiendo que "Envío gratis a todo
  el pais" de la bienvenida ya lo cubre. La gente casi siempre pregunta puntual ("mandan a
  Misiones?", "llegan a mi pueblo?") y esa línea fija no lo contesta. Fix (1): `envio` sale del
  bloque precio/stock y pasa a tener **el mismo trato que `negocio`** — se responde siempre
  (kit_id null → cae al fallback `Buscar Info Negocio (Envio General)`); si la bienvenida no es
  fresca, además re-pregunta la moto y cuenta para el tope de 3 reintentos (PUT 2b). precio/stock
  siguen igual (silencio si la bienvenida es fresca). Solo toca `Parsear Sub-preguntas`, 4
  reemplazos de texto, sin nodos ni rewiring. Script
  `apply-envio-no-descarta-grupo-esperando-moto.mjs` (440 nodos, sin cambio). Fix (2), destapado
  en la validación: `Buscar Info Negocio (Envio General)` servía la fila `info_negocio` tema
  "Datos para envío" (id 13, el formulario NOMBRE/DNI/DOMICILIO post-venta) en vez de "envios"
  (id 10, la política real) — `rm_score` matcheaba las dos y el `ORDER BY creado_en DESC` prefería
  la más nueva. Ahora ordena por mejor match (`rm_score(tema,'envios') + rm_score('envios',tema)
  DESC` antes que fecha). Es el único nodo que consulta con 'envios' hardcodeado, así que también
  arregla la máquina de sub-preguntas genérica (un "hacen envíos?" sin kit daba el mismo form).
  Script `apply-envio-general-elige-fila-envios.mjs`. Rollback: versión n8n
  `a27e2609-04c1-4df8-9ac3-7d7c074264e6` (pre fix 1: `4deb07fd-7ff4-45db-838c-0d80b93684a1`).
  Validado en vivo (conv 2411): plantilla grupo + "mandan a misiones?" → bienvenida + "Hacemos
  envíos a todo el país por Andreani a domicilio y por Vía Cargo a sucursal…" (antes: silencio,
  después del fix 1 sin el 2: el form de datos); regresión "cuanto sale?" pegado → sigue en
  silencio. **Gotcha nuevo:** el GET de la API de n8n (`/workflows/{id}`) pasa por un proxy que
  cachea por URL y llega a servir una versión de **días** atrás (devolvía 371 nodos / 08-25 en vez
  de 440). Hay que mandar un cache-buster único en la query (`?_cb=<timestamp>-<random>`) y
  chequear `nodes.length` antes de confiar en la respuesta (los scripts `apply-*` de esta fecha
  ya lo hacen).
- **Repregunta de "candidatos" sin moto: mensaje genérico + tope de reintentos (2026-08-31).**
  Caso real conv 3082 (+5493517913933, "leito"): imagen + "queria ese kit y mas una leva" (sin
  nombrar moto) → `Identificar Necesidad` = `candidatos` y el bot contestaba **enumerando los 2-3
  nombres internos de kit** ("¿Te referís al kit 170 varillero + leva, al combo escape pwr + leva
  6.40 o al kit 120 para 110?") — cuanto más larga la lista, más engorroso, y esos nombres no son
  los que el cliente vio en la publicidad. Fix (1): `Parsear Identificar Necesidad` para `candidatos`
  ya no arma la lista — `mensaje` es un **texto fijo** (sin IA, sin "¿" de apertura): *"Tengo varios
  kits parecidos. Decime para qué moto es y qué kit estás buscando, así te confirmo cuál es y te paso
  el precio."* (systemMessage del agente ajustado para que devuelva `mensaje: ""`). Pide las 2 cosas
  que el bot necesita igual. Fix (2): el camino "el cliente NO dijo la moto"
  (`¿Hay Modelo Mencionado (Candidatos)?` = false) gana un **tope**: contador Redis
  `repregunta_candidatos_intentos:{tel}` (TTL 24h) — tras 2 repreguntas sin aclarar, escala UNA vez
  al equipo (nota privada + fila en `preguntas_sin_match_pendientes`), flag `candidatos_escalado:{tel}`
  para no repetir la nota (mismo patrón que el tope de la rama variante). El camino "SÍ dijo la moto"
  (reduce por compatibilidad) queda **intacto**. Script
  `apply-repregunta-candidatos-generica-y-tope.mjs` (+10 nodos, 440→450). Rollback: versión n8n
  `5bf2e300-d468-4d43-bb2d-10a10d553da7`. Validado en vivo (conv nueva 3095, forzando `candidatos`
  con "el kit 170 varillero o el combo escape pwr, no se cual llevar"): 1ª y 2ª vaga → mensaje
  genérico nuevo; 3ª → nota privada "El cliente pidió algo que puede ser uno de varios kits
  parecidos…", cero mensaje al cliente. **Gotcha:** forzar `candidatos` con mensajes sintéticos es
  poco fiable (el LLM tira `ninguno` o `kit_confiado` seguido) — hizo falta nombrar 2 kits explícitos.
  Ver [[project-chatwoot-grupo-vs-kit-simple-drift]].
- **Kit/grupo esperando corto/largo: una consulta pegada en la ráfaga ya no se descarta
  (2026-09-01).** Mismo bug que el de conv 3078 (grupo esperando la moto), pero en la rama gemela
  del **kit simple esperando la variante**. Caso real conv 3153 (+5492625419260, "Joacoo"): Kit 120
  pineado esperando corto/largo, el cliente mandó "no sé, tendría que averiguarme" + "soy de Gral
  Alvear Mza, cuántos días tarda?" pegado. `Resolver Variante` devolvió `espera_respuesta:true` →
  `¿Cliente Va a Responder Luego? (Variante)` [true] iba **directo al silencio**
  (`Fin - Cliente Avisó Que Responde (Variante)`), descartando la pregunta de envío. Sin respuesta,
  sin nota. Ejecución n8n #92969. Fix: esa rama true ahora pasa primero por un mini-clasificador
  (5 nodos nuevos, 450→455: `Extraer/Parsear Consulta Pegada (Espera Variante)` + 3 If
  `¿Consulta Pegada: Precio?/Negocio?/Otro?`) que reusa el prompt/parser de
  `Extraer/Parsear Tema Negocio (Esperando Variante)` (el modelo `DeepSeek Chat Model - Tema
  Negocio (Esperando Variante)` alimenta los dos agentes) y termina en los nodos que ya existían:
  `Enviar Precio Grupo` / `Buscar Info Negocio (Esperando Variante)` / `Registrar Pendiente Negocio
  (Esperando Variante)`. Si el clasificador da "nada" → cae al mismo silencio de hoy. El pin sigue
  esperando la variante, no se toca; el camino "eligió corto/largo" queda intacto. Script
  `apply-fix-consulta-pegada-espera-variante.mjs`. Rollback: versión n8n
  `b267b9b9-29a5-4279-ad67-72f5b29d4975`.
  - **Fix 2, destapado en la validación:** `Buscar Info Negocio (Esperando Variante)` servía el
    **formulario** "Datos para envío" (id 13, NOMBRE/DNI/DOMICILIO...) en vez de la política real de
    envíos (id 10) — mismo bug de `ORDER BY creado_en DESC` que ya se arregló en
    `Buscar Info Negocio (Envio General)` el 31/08, pero en este nodo gemelo. Ahora ordena por mejor
    match (`rm_score(tema,tema_sql) + rm_score(tema_sql,tema) DESC` antes que fecha); como usa
    `{{ $json.tema_sql }}` dinámico, sirve para cualquier tema. Script
    `apply-info-negocio-espera-variante-mejor-match.mjs`. Rollback:
    `278468a6-4c42-4508-a545-42385dc10164`.
  - **Validado en vivo** (conv de prueba 2411, vía webhook sintético — cola de n8n lenta, varios
    min por ejecución): plantilla Kit 120 → moto compatible → bot pregunta corto/largo → ráfaga
    "ni idea, tendría que fijarme con el mecánico" + "soy de Córdoba capital, cuánto tarda el
    envío?" → exec 93074: `Resolver Variante` = `espera_respuesta:true` → `Extraer Consulta Pegada`
    = `negocio/envios` → `Buscar Info Negocio (Esperando Variante)` devuelve la política real
    ("Hacemos envíos a todo el país por Andreani…") → mandada al cliente. Antes: silencio total.
    Regresión OK: exec 93039 (cliente real, "estoy trabajando, te digo apenas me desocupe" sin
    consulta pegada) pasó por los nodos nuevos y cayó en el silencio de siempre.
- **Grupo esperando la moto: variante adelantada + pieza pegada que no se descarta
  (2026-09-01).** Caso real conv 3166 (+5492224553988, "Esteban"). Plantilla del grupo "Combo
  110 a 120 + Codo y carbu" → ráfaga: "ando buscando recorrido corto" / "cómo sería la entrega"
  / "consulta leva de calle 6.5 tienen". El bot contestó solo el envío y volvió a preguntar la
  moto; se perdió (a) la elección de variante — cuando diera la moto y confirmara compat, le
  iba a **re-preguntar corto/largo**; (b) "leva de calle 6.5" cayó en `otro`, se fusionó con
  otro pedazo y se descartó sin escalar. Ejecución n8n #93119. Cuatro cambios (script
  `apply-variante-anticipada-grupo-espera-moto.mjs`, 455→459 nodos; rollback versión n8n
  `d96734b7-bdf2-454f-8679-975cbf851e98`):
  1. Categoría nueva `variante` en `Dividir y Etiquetar Sub-preguntas` (solo si
     `esperando_moto_grupo`, igual que `moto`). Cuando el cliente adelanta corto/largo,
     `Parsear Sub-preguntas` lo resuelve a un `pack_id` sin IA (match por `criterio_variante`,
     con fallback a `corto`/`largo`) y lo guarda en Redis (`variante_anticipada:{tel}`, TTL 96h,
     `{grupo_id, pack_id}`) vía el nodo nuevo `Guardar Variante Anticipada (Grupo)` (dead-end
     colgado del If nuevo `¿Capturó Variante Anticipada? (Grupo)`).
  2. Consumo: en la rama "compat OK" del grupo, `¿Es Compatible (Grupo)?` [true] pasa primero
     por `Leer Variante Anticipada (Grupo)` (Redis get) antes de `Resolver Variante Anticipada`;
     `Parsear Variante Anticipada` usa esa clave como fallback cuando la IA no encontró variante
     en el mensaje actual → `¿Variante Anticipada Resuelta?` = true → `Borrar Variante Anticipada
     (Grupo)` → `Marcar Pack Final Pineado` → manda directo la bienvenida del pack, sin
     re-preguntar. El parser valida `grupo_id` + pertenencia del `pack_id` (clave stale de otro
     grupo se ignora).
  3. `Parsear Sub-preguntas` (rama grupo esperando moto): los pedazos `otro` que quedan cuando
     además se está contestando algo (envío/negocio/reenvío) **ya no se descartan** → se suman a
     la salida y escalan al equipo. El camino "`otro`-solo" (chance al extractor de modelo)
     queda igual; el `otro`-solo con bienvenida fresca sigue en silencio.
  4. `grupo_repregunta_texto` (armado en `Preparar Contexto Sub-preguntas`, no en base) saca el
     nombre interno del kit: "…si el Kit 120 para 110 te sirve" → "…si te sirve".
  Se agregaron al workflow "Utilidad - Limpiar Pin de Prueba" las claves `resto_grupo_intentos`,
  `cierre_reciente`, `variante_anticipada`, `repregunta_candidatos_intentos`,
  `candidatos_escalado` (antes solo borraba `kit_pineado`/`incompatible_reciente`/etc.; un
  `resto_grupo_intentos` viejo en 3 arrastró la primera pasada de validación al tope de
  reintentos).
  **Validado en vivo** (conv 2411): plantilla grupo → "ando buscando recorrido corto" +
  "entrega" + "leva 6.5" pegados → contesta envío, escala "leva 6.5", re-pregunta la moto sin
  nombre interno, guarda `variante_anticipada` pack 3 (exec 93184); "ando buscando recorrido
  corto" solo → captura + re-pregunta la moto (exec 93224); "zanella zb 110" (compatible) →
  "Genial, entonces le va perfecto el Kit 120 recorrido corto — $99.000…" + foto, **sin**
  preguntar corto/largo (exec ~93232). Ver [[project-chatwoot-grupo-vs-kit-simple-drift]].
- **Reuso difuso de "conocimiento libre (sin_match)" DESACTIVADO (2026-09-01).** Caso disparador:
  conv 3109 (+5493815420503, "Benja"). Entró por un anuncio cuya plantilla dice "combo 110 a **140**
  + Codo y carbu" (el kit real es "110 a 120") → no matcheó exacto → cayó en el partidor como
  `otro`. `Buscar en Conocimiento Libre (Sin Match)` comparó el texto por parecido difuso
  (`rm_score(clave||pregunta, texto) >= 0.75`, una sola dirección) contra las respuestas viejas del
  equipo y matcheó (score 0.857) la fila 190: otro cliente había pedido un "cubre amortiguador"
  para su "Motomel Blitz 2013". El bot le mandó a Benja esa respuesta — moto y pieza que nunca
  nombró. Ejecución n8n #92533. Auditoría de las 169 filas `sin_match`: ~51 precios sueltos, ~30
  compat sí/no atadas a una moto puntual, ~8 preguntas de una palabra ("?", "110", "Te queda"),
  resto atado al hilo; solo ~14 datos generales reutilizables, y esos ya están en `info_negocio`.
  La premisa misma (matchear mensaje libre contra respuestas viejas y mandarlo casi tal cual) es
  "adivinar" — contra el principio del aliviador. Decisión (Martín): **apagar el reuso + archivar
  la tabla**, en vez de limpiarla + endurecer el match. Cambios (script
  `apply-desactivar-reuso-conocimiento-libre-sinmatch.mjs`, 0 nodos nuevos, 0 rewiring, solo 2
  SQL): (1) `Buscar en Conocimiento Libre (Sin Match)` → query fija `SELECT NULL::text AS respuesta`
  (una fila, para no romper la referencia `$('...').item` de `Consolidar Dato Resuelto`); todo lo
  que no se resuelve por otro lado escala. (2) `Guardar en Conocimiento Libre (Sin Match)` sigue
  insertando (para no cortar el flujo hacia `Marcar Pendiente Sin Match Respondida`) pero en
  categoría `sin_match_archivado`, que nadie lee. (3) `archivar-conocimiento-libre-sinmatch.mjs`
  volcó las 169 filas a `conocimiento-libre-sinmatch-archivado_2026-09-01.json` y las pasó a
  `sin_match_archivado`. El circuito de la Fase 7 (nota del equipo → respuesta al cliente con voz
  del bot → marcar respondida) **no se tocó**: solo se cortó el reuso proactivo. Rollback n8n:
  versión `642cff23-84d1-4787-8838-26c9ef14628f`. Las categorías `precio`/`negocio`/`tecnica` de
  `conocimiento_libre` (las lee otro nodo del partidor) quedan intactas.
- **Regla de compat NEGATIVA atada a una cilindrada ya no bloquea al modelo "pelado" (2026-09-01).**
  Caso real conv 3131 (+5492975288540). Entró por el anuncio del Combo Escape PWR + Leva 6.40
  (grupo 2), dijo "Tengo un motomel blitz" (sin cilindrada) y el bot le dijo *"no es compatible…
  Motor distinto a la Blitz 110 china"*. Causa: en `chat_articulo_compatibilidad` hay, por cada
  pieza del combo, DOS reglas que matchean — `motomel blitz 110 = SÍ` (20/08) y `motomel blitz
  125 = NO` (22/08, cargada a mano por `fix-rm-modelo-ok-conflicto-cilindrada.sql` para un caso
  real de Blitz 125). Como "blitz" pelado no entra en conflicto con ningún número,
  `rm_numeros_conflictivos` no lo bloquea → `rm_modelo_ok` da true para las dos, y el CTE
  `articulo` ordena `compatible ASC` → gana el "NO". Decisión (Martín): **"inclinarse por el
  SÍ"** — una regla negativa con cilindrada explícita SOLO aplica si el cliente nombró esa
  cilindrada. Fix (script `apply-compat-negativa-requiere-cilindrada.mjs`, 0 nodos nuevos):
  (1) función nueva `rm_numero_guardado_no_mencionado(guardado, consulta)` —
  `fix-compat-negativa-requiere-cilindrada.sql` (true ⟺ el lado guardado tiene ≥1 número y
  ninguno aparece en la consulta); (2) en los **4** nodos `Buscar Compatibilidad *` (Kit, Grupo,
  Candidatos, Kit Confiado), el CTE `articulo` gana `AND NOT (compatible = false AND
  rm_numero_guardado_no_mencionado(modelo_moto, '<consulta>'))`. Reglas negativas SIN número
  (wave, biz, crypton sin cilindrada) no se tocan; cliente que SÍ dice "125" tampoco. Regresión
  (248 filas reales × 164 consultas × 3 grupos): único flip a `compatible=true` es "motomel
  blitz" (el bug); otros 3 flips van a `null` → escala al equipo (seguro); 0 filas negativas
  rotas contra sí mismas. Validado contra la query real deployada (grupo 2 / "motomel blitz" →
  `compatible: true`). Rollback n8n: versión `b6524bc3-33f0-496a-b266-14817e9cd4dc`. **Pendiente:**
  contestarle a mano a este cliente (conv 3131) — quedó con el "no" equivocado; probable que su
  Blitz 110 sí sea compatible. Ver [[fix-bot-compat-wave-parser-y-pieza-periferica]] y
  [[project-chatwoot-grupo-vs-kit-simple-drift]].
- **Precio de kit simple: formato $, redacción fija, y no responder por otro kit (2026-09-01).**
  Caso real conv 3151 (+5493584203201, Marcos Morales). Kit 170 pineado por plantilla; el cliente
  preguntó "Y un 190 para una fz16 cuánto me saldria" y el bot respondió *"Te saldría 99990.00."*
  Tres cosas: (1) el precio salía crudo de la base ("99990.00") — el camino de grupos ya formatea
  `$99.990` pero el de kit simple no; (2) la redacción la improvisaba el LLM `Redactar Respuesta
  desde Dato` ("Te saldría…") en vez del molde determinístico que usan los grupos; (3) el
  clasificador marcó "precio" del kit pineado para una consulta sobre **otro** kit y **otra** moto
  → le tiró el precio del 170. Fix (script `apply-precio-kit-simple-formato-y-redaccion.mjs`, 3
  nodos, 0 nuevos): (A) `Buscar Precio Kit Pineado` trae también `k.envio`; `Consolidar Dato
  Resuelto` (rama `precio`) arma el texto final determinístico —
  `"$99.990. Envío gratis a todo el país. Avisame si te interesa y coordinamos."` (la línea de
  envío solo si `k.envio` dice "gratis"), con `Math.round(precio).toLocaleString('es-AR')`. (B)
  `Marcar Resuelto o No Resuelto`: `precio` pasa a `passthrough` (como `reenvio_bienvenida` /
  `repregunta_moto`) → el texto va tal cual, sin reescritura del LLM. (C) `Dividir y Etiquetar
  Sub-preguntas`: la regla de `"precio"` ahora aclara que es SOLO por el mismo kit de la charla;
  otro kit / otra cilindrada / otro producto / algo para otra moto → `"otro"` (si no hay dato,
  escala en silencio), con el ejemplo real. Rollback n8n: versión
  `2af3055f-4223-4ea6-ab52-3944eb440a66`. **Validado en vivo** (conv de prueba 2411, webhook
  sintético): plantilla Kit 170 → "cuanto sale?" → exec 93699 mandó *"$99.990. Envío gratis a
  todo el país. Avisame si te interesa y coordinamos."* (`Consolidar` y `Marcar Resuelto`
  entregaron el texto idéntico, sin pasar por el LLM); "y un 190 para una fz16 cuanto sale?" →
  clasificado `otro`, sin respuesta al cliente, nota privada "preguntó algo que todavía no
  supimos ubicar". **Pendiente:** contestarle a mano a Marcos (conv 3151) — el equipo ya le
  respondió lo del carburador, pero el precio del "190 para fz16" quedó sin confirmar. Ver
  [[feedback-bot-preguntas-sin-apertura]].
- **Cilindrada "pegada" + fila positiva genérica: falso "sí es compatible" (2026-09-01).** Caso
  real conv 3032 (+5493491582103, Elias Nieva): dijo "Corven energy 125" y el bot respondió *"le
  va bien a tu moto"* — la Corven Energy es 110, no existe en 125. Dos causas: (1) `rm_tokens_modelo`
  no reconocía la cilindrada cuando venía pegada a la unidad (`110cc`, `125cc`) → el token quedaba
  `110cc`, no pasaba el filtro `^[0-9]+$` que usan `rm_numeros_conflictivos` /
  `rm_numero_guardado_no_mencionado` → no detectaba el choque `110≠125` (fila `Corven energy 110cc
  Modelo 2016`, o el cliente escribiendo `125cc`); (2) 5 filas positivas cargadas como `corven
  energy` **sin cilindrada** (24/08) → matcheaban cualquier número. **Fix (solo base de datos, 0
  nodos):** (1) `fix-rm-tokens-modelo-cilindrada-pegada.sql` — `rm_tokens_modelo` separa la
  cilindrada de la unidad (`([0-9]+)\s*(cc|cm3|c.c) → \1`) antes de tokenizar; (2)
  `fix-compat-corven-energy-cilindrada.sql` — `UPDATE ... SET modelo_moto = 'corven energy 110'
  WHERE modelo_moto = 'corven energy'` (5 filas). **NO** se tocaron las ~120 filas positivas
  genéricas sin cilindrada de otros modelos (keller, motomel, zanella zb…) — ahí la compat depende
  del modelo a propósito; esos casos siguen manejándose con una fila negativa puntual por incidente
  (Blitz 125 / ZB 125). **Descartado** un guard simétrico al de conv 3131 para filas positivas:
  rompería esas ~120. Regresión: 1540 comparaciones (cada modelo real × sí mismo + 13 consultas),
  3 flips, los 3 correctos (`corven energy 125/125cc` → sin match → escala), 0 self-matches rotos.
  Verificado post-deploy: `corven energy 125` → escala en los 3 grupos; `corven energy` / `corven
  energy 110` / corven mirage / keller / zanella zb intactos. Ver
  [[fix-bot-compat-negativa-cilindrada]] y [[fix-bot-compat-wave-parser-y-pieza-periferica]].
- **Grupo esperando la moto: la plantilla del anuncio ya no se re-lee como consulta de pieza suelta
  (2026-09-02).** Caso real conv 3144 (+5492226443553). Ráfaga: plantilla "COMBO TAPA CDI 125 +
  CILINDRO 120" + "A un motomel 110". PUT 1 clasificó bien (única parte = `moto`), pero el bot mandó
  3 mensajes: bienvenida OK, "compatible + corto/largo?" OK, y **"La tapa viene completa y lista para
  colocar…"** que sobraba. Causa: `Extraer Modelo Grupo` recibía `Unir Mensajes.texto_completo` (toda
  la ráfaga, con la línea de la plantilla) en vez del resto ya aislado → devolvía como `resto_mensaje`
  la propia plantilla → `Responder Articulo Suelto (Grupo - Con Modelo)` la leía como pedido de la
  tapa y `Parsear Articulo Suelto` sólo validaba cuando había `articulo_ids` (texto libre pasaba sin
  control). Fix (script `apply-fix-articulo-suelto-grupo-plantilla-fantasma.mjs`, 3 ediciones de
  texto, 0 nodos): (A) `Extraer Modelo Grupo` usa `Preparar Contexto Sub-preguntas.texto_para_dividir`
  (fallback `texto_completo`); (B) `Responder Articulo Suelto (Grupo - Con Modelo)` sin el fallback
  `|| texto_completo`; (C) `Parsear Articulo Suelto` corta con `resuelto:false` si el resto del cliente
  quedó vacío. Rollback n8n `bf74fe73-21ab-4966-8b67-47a6a184b1d2`.
  - **Fix D (mismo día), destapado al probar:** al dejar de "resolver" el artículo fantasma se activó
    un SEGUNDO clasificador en paralelo — `Extraer Tema Negocio (Esperando Variante)` — que **también**
    corría sobre `Unir Mensajes.texto_completo` y clasificaba la plantilla como `otro` → nota espuria
    al equipo (el gate `¿Ya Resuelto Como Articulo Suelto (Con Modelo)?` era lo único que la tapaba, y
    dependía del "resuelto" falso). Fix (script `apply-fix-tema-negocio-espera-variante-sin-plantilla.mjs`,
    0 nodos): ese nodo, su nota (`Preparar Nota Escalado Negocio (Esperando Variante)`) y su INSERT
    (`Registrar Pendiente Negocio (Esperando Variante)`) usan `Parsear Modelo Grupo.resto_mensaje`
    (fallback `texto_completo`); si el resto quedó vacío → `clasificacion='nada'` (no escala). Rollback
    n8n `394b47a5-7478-4a8b-bca7-61c203f4568c`.
  - **Validado en vivo** (conv 2411, webhook sintético): C1 (repro exacto) → sólo bienvenida +
    "corto/largo?", **sin** el mensaje de la tapa y **sin** nota; C2 (plantilla + "cuánto sale el
    cilindro solo?") → escala, pero la nota ahora cita "cuanto sale el cilindro solo?" (no la
    plantilla) — el precio de la pieza suelta sigue sin contestarse porque la variante no está resuelta
    (comportamiento previo, posible mejora aparte); C3 ("qué incluye la tapa?") → sigue contestando
    desde la ficha; C4 (2º turno sin plantilla) → limpio; C5 ("mandan a misiones?") → contesta el
    envío (Fix D no rompió la rama de negocio legítima). **Gotcha menor:** el `resto_mensaje` que deja
    el extractor de modelo puede traer fragmentos sucios ("para una , cuanto sale…") — molesta poco,
    es del extractor, no de este fix. Ver [[project-chatwoot-grupo-vs-kit-simple-drift]].
- **Mensaje de incompatibilidad editable desde la app (2026-09-02).** El texto de "no es compatible"
  estaba escrito a mano en 4 nodos. Decisión (Martín): un solo texto **fijo**, sin la moto ni el
  motivo técnico, igual para todos los casos. Cambios (script `apply-mensaje-incompat-editable.mjs`,
  0 nodos): tabla nueva `chat_config` (clave/valor, `chat-config.sql`) con fila
  `mensaje_incompatibilidad`; `Buscar Kits Activos` (corre siempre) trae ese valor en una columna
  nueva; los 4 nodos `Preparar Respuesta Compatibilidad` / `… (Grupo)` / `Preparar Respuesta No
  Compatible (Kit Confiado)` / `Preparar Respuesta Nada Compatible (Candidatos)` leen
  `$('Buscar Kits Activos').first().json.mensaje_incompatibilidad` (fallback hardcodeado
  "Lamentablemente este kit no es compatible."). La rama **compatible** ("Sí, … es compatible con tu
  {moto}") no se tocó. App: pestaña "Mensajes del bot" en `/admin/chatwoot/catalogo` (`chat-config.ts`
  + `mensajes-tab.tsx` + `lib/chat-config-constants.ts`). Nota: la nota privada del equipo que dice
  "no compatible" sigue redactándola la IA, no usa este texto. Rollback n8n
  `2f88bb90-d4f7-47d8-8017-d2ec0f7869f3`. Validado en vivo (conv 2411): grupo Tapa CDI + "honda wave
  nf" → "Lamentablemente este kit no es compatible."; kit 170 + "honda fan 125" → ídem; regresión
  Tapa CDI + "zanella zb 110" → "Genial, le va bien a tu moto bro… corto o largo?" (compatible,
  intacto).
- **El resto de la ráfaga tras resolver la variante ya no re-escala la propia respuesta de variante
  (2026-09-02).** Caso real conv 3223 (+5493516884434). Grupo esperando corto/largo; el cliente
  mandó pegados "Recorrido corto es" + "De que parte son ?". El bot resolvió la variante (mandó la
  bienvenida del pack + $99.000) y contestó la dirección, pero **además** escaló al equipo la nota
  *"El cliente preguntó algo que todavía no supimos ubicar: 'Recorrido corto es'"* — la misma frase
  que acababa de usar para resolver. Ejecución n8n #94390. Causa: al entrar a la máquina de
  sub-preguntas por el camino "resto tras variante", `Preparar Contexto Sub-preguntas` armaba
  `texto_para_dividir` con `Clasificar Mensaje.resto_mensaje || Unir Mensajes.texto_completo`; el
  primero viene vacío en ese camino → agarraba el **texto completo**, re-incluyendo "Recorrido corto
  es", que caía en `otro`, no se resolvía y se escalaba. Fix (script
  `apply-fix-resto-variante-no-reescala-la-variante.mjs`, 0 nodos, 2 ediciones de jsCode):
  (1) `Preparar Contexto Sub-preguntas` — si la variante se resolvió en esta corrida (`Marcar Pack
  Final Pineado` existe), usa `Unir Mensajes.resto_mensaje` (lo que realmente sobró); (2) `Parsear
  Sub-preguntas` (rama no-grupo) — red de seguridad: si el pack se acaba de confirmar y queda un
  pedazo corto (≤4 palabras) que solo nombra corto/largo y no es pregunta, se descarta (caso raro:
  variante como 2º mensaje). Rollback n8n `2a8cb98c-f44f-4f91-b010-63901705cf89`. **Falta validar
  en vivo** (repetir la ráfaga en conv 2411). Contestarle a mano al cliente de conv 3223 no hace
  falta — ya recibió la bienvenida correcta; la nota al equipo fue ruido.
- **Pendiente:** revisar el anuncio "combo 110 a 140 + Codo y carbu" (¿typo de marketing por "120",
  o campaña nueva sin cargar?) — si queda así, todo el que entre por ahí falla el match exacto;
  cargar esa plantilla/referral en el Kit 120 lo manda al camino feliz. Contestarle a mano a Benja
  (conv 3109) — quedó con la respuesta equivocada como último mensaje. Ídem Esteban (conv 3166,
  +5492224553988, "leva de calle 6.5", equipo ya le pasó el precio 01/09, `/bot off`), Joaco
  (conv 3153, +5492625419260), Gabriel (conv 3078) y Elias Nieva (conv 3032, +5493491582103 — el
bot le dijo que su "Corven energy 125" era compatible; hay que aclararle que no).
`rutas-bot-chatwoot.html` sigue desactualizado.

## Filosofía de diseño (para cuando pidan algo nuevo)

- **Sin IA donde se pueda.** Todo lo que sea determinístico (plantilla exacta, búsqueda en base
  con `rm_score`) se resuelve sin modelo. Es la reacción directa a la fatiga de
  `workflow_mateo`.
- **Cuando hace falta IA, que su trabajo sea chico y acotado.** Nunca "resolvé esto vos", siempre
  "extraeme este dato puntual" o "redactá esto usando SOLO el texto que te doy, no agregues
  nada". El precedente ya probado: `Extraer Pregunta Compatibilidad`, `Extraer Tema Negocio`,
  `Dividir y Etiquetar Sub-preguntas`, `Redactar Respuesta desde Dato`. Modelo: familia GPT-5.6
  (`gpt-5.6-luna`/`gpt-5.6-terra`, ver migración arriba) — no se agregó un tercer proveedor a
  propósito, por consistencia de infraestructura.
- **Ninguna rama nueva debe hacerse "porque sí".** Se construye incremento por incremento, a
  pedido explícito — no asumir que hay que replicar `workflow_mateo` nodo por nodo.
- **No prometer nada que el sistema no pueda garantizar.** (Ej.: el bot nunca dice "ya te
  aviso" salvo que la escalada esté realmente conectada a algo que efectivamente avisa.)

## Tablas de base de datos relevantes

Ninguna de estas tiene modelo en `schema.prisma` — son tablas "externas" que la app consulta con
`prisma.$queryRaw`/`$executeRaw`, y que n8n toca directo con nodos Postgres. Las migraciones son
archivos `.sql` sueltos en esta carpeta (idempotentes, `CREATE TABLE IF NOT EXISTS`), documentados
con un comentario de cuándo correrlos — no hay `prisma migrate` para esto.

| Tabla | Para qué | SQL de origen |
|---|---|---|
| `bot_estado`, `bot_horario` | Botón ON/OFF + horario automático semanal | `bot-onoff.sql`, `bot-horario.sql` |
| `respuestas_pendientes` | Cola de mensajes cuando el bot está apagado (o fuera de horario) | `bot-onoff.sql` |
| `bot_numeros_exceptuados` | Teléfonos que siguen respondiéndose en vivo con el bot apagado (números de prueba) | `bot-numeros-exceptuados.sql` |
| `bot_conversacion_lock` | Lock por teléfono, no procesar 2 mensajes en simultáneo | `lock-conversacion.sql` |
| `kits_publicidad` | Kits publicitados: plantilla exacta, precio, envío, detalle | (histórico, sin `.sql` propio) |
| `kit_articulos` | Artículos sueltos dentro de un kit (`alias` para matching futuro, sin usar todavía) | `kit-articulos.sql`, `kit-articulos-alias.sql` |
| `info_negocio` | Preguntas frecuentes del negocio (`tema`: ubicacion/horarios/medios_pago/envios/garantia/otro) — admin en `/admin/chatwoot/conocimiento` | — |
| `conocimiento_libre` | Aprendizaje libre por categoría (`tecnica`/`precio`/`negocio`/`sin_match`), buscado con `rm_score` como respaldo | `conocimiento-libre.sql` (también crea `rm_tokens`/`rm_score`/`rm_modelo_ok`) |
| `compatibilidades` | Compatibilidad kit↔modelo de moto ya confirmada | — |
| `preguntas_tecnicas_pendientes` | Escaladas de compatibilidad sin resolver | `link-compatibilidades-kit.sql`, `link-preguntas-tecnicas-kit.sql` (agregan `kit_id`) |
| `preguntas_precio_pendientes`, `preguntas_negocio_pendientes` | Remanentes de `workflow_mateo` — el 2.0 no escribe ahí, ver "Pendiente" abajo | — |
| `preguntas_sin_match_pendientes` | Escaladas del partidor de sub-preguntas (Fase 6) | `escalado-sin-match.sql` |
| `precios_stock` | Remanente de `workflow_mateo` — **el 2.0 no la toca**, lee precio/detalle directo de `kits_publicidad` por `kit_id` | — |

## Cómo se trabaja sobre el workflow (proceso, no reinventar)

1. Los cambios se aplican **directo contra la API real de n8n**
   (`https://n8n.revolucionmotos.tech/api/v1`, key en `.env` como `APIKEY_N8N`), no hay ambiente
   de staging separado para el workflow (existió uno local para `workflow_mateo`, se retiró el
   2026-08-13 por falta de uso — si hace falta de nuevo, armarlo pensado para el 2.0). La red de
   seguridad es el **historial de versiones propio de n8n** (herramientas `get_workflow_history` /
   `get_workflow_version` / `restore_workflow_version` del MCP de n8n) — ya no se bajan backups
   manuales a archivos `.json` sueltos en el repo (el harness que hacía eso,
   `n8n-workflows/auditoria-harness/`, se eliminó el 2026-08-20 por no usarse más; sigue
   recuperable del historial de git si hace falta reconstruir algo puntual).
2. Validar con una **conversación de prueba dedicada** antes de dar por bueno un cambio:
   `conversation_id 2411`, teléfono `+5493513784909`. Van dos conversaciones de prueba retiradas
   antes que esta, mismo teléfono, ambas por el mismo motivo (historial de pruebas ensuciando el
   contexto que recibe la IA) — **no reusar `1` ni `2405`** si aparecen mencionadas en código o
   docs viejos:
   - `conversation_id 1`: retirada el 2026-08-22 — acumuló tanto historial mezclado de pruebas de
     kits distintos que terminó confundiendo de verdad a `Identificar Necesidad` con un mensaje
     real ("tapa cdi y cilindro 120" dio `tipo: "ninguno"` ahí).
   - `conversation_id 2405`: la reemplazó el mismo día, pero se retiró también poco después — al
     usarla para validar el fix de contexto de abajo (candidatos vs. anuncio) quedó con las
     mismas preguntas de prueba repetidas encima, y para no arrastrar ESE ruido a la próxima
     tanda de pruebas se pasó a la 2411.
   - Las dos anteriores siguen existiendo en Chatwoot (el token no tiene permiso `DELETE`, ver
     más abajo) por si hace falta consultar su historial — simplemente no se usan más para
     probar. Si `2411` también termina ensuciándose con el tiempo, repetir el mismo mecanismo:
     conversación nueva, actualizar este punto.

   Reglas de higiene aprendidas a los golpes:
   marcar todo lo sintético con prefijo tipo `[auditoria-XX]`; limpiar por `id` exacto, nunca por
   patrón de texto amplio (un `DELETE ... WHERE content ILIKE '%algo%'` puede dejar huérfana una
   punta del intercambio en `conversaciones_historial` y generar el mismo síntoma que un bug
   real); reusar la conversación de prueba en vez de inventar ids nuevos (un `conversation_id`
   que no existe en Chatwoot hace fallar el envío real).
3. **Ojo con el pin de Redis en la conversación de prueba**: "resetearla" desde
   `/admin/chatwoot/prueba` borra Postgres pero no Redis (`kit_pineado:{telefono}` TTL 96hs,
   `bot_pausado:{conversation_id}` TTL 30 días) — un pin viejo puede arrastrar una prueba nueva
   por un camino distinto sin que se note. El botón "Borrar historial de un número" ya llama
   también a un workflow n8n aparte, **"Utilidad - Limpiar Pin de Prueba"** (activo, separado de
   "Respuestas chatwoot 2.0", webhook `POST /webhook/limpiar-pin-prueba`), que borra esas dos
   claves — la app no puede hablar con ese Redis directo (firewall de IP, solo deja pasar al
   servidor de n8n). Detalle completo en [[project-redis-app-conectividad]].
4. Si hace falta reproducir un caso que dependa de "es el primer mensaje de la charla": la
   conversación de prueba ya tiene demasiado historial acumulado para eso. Crear una conversación
   nueva de verdad vía la API de Chatwoot (`POST /accounts/1/conversations`, mismo `contact_id`
   del teléfono de prueba) y marcarla `resolved` al terminar (el token no tiene permiso de
   `DELETE`).

### Gotchas de n8n (para no repetir el error)

- Un `Switch`/`If` que separa ítems en ramas distintas **no las vuelve a juntar solas** en un
  nodo posterior aunque varias conexiones apunten al mismo nombre de nodo — cada conexión
  dispara su propia corrida. Si hace falta procesar varios ítems y después combinarlos en uno
  solo, evitar bifurcar del todo: mejor un camino lineal único donde cada paso se "gatea" con
  una condición en el propio SQL/código (ej. `WHERE '{{categoria}}' = 'precio'`).
- Los nodos `Code` con **más de un ítem de entrada**, por default (`runOnceForAllItems`), solo
  procesan el primer ítem y descartan el resto — hace falta `"mode": "runOnceForEachItem"` en
  `parameters`, y en ese modo se devuelve un objeto `{ json: {...} }` suelto, no un array.
- Un `Postgres` con `executeQuery` que devuelve 0 filas para un ítem del lote **no deja un
  placeholder vacío**, directamente ese ítem desaparece del resultado. Si hace falta preservar
  la alineación 1 a 1 con la entrada, envolver la query en
  `SELECT ... FROM (SELECT 1) seed LEFT JOIN <tabla_real> ON <condiciones>` (o
  `LEFT JOIN LATERAL` si hay `ORDER BY`/`LIMIT` de por medio) para garantizar siempre una fila
  de salida por ítem de entrada, con columnas en `NULL` cuando no matchea.
- **El mismo problema existe en el nodo `Redis` (operación `get`) — no es exclusivo de Postgres.**
  Encontrado el 2026-08-26 en `Buscar Cierre Reciente (Sub-pregunta)`: corría una vez por
  sub-pregunta del partidor (Fase 6) con la MISMA clave (`cierre_reciente:{telefono}`) para las N
  sub-preguntas de una ráfaga, y de un lote de 2 ítems de entrada devolvía 1 solo — el segundo
  desaparecía en silencio, arrastrando con él cualquier dato ya resuelto más atrás en la cadena
  (ver entrada fechada abajo). Como la clave no depende del contenido de cada sub-pregunta, la
  solución de fondo no fue el patrón `LEFT JOIN` de arriba (no aplica a Redis) sino sacar la
  consulta del loop por completo: correrla UNA vez por ráfaga, antes de separar en sub-preguntas
  (`Separar Pedazos`), y llevar el resultado pegado a cada ítem ya separado (mismo mecanismo que
  `kit_id`/`kit_nombre`, que ya viajaban así). Ante cualquier nodo que corra "una vez por
  sub-pregunta" con un dato que en realidad es el mismo para toda la ráfaga, preferir resolverlo
  una sola vez arriba y propagarlo, en vez de re-consultarlo por ítem — evita esta clase de bug de
  raíz y de paso ahorra queries repetidas.
- **Insertar un nodo en el medio de una cadena rompe cualquier nodo más adelante que use el
  atajo `$json` (sin nombre de nodo) para leer datos de "más atrás"** — `$json` siempre apunta
  al nodo inmediatamente anterior en ESE momento, no al que tenía el dato antes de reordenar.
  Rompió en silencio más de una vez (pineaba un kit vacío `{}`, o un prompt perdía un campo que
  asumía de su entrada directa, sin tirar ningún error visible). Antes de reordenar nodos,
  revisar todo lo que quede río abajo del nuevo punto de inserción buscando usos de `$json` sin
  nombre de nodo, y cambiarlos a `$('Nodo De Origen').item.json...` explícito.
- Una salida "temprana" (early exit) insertada ANTES de un nodo que limpia estado compartido
  (ej. el buffer de la ráfaga en Redis) tiene que limpiar ese estado por su cuenta si no pasa por
  el nodo original — si no, el estado queda "sucio" para la próxima ejecución que sí llegue hasta
  el final (encontrado con el fix de `/bot off` a mitad de ráfaga: la primera versión dejaba el
  buffer sin vaciar y la siguiente pregunta salía duplicada).
- Al sumar una categoría nueva a un prompt de clasificación de este workflow, revisar también
  el/los Code node(s) que parsean esa salida por si tienen su **propia lista blanca hardcodeada**
  de valores permitidos — no alcanza con tocar solo el prompt (`Parsear Sub-preguntas` pisaba en
  silencio a `'otro'` cualquier categoría fuera de su lista; pasó agregando "cierre").
- La API de ejecuciones de n8n (`/executions`) puede tardar varios minutos (no segundos) en
  reflejar la primera ejecución disparada justo después de un `PUT` de workflow. Reenviar el
  mismo mensaje de prueba con un id nuevo suele destrabar la validación; no asumir que un fix no
  anda solo porque `/executions` todavía no muestra nada.
- **El GET de `/workflows/{id}` pasa por un proxy que cachea por URL** — llega a devolver una
  versión de días atrás (visto el 2026-08-31: 371 nodos / 08-25 en vez de 440), y un `PUT` sobre
  esa base pisaría días de trabajo. Mandar SIEMPRE un cache-buster único en la query
  (`?_cb=<timestamp>-<random>`) y verificar `nodes.length` / `updatedAt` / `versionId` antes de
  editar. Los `apply-*.mjs` desde esa fecha reintentan el GET hasta obtener la versión buena.
- **Un `PUT` de workflow con el body UTF-8 crudo corrompe la "í" (U+00ED) en los textos** —
  n8n guarda solo el 2º byte (`0xAD`) y se ve "Todav?a" / "ah?" en los mensajes entregados (pero
  bien en un `GET`). Encontrado el 2026-08-28 editando `Preparar Nota Escalado (Grupo)`. Mandar el
  body con escapes ASCII (`json.dumps(payload, ensure_ascii=True)` / `JSON.stringify` ya es ASCII-safe
  si no forzás UTF-8) — los `\uXXXX` viajan como ASCII puro y n8n los decodifica bien. Ojo que varios
  textos viejos del workflow ya arrastran esta corrupción de "í".
- Un `PUT` de workflow durante horario NO comercial (`bot_estado.encendido = false`) hace que las
  respuestas se encolen en `respuestas_pendientes` en vez de salir al instante — verificar
  siempre `bot_estado`/`bot_horario` antes de asumir que un cambio rompió el envío (generó una
  falsa alarma y un rollback innecesario una vez). Confirmar contra `respuestas_pendientes` /
  `preguntas_sin_match_pendientes`, no solo contra Chatwoot en vivo.
- Los modelos de razonamiento (`gpt-5.6-*`) no aceptan `temperature` distinto del default —
  hay que sacarlo de `parameters.options` si el nodo lo heredó de una config vieja (dan "Bad
  request - please check your parameters"). Además, por default estos nodos traen
  `responsesApiEnabled: true`, que el Agent node v2 de esta instancia no soporta — forzar
  `responsesApiEnabled: false` (Chat Completions clásica) explícito.
- **Un nodo conectado en paralelo y referenciado solo por `$('Nodo').first()`/`.item` desde otra
  rama NO tiene garantizada su orden de ejecución** — si nada más lo consume por cable, n8n puede
  dejarlo para el final de la ejecución en vez de correrlo antes que el nodo que lo referencia,
  y la referencia devuelve datos vacíos/viejos en silencio (si está en un `try/catch`, ni siquiera
  tira error). Encontrado con el fix de contexto de `Dividir y Etiquetar Sub-preguntas` (ver
  arriba): el nodo que traía "nuestro último mensaje" corrió DESPUÉS del nodo que lo consultaba.
  Si hace falta que el dato de un nodo esté listo antes de que otro lo lea vía `$()`, no alcanza
  con que ambos cuelguen del mismo antecesor — hay que insertarlo EN SERIE en el camino real que
  lleva hasta el nodo que lo consume (aunque eso signifique repetirlo en varias ramas que
  convergen al mismo destino, mismo patrón ya usado para "varias ramas alimentan un nodo común").
- **Prender el bot con un `UPDATE bot_estado SET encendido = true` directo por SQL no despacha la
  cola** (`respuestas_pendientes`) — `despacharColaEnSegundoPlano()` solo se dispara cuando
  `sincronizarEstadoBot()` detecta un *cambio* de apagado a encendido (ver `lib/chatwoot-cola.ts`),
  y un `UPDATE` directo no pasa por ahí. Encontrado el 2026-08-21: se prendió el bot por SQL para
  un barrido y ~12 mensajes que ya estaban encolados de antes quedaron esperando igual. Para
  prender el bot siempre usar el botón real del panel (`/admin/chatwoot`) o la action
  `app/actions/bot-onoff.ts` — nunca el UPDATE crudo.

## Catálogo nuevo, aislado (artículos sueltos + packs) — en construcción

- **2026-08-20:** revisando ejecuciones en vivo se confirmó el patrón que faltaba resolver desde
  el 19/08 (ver "Árbol de artículos" arriba): casi todo lo demás anda bien, pero preguntas libres
  sobre un artículo suelto dentro de un kit siguen sin respuesta.
- Se evaluó heredar el patrón real de `/admin/listas/articulos-mostrador` +
  `/admin/listas/packs` (`ArticuloMostrador`/`PackMostradorItem`, ya maduro, en producción) pero
  se descartó: de los 6 kits publicitados hoy, solo 2 tienen un pack equivalente en mostrador, y
  esos 2 ya tienen el precio desincronizado entre las dos bases (Kit 120: $99.000 vs $99.900; Kit
  220: $199.000 vs $189.000) — evidencia real de que duplicar el dato a mano no funciona.
- **Decisión: sección nueva y totalmente aislada**, `/admin/chatwoot/catalogo` (tarjeta propia en
  `/admin/chatwoot`), tablas `chat_articulos` / `chat_packs` / `chat_pack_articulos`
  (`n8n-workflows/chat-catalogo.sql`, ya corridas en producción). No toca `kits_publicidad` /
  `kit_articulos` ni `articulos_mostrador` / `pack_mostrador_items`. El workflow en producción
  sigue leyendo lo viejo sin cambios hasta que esta base esté cargada y probada.
- Precio de artículo es **numérico** (a diferencia del texto libre de `kits_publicidad.precio`):
  de yapa resuelve estructuralmente el precio ambiguo de Kit 8 (corto/largo) — a futuro serían dos
  artículos distintos en vez de dos números pegados en un mismo campo de texto.
  `eliminarChatArticulo` bloquea el borrado si el artículo sigue enganchado a algún pack (no
  cascadea en silencio). Sin stock por artículo ni precio por medio de pago — decisiones a
  propósito, ver detalle y el porqué de cada campo en [[project-chat-catalogo-nuevo]].
- **Corrección misma tarde:** un artículo ya no se tipea a mano — es una referencia elegida por
  buscador a un artículo real de `articulos_mostrador` (nombre siempre en vivo, precio propio
  editable — el de chat es "para redes" con envío contemplado, más alto que el de mostrador a
  propósito, no es un bug). Los 4 buscadores de la sección matchean todas las palabras sin importar
  el orden (`lib/busqueda-texto.ts`). Compatibilidad ahora vive por artículo
  (`chat_articulo_compatibilidad`, no se hereda en vivo del kit, con atajo "copiar de un kit").
  Detalle completo en [[project-chat-catalogo-nuevo]].
- **Variantes de un mismo kit (schema + UI listos, pestaña "Grupos" propia, primer caso real ya
  cargado):** para casos tipo Kit 120 recorrido corto/largo (mismo anuncio, distinto artículo y
  precio real según cuál le toque al cliente) — tabla `chat_pack_grupos` (con `mensaje_bienvenida`,
  no una pregunta suelta: es el mensaje completo que se manda como un solo WhatsApp, sin precio) +
  `chat_packs.grupo_id`/`criterio_variante` (`n8n-workflows/chat-catalogo-variantes.sql` +
  `chat-catalogo-grupos-mensaje.sql`). En Packs hay un selector para sumar un pack a un grupo
  (nuevo o existente) + su etiqueta de variante; la pestaña "Grupos" (nueva) tiene el CRUD completo
  para crear/editar/borrar grupos y ver qué packs tiene enganchados cada uno. Kit 120 ya tiene sus 2 packs
  (recorrido corto/largo) enlazados al grupo "Kit 120 para 110". El paso de n8n que pregunta y
  resuelve la variante todavía se construye después, aparte.
- **Bug de `parsearListaCompat` — arreglado 2026-08-28** (ver entrada del 28/8 sobre la Honda Wave más
  abajo): antes solo separaba por comas y no toleraba paréntesis anidados en la aclaración; ahora
  separa también por `\n`/`\r` y encuentra la aclaración por conteo de anidación.
- **Categoría (2026-08-21):** `chat_articulos.categoria` (tipo de pieza: escape, leva, cilindro
  original/potenciado, etc. — lista fija en `lib/chat-catalogo-categorias.ts`, editable sin
  migración) + `chat_packs.categoria`/`chat_pack_grupos.categoria` (categoría de combo, texto libre,
  ej. "Potenciacion 110" — mismo patrón dueño/grupo que `mensaje_bienvenida`). Migración
  `n8n-workflows/chat-catalogo-categorias.sql`. La de artículo es la que probó ser necesaria para el
  matching de piezas sueltas (ver abajo) — sin ella, alias por sí solo no alcanzaba.
- **2026-08-21 — corte real hecho: el workflow ya lee del catálogo nuevo** (hecho por Martín
  directo contra la API, en paralelo a esta conversación). `kits_publicidad` / `compatibilidades`
  dejaron de leerse — `Buscar Kits Activos` ahora trae `chat_packs` (sin grupo) + `chat_pack_grupos`
  con sus variantes; `Buscar Precio/Envio/Detalle Kit Pineado` y `Buscar Compatibilidad del Kit` (y
  `Guardar en Compatibilidades` x2) apuntan a `chat_packs` / `chat_articulo_compatibilidad`. Los 3
  combos con variantes (Kit 120, Escape pwr+Leva, Tapa CDI) tienen sus 2 packs reales cargados; los
  otros 3 kits viejos (Escape Dm Curvo, KIT POTENCIADO 220cc, Kit 170) se decidió a propósito NO
  migrarlos (poco tráfico) — caen a `sin_match` y escalan normal. `chat_packs.detalle` y
  `chat_pack_grupos.pregunta_variante` son columnas nuevas
  (`chat-catalogo-detalle-pregunta-variante.sql`), ya cargadas para los 6 packs/3 grupos activos.
  Se confirmó con datos reales que la compatibilidad por modelo de moto es idéntica entre variante
  corta y larga de cada grupo — el modelo nunca alcanza para resolver corto/largo, por eso la
  resolución de variante quedó en **2 preguntas**: moto (gate de compatibilidad, nodo
  `Extraer Modelo Grupo` → `Buscar Compatibilidad del Grupo`) y, recién si es compatible, corto/largo
  (`Resolver Variante`) → recién ahí se pinea el pack final con el mismo shape `{kit_id, kit_nombre}`
  de siempre — **`kit_id` ahora ES `chat_packs.id` directo, ya no `kits_publicidad.id`**.
  `Parsear Kit Pineado` distingue esos 2 estados (`es_grupo`/`estado`) sin romper nada de lo que ya
  leía `kit_id`/`kit_nombre` — el nodo `¿Es Grupo en Resolución?` es el que separa el camino nuevo
  del de siempre. Nodo `Parsear Estado Pineado` (del borrador previo a este corte) quedó huérfano en
  el canvas, sin uso — se puede borrar en una limpieza futura.
  **Riesgo de la transición ya mitigado:** los IDs de `kits_publicidad` y `chat_packs` se pisan
  (overlap real en 3, 7, 8) — cualquier pin viejo en Redis (`kit_pineado:*`, hasta 96hs) de antes
  del corte podía devolver datos de un producto equivocado. Se armó un mini-flujo manual separado
  (`Manual Trigger - Flush Pines` → `Listar Pines Kit` → `Separar Claves` → `Borrar Pin`, sin
  conexión al `Webhook1` real) para vaciar todos los pines viejos de una — Martín ya lo corrió, sin
  riesgo pendiente.
  **Validado el mismo día con la conversación de prueba** (`conversation_id 1`,
  `+5493513784909`, grupo Tapa CDI) los 3 casos: moto compatible (Zanella ZB 110) → pregunta
  corto/largo → "corto" resuelve al pack id 7 (Recorrido corto) correcto; moto no compatible
  (Honda Wave NF) → responde directo sin escalar; moto sin dato (Kawasaki Ninja 400) → escala
  silenciosa a `preguntas_tecnicas_pendientes` con el nombre del grupo. La validación se hizo
  con el bot apagado (fuera de horario) inspeccionando `respuestas_pendientes`/
  `preguntas_tecnicas_pendientes` directo, no en Chatwoot en vivo (mismo criterio que el gotcha ya
  documentado más abajo).
  **3 bugs de n8n encontrados y corregidos durante esta validación** (producción, corregidos en
  caliente, sin afectar el resto del workflow):
  1. `Preparar Respuesta Compatibilidad (Grupo)` (Set) descarta cualquier campo que no sea el que
     define — estaba conectado en serie antes de `¿Es Compatible (Grupo)?`, que entonces siempre
     leía `compatible: undefined`. Fix: conectarlos en paralelo, ambos directo desde
     `¿Hay Dato de Compatibilidad (Grupo)?` (mismo patrón que ya usaba el `¿Es Realmente
     Compatible?` original — no fue casualidad que ese patrón exista).
  2. Quedó una conexión del borrador inicial (`¿Pineado Esperando Moto?` → `¿Pineado Esperando
     Variante?` en su rama falsa) que, sumada al cableado nuevo en paralelo desde `¿Es Grupo en
     Resolución?`, hacía correr `¿Pineado Esperando Variante?` (y todo lo que cuelga de ahí) DOS
     veces en la misma ejecución — mismo gotcha ya documentado de switches/ifs que no "vuelven a
     juntar" ramas solas.
  3. `Enviar Respuesta No Compatible (Grupo)` referenciaba `$('Preparar Respuesta...').item` —
     como ahora son ramas hermanas (no en cadena), n8n no puede resolver el `pairedItem` ("No path
     back to referenced node"). Fix: usar `.first()` en vez de `.item` cuando el nodo referenciado
     no es un ancestro directo en el mismo camino.
  Plan completo charlado con Martín, guardado en sesión de Claude Code de esa fecha.
- **Matching de artículo suelto dentro de un kit pineado (2026-08-21) — primera versión, ya en
  producción:** el disparador fue un caso real (conv 2331, +5493863690579): preguntaron "Precio del
  escape pwr" con el combo Escape+Leva ya pineado, y el bot escaló en silencio pese a que el precio
  ($95.000) ya estaba cargado en `chat_articulos`. En vez de armar una rama nueva, se extendió la
  que ya existía para la categoría "otro" del partidor de sub-preguntas: `Buscar Detalle Kit Pineado
  (Sub-pregunta)` ahora también trae la lista de artículos sueltos del pack pineado (id, nombre,
  categoría, alias, precio) además del `detalle` de siempre; el prompt de `Responder Otro desde
  Detalle Kit` decide si el cliente pide (no solo menciona) una pieza puntual de esa lista y devuelve
  su `articulo_id` (nunca el precio, nunca inventado); `Parsear Respuesta Otro desde Detalle`
  revalida ese id contra la lista real (un id no encontrado = no resuelto) y arma el texto final con
  el precio de verdad. **Sin nodos nuevos, sin bridge a `kits_publicidad`** — se aprovechó que
  `kit_id` ya es `chat_packs.id` desde la migración de arriba.
  - **Riesgo real que motivó este diseño:** que el cliente NOMBRE una pieza sin pedir nada
    ("ah porque yo tengo ya un pwr solo") dispare una respuesta de precio que nadie pidió — pasó
    antes y Martín pidió específicamente evitarlo. El prompt tiene esa distinción explícita
    (mención vs. pedido real, con ese ejemplo textual) como regla, no como ocurrencia.
  - **Probado en vivo contra producción** (número de prueba +5493513784909, pack descartable
    `[auditoria-articulo-suelto]` con 1 solo artículo, borrado al final): "Precio del escape pwr" →
    resolvió sola, texto final "El escape Paolucci 110 Pwr suelto cuesta $95.000." (precio real,
    tomado de la base, no inventado). "ah porque yo tengo ya un pwr solo" → el partidor de
    sub-preguntas ya la clasifica como "cierre" (mención/comentario, no pedido) antes incluso de
    llegar a este paso nuevo — cero respuesta automática, como debía ser.
  - **Todavía sin cubrir:** el resto de un mensaje que llega en la MISMA ráfaga que la plantilla
    exacta de un GRUPO (variante corto/largo sin resolver todavía) — ese resto no pasa por este
    camino, solo por el de un kit ya con pack final pineado. Si aparece un caso real de esto, es la
    próxima extensión natural, no un bug de esta versión.
- **Bug real de la ventana de transición del corte (2026-08-21), encontrado por Martín en un caso
  real (conv 2313, +5492994092837):** una conversación que arrancó ANTES del corte de las 14:08
  (plantilla exacta matcheada contra el `kits_publicidad` viejo) quedó con un pin plano de Redis
  (`kit_id: 8`, formato viejo, sin `es_grupo`). Después del corte, ese mismo `8` pasó a significar
  `chat_packs.id = 8` (Tapa CDI, variante LARGA) — el cliente había elegido "recorrido corto", pero
  el bot siguió respondiendo con el detalle del largo porque nunca entró al flujo de grupo (pensaba
  que ya tenía un pack fijo pineado, no uno "en resolución"). El vaciado de pines viejos que se
  corrió como parte del corte no alcanzó a este pin porque se creó DESPUÉS de ese vaciado y ANTES
  del corte real — la ventana entre ambos momentos quedó sin cubrir. No es un bug del clasificador
  actual (se revisó el código vigente y separa bien kit de grupo) — fue puntual de esa ventana de
  transición, ya cerrada.
- **Barrido de reprocesamiento (2026-08-21):** para recuperar preguntas de esa misma ventana que
  quedaron mal resueltas o escaladas sin necesidad, se reprocesaron a mano las pendientes de los 3
  grupos migrados de las últimas 48hs (17 conversaciones, filtrando primero las que ya tenían una
  respuesta real de un humano después de la escalada): se limpió el pin de Redis de cada teléfono
  (mismo mecanismo que "Limpiar Pin de Prueba", pero solo la clave `kit_pineado`, nunca
  `bot_pausado`) y se reinyectó la pregunta original como mensaje nuevo contra el webhook real de
  producción (`/api/chatwoot/prueba-mensaje` funciona con cualquier `conversationId`/teléfono real,
  no solo el de prueba). Resultado: 3 resueltas limpio y contestadas de verdad, 2 resueltas a
  medias (precio/stock sí, compatibilidad sigue pendiente — revisar si quedó nota duplicada en
  conv 2226 y 2248), 1 reveló el bug de "cierre" de abajo, 11 siguieron sin resolver sin mandar
  nada (correcto, dato real no cargado). Las 3 limpias se marcaron `respondida` a mano en
  `preguntas_sin_match_pendientes` (ids 115, 117, 154) — el resto de la tabla no se tocó.
- **Otro caso real de la ventana de transición (2026-08-21, conv 2336, +5493865610660):** mismo
  mecanismo que el de arriba — pin viejo (`{kit_id:1, kit_nombre:"Kit 120 para 110"}`, sin
  `es_grupo`) creado antes del corte de las 14:08, cliente respondió después con las motos y el
  bot volvió a mandar la bienvenida completa preguntando la moto de nuevo, ignorando que ya se la
  habían dado. Se limpió reinyectando el mensaje de la moto contra el webhook real
  (`/api/chatwoot/prueba-mensaje`, mismo mecanismo del barrido) — el pin quedó sano y esta vez
  entró bien al flujo de grupo, pero no encontró compatibilidad y escaló en silencio a
  `preguntas_tecnicas_pendientes` (id 152, sin mandar nada al cliente).
- **Gap nuevo encontrado ahí mismo, sin arreglar: dos motos en el mismo mensaje.** El cliente
  escribió "Para una corven energy 2019 y para una motomel bliz 2016 las 2 son 110" — `Extraer
  Modelo Grupo` no separa varias motos, las deja pegadas en un solo string
  (`"corven energy 2019 y motomel bliz 2016"`), y contra ese texto pegado `rm_modelo_ok` no
  matchea aunque cada moto por separado sí tendría dato cargado (`motomel blitz 110` está
  compatible; el cliente escribió "bliz" sin la t, typo que tampoco tolera el matching). No rompe
  nada — cae a escalado silencioso, comportamiento seguro — pero dos motos sueltas en un mensaje
  nunca se resuelven solas. Mismo gap aplica al `Extraer Modelo` de compatibilidad simple (no
  grupo), no revisado todavía.
- **Todavía sin hacer:** ~~reescribir el `mensaje_bienvenida` propio de los packs~~ (hecho
  2026-08-21, ver más abajo — terminó afectando a los 6 packs finales, no solo Tapa CDI); agregar
  al `detalle` del artículo Cilindro (Kit 120) el párrafo sobre ambigüedad recorrido corto/largo
  que tenía el kit viejo y no se migró;
  y extender el matching de artículo suelto al caso de "resto en la misma ráfaga que un grupo sin
  resolver" (ver arriba).
- **Compatibilidad a nivel de combo/kit completo + precheck antes de pinear (2026-08-23).** Causa
  raíz: la compatibilidad se buscaba por pieza suelta más reciente, sin distinguir la pieza CENTRAL
  (cilindro) de una periférica (filtro, codo) — un combo podía dar falso positivo si la fila más
  reciente cargada era de una pieza periférica compatible con todo. Fix: tabla nueva
  `chat_combo_compatibilidad` (compatibilidad del grupo/kit completo, con UI propia en
  `/admin/chatwoot/catalogo`, sin SQL a mano), consultada con prioridad y fallback a piezas sueltas
  en `Buscar Compatibilidad del Kit`/`del Grupo`. Además, cuando `Identificar Necesidad` pinea un
  kit a partir de lenguaje natural y el cliente ya mencionó su moto en el mismo mensaje, el bot
  ahora chequea esa compatibilidad ANTES de pinear/saludar, en las dos ramas de `¿Qué Identificó?`:
  `candidatos` (repregunta reducida a los kits que sirven, o "no tenemos" directo si ninguno sirve)
  y `kit_confiado` (mismo patrón, un solo kit: `Extraer Modelo (Kit Confiado)` →
  `Resolver Kit Confiado (Compat)` → `Buscar/Procesar Compatibilidad Kit Confiado` →
  `¿Es Compatible (Kit Confiado)?`, insertado en serie entre `¿Insiste Pese a Incompatibilidad?` y
  `Preparar Pin desde Identificacion`). **Gotcha:** cuál rama toma `Identificar Necesidad` con el
  mismo mensaje es variable (LLM), así que un gap en una sola rama se sigue disparando en
  producción con el tiempo aunque parezca poco frecuente en las pruebas — hay que cubrir ambas.
  280→291 nodos. Validado en prod con conversaciones nuevas para las 3 combinaciones de
  `kit_confiado` (moto incompatible bloquea sin pinear, sin moto sigue igual que siempre, moto
  compatible sigue igual que siempre) y para `reducir_candidatos` de la rama `candidatos` — detalle
  completo en `[[n8n_compatibilidad_nivel_combo]]` (memoria del proyecto). `uno_compatible` sigue
  sin validar con un caso real: no hay dato real con ese patrón (compatible en 1 solo grupo de 3) y
  forzarlo con datos sintéticos 2 veces hizo que `Identificar Necesidad` clasificara `ninguno` en
  vez de `candidatos` — código simétrico a las otras 2 ramas ya validadas, riesgo bajo pero abierto.
  Motivo técnico de Escape+Leva (antes vacío) ya cargado: el escape no entra en el cárter y no hay
  leva compatible, confirmado por Martín, aplicado a nivel combo y a nivel pieza (Escape Paolucci,
  2 Levas Competición). **`rutas-bot-chatwoot.html` quedó
  desactualizado con este cambio** (no refleja el precheck de compatibilidad en ninguna de las 2
  ramas) — pendiente de actualizar el diagrama.
- **Fix real: "el kit + una pieza que no es del kit" en el mismo mensaje se contestaba con el
  detalle genérico del kit, ignorando la pieza (2026-08-24).** Caso real: conv 2570
  (+5493878682699) resolvió bien todo el Kit 120 (moto compatible, corto/largo), pero al preguntar
  "Cuánto me sale todo, el kit un cigüeñal también" en la misma ráfaga que "Recorrido corto", el
  bot contestó solo el detalle del kit y nunca dijo nada del cigüeñal — tampoco escaló. Causa
  investigada contra la ejecución real (n8n exec 84128): el mecanismo de "resto de la ráfaga" tras
  resolver la variante (`¿Hay Resto Para Resolver? (Variante)` → partidor de sub-preguntas) ya
  estaba bien cableado de punta a punta — el partidor incluso separó bien las dos partes ("Cuánto
  me sale todo" = precio, correctamente suprimido por venir recién confirmado el kit; "el kit un
  cigüeñal también" = otro). El bug real estaba en el agente `Responder Otro desde Detalle Kit` (y
  su gemelo de grupo, `Responder Articulo Suelto (Grupo)`): al no encontrar "cigüeñal" en la lista
  de artículos reales del kit, el modelo igual devolvía `resuelto:true` recitando el detalle
  general del kit como si eso contestara la pregunta. Fix: regla nueva y explícita en ambos
  prompts — si el cliente nombra una pieza puntual que no está en la lista de artículos ni en el
  detalle, `resuelto:false` sin importar que el mensaje también toque el kit en general. Sin
  cambios de cableado, solo prompt. Validado en la conversación de prueba (2411) replicando el
  caso exacto: ahora escala en silencio con nota privada ("El cliente preguntó algo que todavía no
  supimos ubicar: 'un cigüeñal también'"), sin repetir el detalle del kit.
- **Fix real, chico: saludo genérico duplicado cuando un mensaje fuera de horario quedaba en cola
  (2026-08-24).** Caso real: conv 2575 (+5493521477426) escribió "Hola buenas noches" fuera de
  horario (queda en `respuestas_pendientes`, `origen: 'saludo_generico_2_0'`, sin mandar todavía);
  a la mañana escribió otro "Hola buen día" ya con el bot prendido, que se contestó en vivo al
  toque — pero minutos después se despachó IGUAL el saludo viejo de la cola, duplicando el "Hola
  bro! En qué te podemos ayudar?" sin que el cliente hubiera dicho nada nuevo en el medio. No es un
  bug de n8n: la cola de despacho vive en la app (`lib/chatwoot-cola.ts`), que ya tenía un chequeo
  de "¿contestó un humano en esta conversación después de que se armó este pendiente?" pero nunca
  el equivalente para el propio bot. Fix acotado a propósito: `humanoRespondioDespues` (
  `lib/chatwoot-bot.ts`) pasó a `estadoConversacionDesde`, que en la misma consulta a Chatwoot
  devuelve también si el bot ya contestó algo más nuevo; `despacharCola` descarta el pendiente
  SOLO si su `origen` es `saludo_generico_2_0` (el saludo sin datos, "Hola bro...") — el resto de
  orígenes (bienvenida de kit, compatibilidad, sub-preguntas, etc.) no entra en este chequeo a
  propósito, porque ahí sí puede haber contenido real distinto entre un pendiente viejo y lo que el
  bot ya mandó. Validado insertando un pendiente sintético (`saludo_generico_2_0`, fecha vieja) en
  la conversación de prueba y corriendo `despacharCola()` real (sin forzar, con el bot ya prendido
  de verdad): lo descartó con motivo "Ya saludamos en esta conversación con un mensaje más nuevo",
  0 enviados. Pendiente de deploy — ver si Martín quiere pushear ahora o revisar el diff primero.
- **Nueva cobertura: preguntas de negocio (envío/horario/ubicación/medios de pago/garantía) mientras
  el GRUPO espera la moto, antes se perdían sin dejar rastro (2026-08-24).** Caso real: conv 2505
  (+5493718582745) escribió "Para 110 cadenita 84" (moto no identificable) + "Hacen envíos a todo
  el país" en la misma ráfaga — el bot repreguntó la moto pero la parte de envío desapareció sin
  contestar NI escalar (a diferencia del resto del workflow, donde lo no resuelto siempre queda
  como pendiente para el equipo). Causa: el mecanismo agregado el 22/08 para "artículo suelto
  mientras espera la moto" solo contempla preguntas sobre una pieza del kit — cualquier otra cosa
  (como una pregunta de negocio) caía directo a la repregunta de moto sin pasar por ningún lado.
  A pedido explícito de Martín ("la idea del bot es que responda lo que sabe, y lo que no, se
  escala"), en vez de solo tapar el agujero con un escalado, se sumó resolución real: 10 nodos
  nuevos, todos aislados de la rama simple (mismo criterio ya usado en los fixes anteriores de esta
  rama — no se reusan nodos de otras ramas), insertados entre `¿Resuelto Articulo Suelto (Grupo)?`
  (rama falsa) y `Preparar Repregunta Modelo (Grupo)`: `Extraer Tema Negocio (Grupo)` (agente,
  detecta si hay una pregunta real de negocio en el mensaje y de qué tema, mismo prompt/lista de
  temas que ya usa la rama simple del partidor) → `Parsear Tema Negocio (Grupo)` → `¿Es Negocio?
  (Grupo)`: si no hay pregunta de negocio, sigue exactamente igual que antes; si la hay, `Buscar
  Info Negocio (Grupo)` consulta `info_negocio` con `rm_score` (mismo mecanismo que la rama
  simple) → `¿Hay Info Negocio? (Grupo)`: si hay dato, lo contesta (`Preparar/Enviar Respuesta
  Negocio (Grupo)`) y sigue con la repregunta de moto (2 mensajes, mismo patrón que ya usa la
  respuesta de artículo suelto); si no hay dato, escala en silencio (`Registrar Pendiente Negocio
  (Grupo)` inserta en `preguntas_sin_match_pendientes`, `Preparar Nota Escalado Negocio (Grupo)`
  reusa el `Enviar Nota Escalado` compartido) y TAMBIÉN sigue con la repregunta de moto — nunca se
  pierde nada, siempre termina en una respuesta o en un pendiente visible. 291→301 nodos. Validado
  en la conversación de prueba (2411) con los dos casos: "Hacen envíos a todo el país" (dato
  cargado) contestó con el texto real de `info_negocio` y siguió preguntando la moto; "Tienen
  garantía?" (tema sin cargar, ver pendiente de "garantia" más abajo) escaló en silencio con nota
  privada y también siguió preguntando la moto — 0 casos sin respuesta ni rastro.
  **`rutas-bot-chatwoot.html` sigue desactualizado** (ya lo estaba desde el precheck de
  compatibilidad del 23/08, ver arriba; ahora además le falta toda la rama de artículo suelto +
  negocio del grupo esperando moto) — pendiente de una pasada de actualización más grande, no solo
  este cambio.
- **Fix real: la variante (corto/largo) ya mencionada por el cliente se perdía cuando la
  compatibilidad la confirmaba el EQUIPO a mano, no la base (2026-08-24).** Caso real: conv 2548
  (+5493644820129) escribió en un solo mensaje "Se la quiero poner a un Corven recorrido corto" —
  el bot extrajo bien "Corven" mismo, pero al no tener compatibilidad cargada para esa marca
  escaló al equipo (correcto). El problema era lo que iba a pasar DESPUÉS: cuando el equipo
  confirmara compatibilidad, el bot iba a volver a preguntar "¿es corto o largo?" ignorando que el
  cliente ya lo había dicho. Causa: ya existe `Resolver Variante Anticipada` (agregado el 22/08
  para el mismo problema, conv 1097 — "moto keeler110, recorrido corto" en un solo mensaje), pero
  solo está conectado al camino donde la compatibilidad se resuelve SOLA contra la base
  (`¿Es Compatible (Grupo)?`) — nunca se conectó al camino donde la confirma el equipo a mano vía
  nota privada. Fix: 7 nodos nuevos, aislados (no se reusan los nodos de la rama automática porque
  esta ejecución nace de un webhook distinto — la respuesta del equipo — sin `Unir Mensajes` ni
  `Buscar Kits Activos` como ancestros; hace falta releer el mensaje original desde
  `preguntas_tecnicas_pendientes.pregunta_original` y las variantes directo de `chat_packs`),
  insertados entre `¿Es Compatible? (Actualizar Pin)` (rama true) y
  `Actualizar Pin Esperando Variante (Respuesta Equipo)`: `Buscar Variantes del Grupo (Respuesta
  Equipo)` → `Resolver Variante Anticipada (Respuesta Equipo)` (mismo prompt que el original,
  adaptado a esta fuente de datos) → `Parsear Variante Anticipada (Respuesta Equipo)` →
  `¿Variante Anticipada Resuelta? (Respuesta Equipo)`: si sí, pinea el pack final directo
  (`Marcar Pack Final Pineado (Respuesta Equipo)`) y manda la confirmación con precio
  (`Enviar Bienvenida Pack Final (Respuesta Equipo)`, origen `bienvenida_variante_anticipada_equipo`)
  sin preguntar nada más; si no, sigue exactamente igual que antes (pin `esperando_variante`, se
  pregunta cuando el cliente vuelva a escribir). 301→308 nodos. **Gotcha de esta sesión:** el nodo
  Redis nuevo necesitaba la credencial `redis` explícita (`Redis account 2`, mismo id que ya usan
  los demás nodos Redis del workflow) — el primer intento de `PUT` falló con "Missing required
  credential: redis" hasta agregarla a mano. **Nota sobre orden de mensajes:** cuando la
  compatibilidad la confirma el equipo vía nota privada (no en este test, que usó una respuesta NO
  privada a propósito para no interferir), la confirmación genérica ("Sí, es compatible.") y esta
  bienvenida con precio salen por dos ramas paralelas sin orden garantizado entre sí — no es grave
  (los dos mensajes suman info, no se contradicen), pero puede llegar la del precio antes que la
  de compatibilidad. Validado en la conversación de prueba (2411) con una moto sin dato cargado a
  propósito ("Voskhod Minsk 350 recorrido corto"): escaló normal, y al simular la respuesta del
  equipo (`/api/chatwoot/prueba-responder-equipo`) el bot mandó directo "Genial, entonces le va
  perfecto el combo de Tapa CDI + Cilindro 120 recorrido corto — $175.000..." sin volver a
  preguntar la variante — `preguntas_tecnicas_pendientes` quedó `respondida` y
  `chat_articulo_compatibilidad` con las 3 filas esperadas (mismo aprendizaje de siempre, sin
  cambios ahí). Datos sintéticos de la prueba borrados al terminar.
- **Fix real: audio transcripto "bien" (sin error) pero con basura, hacía repetir la misma
  repregunta en bucle sin escalar nunca (2026-08-24).** Caso real: conv 2593 (+5493537323297)
  mandó 4 audios seguidos con el grupo Tapa CDI esperando la moto; el equipo tuvo que apagar el
  bot a mano (`/bot off`) porque repitió "Que marca y modelo es tu moto?" 3 veces sin parar.
  Investigado contra las ejecuciones reales de n8n (no solo hipótesis): `Transcribir Audio` (el
  llamado a Whisper) **no tiró ningún error las 3 veces** — devolvió con éxito
  `"Pa-pa-pa-pa-pa-pa-pa-pa..."`, una alucinación conocida de Whisper con audio poco claro o con
  ruido (en vez de fallar, inventa la misma sílaba repetida). Como no fue un error, nunca entró al
  camino de escalado que ya existía para audio fallido (`Registrar Pendiente Audio Fallido`, ese
  camino solo se dispara si la llamada a la API falla) — el texto basura se metió en la ráfaga
  como si el cliente hubiera dicho eso, `Extraer Modelo Grupo` no encontró ninguna moto (correcto,
  no hay ninguna) y el flujo volvía a preguntar, sin darse cuenta de que algo venía fallando.
  **Primer intento (insuficiente, corregido en la misma sesión):** un chequeo de "¿transcripción
  vacía?" — no alcanzaba porque el texto real nunca vino vacío, siempre vino con esta basura.
  **Fix que sí funciona:** nodo nuevo `Evaluar Transcripción` (Code) después de `Transcribir
  Audio`, que marca el texto como no útil (mismo camino que un audio fallido) en dos casos: (1) el
  texto está vacío, o (2) una sola palabra/sílaba domina ≥70% del texto Y hay ≥8 palabras en total
  (el patrón real de la alucinación) — los dos umbrales juntos evitan falsos positivos con
  repetición normal de una charla real (probado explícitamente: "no no no no no no" o "mira mira
  mira necesito el precio" NO se marcan como basura, "Pa pa pa pa pa pa pa pa pa pa pa pa pa pa
  pa" sí). También detecta frases fijas conocidas que Whisper alucina con silencio/ruido (ej.
  "Subtítulos realizados por la comunidad de Amara.org", un artefacto real y reproducible de
  Whisper con audio en silencio). El IF que sigue (renombrado `¿Transcripción Inútil?`, antes
  `¿Transcripción Vacía?`) enruta a `Registrar Pendiente Audio Fallido` igual que un error real —
  mismo mensaje de nota privada de siempre ("Llegó un audio que no pudimos transcribir
  automáticamente..."). 308→310 nodos. Validado en producción con un audio de silencio real
  (genera la alucinación de Amara.org de forma reproducible): ahora escala en silencio en el
  primer audio en vez de repetir la repregunta. La lógica de repetición de palabras se probó
  aparte contra los 3 textos reales de la conversación real (los 3 "Pa-pa-pa..." → marcados
  correctamente como basura) y contra frases normales con repetición (correctamente NO marcadas).
- **Gap grande: un kit SIMPLE (sin variantes) ya pineado nunca chequeaba compatibilidad si la moto
  llegaba en un mensaje aparte de la bienvenida (2026-08-24).** Caso real: conv 2596
  (+5493755383488), Kit 200 (`kit dakar 200 economico`, id 12 en `chat_packs`). La bienvenida
  preguntó "a que moto se la queres poner?" y el cliente contestó "Es para una Zanella Rx 150" en
  el siguiente mensaje — el bot escaló como "sin_match" genérico pese a que `chat_combo_compatibilidad`
  YA tenía "rx 150" cargado como compatible para ese kit. Causa (confirmada contra la ejecución
  real, no solo hipótesis): el chequeo de compatibilidad para kit simple (`Extraer Pregunta
  Compatibilidad`, con su pipeline completo de `Buscar Compatibilidad del Kit` etc.) solo estaba
  conectado al momento en que `Identificar Necesidad` pinea el kit por primera vez -- si la moto
  llegaba en un mensaje POSTERIOR, `¿Es Kit Ya Resuelto?` mandaba directo al partidor genérico de
  sub-preguntas (que no sabe nada de compatibilidad), sin pasar nunca por ese chequeo. Mismo tipo
  de gap que el de negocio-en-grupo de más arriba, pero para kits simples. **Fix mínimo, sin nodos
  nuevos:** se re-cableó `¿Es Kit Ya Resuelto?` (rama true) para que entre primero por `Extraer
  Pregunta Compatibilidad` en vez de ir directo al partidor -- se reutiliza el pipeline entero que
  ya existía y ya funcionaba bien (se verificaron los ~35 nodos río abajo uno por uno: todas sus
  referencias `$()` apuntan a ancestros universales tipo `Webhook1`/`Unir Mensajes`/`Parsear Kit
  Pineado`, o están protegidas con try/catch -- por eso alcanzó con reconectar, sin duplicar nada).
  Si el mensaje no es sobre compatibilidad, el mismo pipeline cae solo al partidor genérico como
  antes (no se perdió ningún camino existente). Validado con el Kit 200 real: "Es para una Zanella
  Rx 150" ahora contesta "Sí, el kit es compatible con tu Zanella Rx 150." en vez de escalar.
  **Bug de base de datos encontrado de yapa, validando el camino "sin dato" (2026-08-24):**
  `preguntas_tecnicas_pendientes.kit_id` todavía tenía una foreign key vieja contra `kits_publicidad`
  (la tabla retirada el 21/08) -- nunca se había notado porque este camino de escalada para kit
  simple jamás se había ejecutado de verdad hasta este fix, y las pruebas de compatibilidad de
  GRUPO habían tenido la suerte de usar ids que por casualidad seguían existiendo en la tabla
  vieja. Sin el fix, cualquier kit/grupo nuevo sin ese id coincidente rompía la ejecución entera
  con error (el cliente no recibía ni siquiera el escalado silencioso de siempre). Sacada la
  restricción vieja (`pendientes-tecnicas-sin-fk-kits-publicidad.sql`, ya corrida en producción) --
  validado repitiendo el mismo caso: ahora escala en silencio con nota privada, sin error.
- **Fix chico de categorización: mencionar SOLO la ciudad/provincia (sin preguntar nada) caía como
  "cierre" en vez de "envio" (2026-08-24).** Caso real: conv 2594 (+5493765060124), justo después
  de confirmarle que su moto era compatible con el Kit 170, el cliente escribió "dale yo soy de
  misiones Posadas" -- el bot contestó el cierre genérico ("Dale, cualquier cosa nos escribís.")
  en vez de aprovechar que ya tiene cargada la info de envíos. Es un patrón real y frecuente: decir
  la ciudad sin preguntar nada es la forma más común en la que la gente pregunta indirectamente si
  el envío llega hasta ahí, sobre todo en ese momento de la charla -- pero el prompt de `Dividir y
  Etiquetar Sub-preguntas` no tenía ninguna excepción para esto (a diferencia de otras excepciones
  ya sumadas para el mismo tipo de falso positivo de "cierre"). Fix: nueva excepción explícita en
  la definición de "envio" del prompt -- mencionar solo ciudad/provincia sin pedir nada más cuenta
  como "envio", con el caso real como ejemplo. Validado en la conversación de prueba repitiendo el
  caso exacto (Kit 170, "dale yo soy de misiones Posadas"): contestó "Tenemos envío gratis a
  Posadas por Andreani a domicilio o vía cargo a sucursal. La demora es de 4 a 6 días hábiles." --
  incluso personalizó la respuesta con el nombre de la ciudad al redactar, no solo evitó el cierre
  genérico.
- **Mensajes de mayoristas ahora se ignoran (2026-08-24), a pedido de Martín.** Antes el bot
  respondía con el flujo normal de venta minorista a cualquier número, incluidos los ~47
  mayoristas cargados en `"NumerosMayoristas"` (tabla ya existente, usada por otro workflow de
  n8n aparte, id `pwB14GsNMDc4tA45`, "chatwoot" -- ahí ya había un chequeo `es mayorista?` con la
  misma query). Fix: 3 nodos nuevos justo después de `Es mensaje entrante` (antes de cualquier
  agrupado de ráfaga, LLM, o Redis) -- `Chequear Es Mayorista` (Postgres, mismo patrón `LEFT JOIN
  LATERAL` para garantizar 1 fila siempre) → `¿Es Mayorista?` → si es mayorista, `Fin - Mayorista
  Ignorado` (noOp, no manda nada, no seed en Redis, no gasta ninguna llamada de IA); si no,
  sigue exactamente igual que antes. **Gotcha encontrado probando:** el número de prueba
  (`+5493513784909`) ya está cargado en `"NumerosMayoristas"` como "REVOLUCION MAYORISTA" -- sin
  excluirlo, el fix rompía silenciosamente toda prueba futura con la conversación de prueba
  (dejaría de responder sin ningún error visible). Se agregó la misma exclusión que ya usaba el
  otro workflow (`AND telefono != '5493513784909'`) -- mismo criterio, no es cosa nueva. Validado
  con un número mayorista ficticio (`5490009998877`, insertado y borrado solo para la prueba): la
  ejecución terminó limpia en 7 nodos sin ninguna llamada externa; y por separado se confirmó que
  el número de prueba real sigue respondiendo normal (la exclusión funciona). 310→313 nodos.
- **Fix real: una PREGUNTA insegura del cliente sobre corto/largo se confundía con una elección
  real (2026-08-24).** Caso real: conv 2542 (+5493584392257), Tapa CDI. El cliente preguntó
  "sería recorrido corto entonces?" (buscando que se lo confirmemos, no afirmando nada) y el bot
  (`Resolver Variante`) lo tomó como si hubiera elegido "corto" y confirmó el combo con ese dato
  mal. El cliente aclaró después "yo t pregunto porq no tengo nii idea sii es recorrido largo o
  corto" y el bot, ya con el pack mal pineado, siguió respondiendo sobre el combo equivocado en
  vez de darse cuenta del error -- terminó con el equipo apagando el bot a mano y un humano
  resolviéndolo (recorrido largo, tras pedirle que revise la corona de distribución). Causa: el
  prompt de `Resolver Variante` no distinguía entre el cliente AFIRMANDO una variante que ya sabe
  ("es corto") y el cliente PREGUNTANDO o DUDANDO aunque mencione la palabra ("sería corto
  entonces?", "no tengo idea") -- ambas casuísticas se trataban igual. Fix (dos partes, mismo
  prompt sin nodos nuevos):
  1. Nueva regla explícita en `Resolver Variante`: si el cliente pregunta/duda, aunque nombre una
     de las opciones, `pack_id: null` -- nunca asumir la respuesta.
  2. El mensaje de repregunta (`Enviar Repregunta Variante`, disparado cuando no se puede
     resolver) dejó de ser un texto fijo genérico ("Perdón, no me quedó claro — me confirmás si es
     corto o largo?") y ahora reutiliza el campo `pregunta_variante` del grupo pineado -- el mismo
     campo ya editable en `/admin/chatwoot/catalogo` → pestaña Grupos que se usa para la primera
     pregunta tras confirmar compatibilidad. Con esto, cargar una sola vez una pista concreta en
     ese campo sirve para las dos situaciones (primera pregunta y cualquier reintento).
  3. A pedido de Martín, se sumó al campo `pregunta_variante` de Tapa cdi (id 3) y Kit 120 (id 1
     -- comparten el mismo cilindro, mismo criterio corto/largo) una pista más concreta que "el
     color": la cantidad de dientes de la corona de distribución (28 = corto, 32 = largo),
     confirmada por Martín antes de cargarla. El color se dejó como ayuda secundaria.
  Validado en la conversación de prueba replicando el caso exacto (Tapa CDI, moto compatible,
  luego "sería recorrido corto entonces?" y después "no tengo ni idea si es largo o corto"): en
  los dos casos el bot NO confirmó ninguna variante -- repreguntó con el mensaje mejorado
  (dientes de la corona), en vez de asumir mal como antes. **Sin cubrir a propósito:** el bot no
  interpreta una respuesta tipo "tiene 28 dientes" como "corto" -- Martín pidió la pista para que
  el cliente mismo lo resuelva y conteste con una palabra clara, no que el bot haga la cuenta.
- **Fix real: el cliente entra por un kit y en la misma ráfaga pregunta por OTRO kit distinto —
  ese pedazo se perdía (2026-08-31).** Caso real: conv 2934 (+5492617087050). Ráfaga: plantilla
  exacta del grupo Tapa cdi + "Q precio está el kit 200 para el carrilero s s2" + "Varrilero". El
  grupo Tapa cdi quedó pineado esperando moto y el resto se mandó a `Extraer Modelo Grupo`, que lo
  colapsó a `modelo_moto: "s2"` y tiró "kit 200 / carrilero / varrilero" a la basura — después
  fabricó una nota de compatibilidad falsa ("¿Tapa cdi compatible con s2?"). La consulta del Kit
  200 nunca apareció en ningún lado (ni la nota lo mencionaba). Causa: una vez que la ráfaga
  matchea plantilla (o hay pin), el "resto" solo se interpreta relativo al kit actual (moto / pieza
  suelta / negocio) — no hay ningún paso que se pregunte "¿el resto es OTRO kit?". Fix (sin IA,
  solo detección + escalado, **no** auto-responde el segundo kit): 4 nodos nuevos entre `¿Pineado
  Esperando Moto?` (rama true) y `Extraer Modelo Grupo` — `Detectar Otro Kit en Resto (Grupo)`
  (Code: normaliza el resto y busca "kit NNN" / "combo NNN" / "NNNcc" o un token distintivo de 5+
  letras único de un solo kit, contra `Buscar Kits Activos`, excluyendo los números/palabras que
  el propio grupo pineado ya menciona) → `¿Otro Kit en Resto? (Grupo)` (If): si detecta →
  `Registrar Pendiente Otro Kit (Grupo)` (insert en `preguntas_sin_match_pendientes` con el resto
  textual) → `Preparar Nota Otro Kit (Grupo)` → `Enviar Nota Escalado` (compartido); si no →
  `Extraer Modelo Grupo` como siempre. El grupo sigue pineado esperando la moto y la bienvenida ya
  se mandó antes. 427→431 nodos. Script: `apply-fix-otro-kit-en-resto-grupo.mjs`, backup
  `workflow_backup_pre-fix-otro-kit-en-resto-grupo_2026-08-31.json`. Validado en la conversación de
  prueba (2411): (1) réplica exacta del caso → `otro_kit_detectado: true` ("kit dakar 200
  economico"), escaló textual «Q precio está el kit 200 para el carrilero s s2 / Varrilero», y
  `Extraer Modelo Grupo` **no** corrió (cero nota de compat falsa); (2) regresión con "es para una
  zanella zb 110" de resto → `false`, sigue por `Extraer Modelo Grupo` sin cambios. **Sin cubrir a
  propósito:** solo la rama grupo esperando moto (donde apareció el caso); las ramas de kit simple
  / esperando variante / Identificación tienen el mismo agujero teórico pero sin caso real todavía.
  Detección deliberadamente conservadora (solo "kit/combo NNN" explícito o token muy distintivo) —
  un falso negativo cae al comportamiento de antes, no empeora nada. `rutas-bot-chatwoot.html`
  sigue desactualizado (ya lo estaba). Ver [[project-chatwoot-grupo-vs-kit-simple-drift]].

## Qué falta / pendiente (al 2026-08-21)

- ~~BUG GRAVE: `/bot off` puede no pausar la conversación~~ — **arreglado 2026-08-26.** Caso real:
  conv 2650 (+5492946509748). Martín escribió `/bot off` (nota privada) tres veces en la misma
  charla y las tres veces el bot le siguió respondiendo minutos después, pisando sus respuestas
  manuales al cliente (una vez incluso mandó "perdon, no era para vos" en público sin querer). Causa
  raíz confirmada contra las ejecuciones reales de n8n: **`/bot off` no era un comando especial que
  el workflow reconociera por su texto** — cualquier mensaje del equipo en una conversación primero
  se intentaba interpretar como la respuesta a una pregunta pendiente de esa charla
  (`preguntas_sin_match_pendientes`/técnicas), y recién si no había ninguna pendiente seguía el
  camino que hace `SET bot_pausado`. Con una pregunta técnica pendiente sin cerrar, cada `/bot off`
  se interpretaba como intento de respuesta a ESA pregunta vieja, la IA decía "confianza baja, no
  hago nada" y ahí terminaba la ejecución, sin llegar nunca al nodo de pausa.
  **Fix aplicado** (directo contra la API de n8n, nodo nuevo, sin tocar la lógica de interpretación
  de pendientes): `¿Es Comando Pausar?` (If), espejo exacto del `¿Es Comando Reactivar?` que ya
  existía para `/bot on` (mismo patrón: compara `content.trim().toLowerCase()` contra `/bot off`,
  sin IA de por medio). Se insertó en el mismo punto de entrada donde ya corría el chequeo de
  `/bot on` — la salida falsa de `¿Es Comando Reactivar?` (antes iba directo a
  `¿Es Respuesta de Mi Equipo?`) ahora pasa primero por `¿Es Comando Pausar?`: si matchea, va directo
  a `Marcar Bot Pausado` (el nodo Redis que ya existía, sin clonar); si no, sigue exactamente el
  camino de siempre. 392→393 nodos.
  Validado con ejecuciones reales contra la conversación de prueba (2411): se cargó a propósito una
  pregunta técnica pendiente sintética (para reproducir la trampa) y se mandó `/bot off` simulando
  una nota privada del equipo — la ejecución (id 86354) confirmó el camino
  `¿Es Comando Reactivar?` → `¿Es Comando Pausar?` → `Marcar Bot Pausado`, saltando por completo la
  interpretación de pendientes. Regresión chequeada con `/bot on` inmediatamente después (ejecución
  86355): siguió corriendo `Reactivar Bot` sin cambios. Pendiente sintética borrada al terminar.
- ~~BUG GRAVE (relacionado pero distinto al de arriba): la rama "el equipo confirmó compatibilidad"
  ignora `bot_pausado` y el chequeo de nota privada~~ — **arreglado 2026-08-26.** Caso real: conv
  2751 (+5493816563307). `/bot off` sí pausó bien (confirmado: los 3 mensajes del cliente después
  generaron la nota de "pausa manual" como corresponde). El problema fue otro: con una pregunta de
  compatibilidad escalada sin cerrar (`preguntas_tecnicas_pendientes`, "¿Tapa cdi anda con faro
  cuadrado?"), Martín le fue contestando al cliente **en público** mientras el bot estaba pausado
  ("tu modelo lleva leva corta o larga?", "no vendemos pistón...", "va sin modificaciones, resortes
  originales."). La IA de `Interpretar Respuesta Equipo` leyó esa última respuesta pública como
  "el equipo confirmó que es compatible" (confianza alta) y el bot mandó automáticamente el mensaje
  final con precio al cliente 6 segundos después — pisando a Martín, que tuvo que aclarar "perdon,
  es emensaje no era para vos".
  **Causa raíz confirmada contra la ejecución real (id 86772):** el nodo `Guardar en
  Compatibilidades (Grupo)` se ramifica en paralelo hacia dos caminos — uno sí chequea `¿Fue Nota
  Privada?` antes de actuar (si fue pública, no hace nada, va a `Fin - Equipo Ya Respondio Directo`)
  — pero el otro (`¿Es Compatible? (Actualizar Pin)` → `Buscar Variantes del Grupo (Respuesta
  Equipo)` → ... → `Enviar Bienvenida Pack Final (Respuesta Equipo)`) **no pasaba por ese chequeo
  ni por `bot_pausado` en ningún punto** — corría siempre que la IA interpretara "sí, compatible",
  público o privado, pausado o no. El único chequeo de `bot_pausado` que existía en todo el workflow
  (`Chequear Bot Pausado` / `¿Bot Pausado?`) está alimentado únicamente por `¿Es Mayorista?`, es
  decir, solo protege la respuesta a un mensaje nuevo del cliente — nunca a esta rama.
  **Fix aplicado** (directo contra la API de n8n, 2 nodos nuevos, sin tocar la lógica de
  interpretación con IA): `Chequear Bot Pausado (Respuesta Equipo)` (Redis `get`, mismo patrón que
  el nodo original) → `¿Puede Avisar al Cliente? (Respuesta Equipo)` (If, AND: `pausado` vacío Y
  `private` true), insertados en el tramo `Guardar en Compatibilidades (Grupo)` →
  `¿Es Compatible? (Actualizar Pin)` (la otra salida de `Guardar en Compatibilidades` hacia
  `Marcar Pregunta Respondida` queda intacta). Si el gate da falso (pausado, o la respuesta del
  equipo fue pública) cae en `Fin - Equipo Ya Respondio Directo` sin mandar nada al cliente — el
  guardado de compatibilidad en `chat_articulo_compatibilidad` sigue ocurriendo siempre, solo se
  frena el aviso automático. 398→400 nodos.
  Validado con ejecuciones reales en la conversación de prueba (2411), pregunta pendiente sintética
  de compatibilidad cargada a mano (mismo `kit_id` real, grupo Tapa CDI): (1) `/bot off` simulado
  (ejecución 86788, confirmó `Marcar Bot Pausado` sin cambios — regresión del fix anterior intacta)
  seguido de una respuesta **pública** confirmando compatibilidad (ejecución 86789) — confirmado
  que llegó hasta `¿Puede Avisar al Cliente? (Respuesta Equipo)` y **no** alcanzó `Buscar Variantes
  del Grupo (Respuesta Equipo)` ni `Enviar Bienvenida Pack Final (Respuesta Equipo)`. (2) `/bot on`
  + nueva pendiente sintética + respuesta por **nota privada** (el uso legítimo original, ejecución
  86793) — confirmado que sí llegó hasta `Enviar Respuesta al Cliente (Aprendizaje)` (el intento de
  envío tiró un error de HTTP ajeno al fix, por payload de prueba incompleto — no afecta la
  conclusión: el camino legítimo sigue andando). Pendientes sintéticas, filas de
  `chat_articulo_compatibilidad` de prueba y pin/pausa de Redis, todo borrado al terminar.
- **BUG (tercero de la misma familia, mismo día): "confianza baja" tiraba a la basura una respuesta
  del equipo aunque sí trajera un mensaje útil para el cliente** — arreglado 2026-08-26. Caso real:
  conv 2791 (+5493513824227). El cliente preguntó, en el mismo mensaje, por una pieza no catalogada
  (cubierta) mencionando su moto — el clasificador lo escaló mal como "¿el kit pineado es compatible
  con esa moto?" (`preguntas_tecnicas_pendientes`). Martín contestó bien la pregunta real (precio de
  la cubierta) por nota privada, pero como esa respuesta no confirma ni descarta compatibilidad,
  `Interpretar Respuesta Equipo` la marca `confianza: "baja"` — y esa rama terminaba siempre en
  `Fin - Confianza Baja (no se actua)` sin mandar nada, aunque el JSON ya traía un `mensaje_cliente`
  armado y correcto (confirmado contra la ejecución real 87253: `compatible: null` pero
  `mensaje_cliente` con el precio real, descartado igual).
  **Fix aplicado** (1 nodo nuevo, sin tocar la IA ni la lógica de compatibilidad/pin):
  `¿Hay Mensaje Para Cliente? (Confianza Baja)` (If, AND: `pregunta_id` no vacío Y `mensaje_cliente`
  no vacío) insertado entre la salida falsa de `¿Confianza Alta?` y `Fin - Confianza Baja (no se
  actua)`. Si da verdadero, reusa los nodos que ya existían `Marcar Pregunta Respondida` →
  `¿Fue Nota Privada?` → `Enviar Respuesta al Cliente (Aprendizaje)` (mismo camino de Fase 7) — nunca
  toca `Guardar en Compatibilidades`/`¿Es Compatible? (Actualizar Pin)`, así que un `compatible: null`
  no puede escribir una fila falsa en `chat_articulo_compatibilidad` ni tocar mal el pin. 402→403
  nodos.
  Validado con 2 pendientes sintéticas en la conversación de prueba (2411): (1) nota privada que
  responde algo real pero no de compatibilidad → llegó hasta `Enviar Respuesta al Cliente
  (Aprendizaje)`, mensaje mandado de verdad (id Chatwoot 18093), pregunta marcada `respondida`, cero
  filas nuevas en `chat_articulo_compatibilidad`; (2) nota privada ambigua sin dato usable ("dale, ok,
  gracias") → siguió cayendo en `Fin - Confianza Baja` sin mandar nada, como antes. Filas sintéticas
  borradas al terminar.
- **PRÓXIMO PASO, a mitad de investigación:** falta cubrir el otro caso de "cuando el cliente
  contesta con un dato usable, seguir la charla" — la desambiguación de **3 opciones de kit**
  (`Enviar Repregunta Candidatos (Propuesta)`, el "¿Te referís al Kit 120 para 110, a la Tapa cdi,
  o al combo de ambos?"). A diferencia de corto/largo (ver abajo, ya confirmado que anda bien),
  ESTA repregunta no tiene un nodo dedicado tipo `Resolver Variante` — depende de que
  `Identificar Necesidad` vuelva a correr con el historial actualizado (ya lo hace, trae ~8
  mensajes reales) y logre pinear el kit correcto cuando el cliente contesta algo claro (ej. "la
  tapa cdi", o directamente el modelo de la moto). **Todavía no se probó en vivo si esto
  efectivamente resuelve bien o si se queda escalando en silencio también en el caso claro** (con
  el fix de hoy ya no manda un cierre falso, pero falta confirmar que además avanza cuando puede).
  Caso real que lo disparó: conv 2335, +5493447558519 (Abimael) — ver detalle completo un poco
  más abajo, en la sección de la conversación real que quedó sin resolver.
  - Para retomar: reproducir en la conversación de prueba (limpiar pin, mandar plantilla
    ambigua o forzar `candidatos` de alguna forma, contestar con un dato claro) e inspeccionar la
    ejecución igual que se hizo para validar el fix de "cierre" y el de `Resolver Variante`.
  - **Ya confirmado y DESCARTADO como problema (2026-08-21, en vivo):** el camino de corto/largo
    (`¿Pineado Esperando Variante?` → `Resolver Variante`) sí funciona bien hoy — se probó de
    punta a punta en la conversación de prueba (plantilla Tapa CDI → moto compatible Zanella ZB
    110 → "Recorrido corto es la mia") y resolvió `pack_id 7` correcto, con precio real, sin
    escalar. El ejemplo de "Recorrido corto es la mia" que aparece más arriba como caso de
    "cierre" mal clasificado es de ANTES de la migración a grupos/variantes del mismo día — en
    ese momento no existía `Resolver Variante` todavía, así que no es una regresión ni algo para
    arreglar de nuevo.
- **Conversación real sin resolver: conv 2335, +5493447558519 (Abimael Dasilva).** Preguntó por
  el combo Tapa CDI, dio la moto (Corven 110 2015), el bot escaló compatibilidad dos veces por
  caminos distintos sin que nadie conteste (`preguntas_tecnicas_pendientes` id 139, creada
  12:15, `es_grupo: false` -- posiblemente mal, revisar; y `preguntas_sin_match_pendientes` id
  180, creada 15:02, mismo tema duplicado) y después preguntó a cuál de 3 opciones se refería, el
  cliente contestó "Sisi" (no elige ninguna) y el bot le mandó el cierre falso a las 20:37 (el
  bug que motivó todo el fix de hoy). Sigue sin respuesta del cliente. Hace falta: (1) que el
  equipo conteste la compatibilidad real (¿entra en una Corven 110 2015?) en el panel de
  pendientes, y (2) mandarle a Abimael una aclaración manual de a qué producto se refería, porque
  el bot no lo va a hacer solo (dedup de pendiente por conversación lo deja en silencio, ver
  arriba). De paso: raro que haya dos pendientes distintas para la misma pregunta — capaz vale la
  pena revisarlo junto con el mismo hallazgo ya anotado para conv 2226/2248 (ver abajo).
- ~~Reescribir el `mensaje_bienvenida` propio de los packs~~ — hecho el 2026-08-21: encontrado
  en vivo probando la conv 1 (Kit 120 corto devolvía el texto viejo de un solo precio y volvía a
  preguntar la moto ya confirmada). Era más amplio de lo que se pensaba — afectaba a los 6 packs
  finales de los 3 grupos (3,4,5,6,7,8), no solo a Tapa CDI. Reescritos los 6 con un mensaje de
  confirmación (compatibilidad + variante + precio ya resueltos, invita a coordinar, sin sonar a
  "cierre") — mismo molde en los 3 grupos, redactado con Martín.
- **Monitorear en tráfico real** los 3 grupos migrados (Kit 120, Escape pwr+Leva, Tapa CDI) — ya
  confirmado con clientes reales (ver "Bug real de la ventana de transición" y "Barrido de
  reprocesamiento" arriba), pero el barrido solo cubrió las últimas 48hs. Si aparece un pin raro
  de una conversación de antes del 2026-08-19, es probable que sea la misma ventana de
  transición — limpiar el pin de ese teléfono alcanza, no hace falta tocar el workflow de nuevo.
- **Revisar si quedó nota duplicada** en conv 2226 y 2248 (Chatwoot) — el barrido de
  reprocesamiento les contestó precio/stock pero la compatibilidad volvió a escalar; puede haber
  quedado una nota de escalado vieja al lado de una nueva para la misma pregunta.
- **Extraer moto no separa varias motos en el mismo mensaje** (`Extraer Modelo Grupo` y probable
  también `Extraer Modelo` de compatibilidad simple) — encontrado en conv 2336 (+5493865610660):
  el cliente nombró 2 motos y quedaron pegadas en un solo string, así que ninguna matcheó pese a
  tener datos cargados. Cae a escalado silencioso (seguro), pero nunca se resuelve solo. Si se
  vuelve un patrón frecuente, separar por conectores ("y", ",") antes de buscar compatibilidad.
- **Bug real en `rm_modelo_ok` (2026-08-21): las entradas de compatibilidad de
  una sola palabra nunca matcheaban, ni siquiera contra sí mismas.** La función
  exigía ≥2 palabras en común entre lo guardado y lo consultado — bien pensado
  para evitar falsos positivos con frases largas, pero rompía cualquier entrada
  cargada como una sola palabra ("motomel", "keller", "wave", "crypton", "biz",
  "Mondial", "Trip", "110" — 12 filas en total, todas inutilizables). Encontrado
  probando "a una motomel dlx" en la conversación de prueba (conv 1): quedó
  escalada en silencio pese a que "motomel" ya estaba cargado como compatible.
  **Fix aplicado** (`n8n-workflows/fix-rm-modelo-ok-un-token.sql`, ya corrido en
  producción): el mínimo de coincidencias ahora es `LEAST(2, cantidad de
  palabras de lo guardado)` — si lo guardado tiene una sola palabra, alcanza con
  que esa palabra aparezca. Validado con 8 casos antes de aplicar (incluye que
  los casos ya-rotos por otros motivos, como "corven energy y motomel bliz"
  pegados o el typo "bliz"/"blitz", siguen sin matchear — este fix no los
  toca) y confirmado en vivo: la conv 1 pasó de escalar en silencio a
  reconocer "motomel dlx" como compatible y preguntar corto/largo.
- **Dos bugs más en la extracción/comparación de modelo de moto (2026-08-21,
  encontrados seguidos probando en vivo):**
  1. **`rm_modelo_ok` ignoraba años, ahora sí.** El mismo problema del match_count
     de arriba tenía una segunda cara: un año (2015, 2021, etc.) contaba como
     palabra para el mínimo de coincidencias, así que el mismo modelo guardado y
     consultado con años distintos (ej. "dlx 2015" vs "dlx 2021") no matcheaba —
     la compatibilidad de un kit no depende del año de la moto. Fix en
     `rm_tokens_modelo` (`n8n-workflows/fix-rm-tokens-modelo-ignora-anio.sql`):
     cualquier token de 4 cifras que parezca año (19xx/20xx) se descarta al
     tokenizar. No hace falta limpiar los datos ya cargados con año (5 filas
     existentes) porque ahora matchean igual sin importar qué año tengan escrito.
  2. **Los prompts de extracción de modelo no reconocían un modelo sin marca.**
     Encontrado con "Para un trip" (grupo Kit 120): `Extraer Modelo Grupo`
     devolvía `modelo_moto: ""` pese a que "Trip" es un modelo real de
     Guerrero/Gilera ya cargado en la base — el prompt solo daba ejemplos con
     marca+modelo ("Zanella ZB 110"), y el modelo de IA prefería no arriesgar.
     Mismo prompt hermano `Extraer Pregunta Compatibilidad` (kit sin grupo) tenía
     el mismo sesgo. Fix: se agregó una aclaración explícita en los dos prompts
     de que un nombre propio sin marca también cuenta (con los mismos ejemplos
     reales ya cargados: Trip, Mondial, Keller, Biz, Wave, Crypton). Aplicado
     directo contra la API de n8n (`setNodeParameter` sobre `systemMessage`),
     validado en producción: "Para un trip" ahora sí extrae `"trip"`.
  - **Resultado real del caso que disparó todo esto:** con los 3 fixes de arriba
    ya en producción, "Para un trip" contra el Kit 120 sigue sin contestarse
    solo — pero ahora por el motivo correcto: la compatibilidad de "Trip" está
    cargada para la Leva del combo Escape+Leva 6.40, NO para las piezas del Kit
    120 (cilindro/carburador/codo/filtro). Es un dato real que falta cargar, no
    un bug — quedó la pendiente (id 155) con el modelo correcto anotado para que
    se cargue.
- **Bug grande: las escaladas de compatibilidad de un GRUPO nunca avisaban al
  equipo ni aprendían (2026-08-21).** Encontrado con Martín a partir del caso
  de "Trip" de arriba: cuando el bot no encuentra compatibilidad para un KIT
  SIMPLE (sin variantes), manda una nota privada a Chatwoot
  (`Preparar Nota Escalado` → `Enviar Nota Escalado`) para que el equipo
  conteste — pero esa conexión nunca se armó para la rama de GRUPO (Kit 120,
  Escape+Leva, Tapa CDI): `Registrar Pregunta Pendiente (Grupo)` guardaba en
  la base y ahí terminaba, en silencio total, sin nota ni forma de que el
  equipo se entere. Y aunque el equipo la hubiera encontrado a mano en el
  panel de pendientes y quisiera cargarla, el guardado de aprendizaje
  (`Guardar en Compatibilidades`) asumía que `kit_id` siempre era un pack
  puntual (`WHERE pack_id = kit_id`) — para las de grupo, `kit_id` guarda el
  id del GRUPO, así que el INSERT no encontraba ningún pack con ese id y no
  guardaba nada, en silencio también.
  - **Fix completo (3 partes), aplicado directo contra la API de n8n:**
    1. Columna nueva `es_grupo` en `preguntas_tecnicas_pendientes`
       (`n8n-workflows/pendientes-tecnicas-es-grupo.sql`) para que el resto
       del flujo sepa si el `kit_id` de esa fila es un grupo o un pack.
       `Registrar Pregunta Pendiente` / `(Grupo)` ahora la escriben,
       `Buscar Preguntas Pendientes` la trae, `Parsear Respuesta Equipo` la
       pasa al resto del flujo.
    2. Nodo nuevo `Preparar Nota Escalado (Grupo)` (mismo texto que el
       original, con los datos del grupo) conectado desde
       `Registrar Pregunta Pendiente (Grupo)` hacia el `Enviar Nota Escalado`
       que ya existía — ahora sí avisa en Chatwoot.
    3. Nodo nuevo `¿Es Grupo (Respuesta Equipo)?` (If) justo después de
       `¿Confianza Alta?`, que separa hacia `Guardar en Compatibilidades`
       (como siempre, para packs puntuales) o hacia el nodo nuevo
       `Guardar en Compatibilidades (Grupo)`, que en vez de `WHERE pack_id =
       kit_id` hace `WHERE p.grupo_id = kit_id` uniendo `chat_pack_articulos`
       con `chat_packs` — inserta la compatibilidad para **todos los
       artículos de todos los packs del grupo a la vez** (decisión de diseño
       charlada con Martín: la compatibilidad de "¿le entra el combo a esta
       moto?" es la misma sin importar la variante corto/largo que elija
       después — las piezas que cambian entre variantes, ej. el cilindro, no
       cambian si el motor/chasis acepta el kit).
  - **Validado en vivo de punta a punta** con la conversación de prueba
    (grupo Tapa CDI + "Bajaj Boxer 150", moto inventada para garantizar que
    no hubiera dato previo): nota privada llegó bien
    (`preguntas_tecnicas_pendientes` id 156, `es_grupo: true`), se simuló la
    respuesta del equipo, y el flujo completo corrió solo — guardó 3 filas en
    `chat_articulo_compatibilidad` (una por cada artículo del grupo: tapa,
    cilindro corto, cilindro largo), marcó la pendiente `respondida`, y le
    mandó al cliente "Sí, es compatible con la Bajaj Boxer 150 modelo 2020 y
    entra sin modificar nada." con la voz del bot, sin revelar que hubo un
    humano en el medio (mismo patrón ya establecido de Fase 7).
  - **Nota:** las pendientes de grupo que ya existían ANTES de este fix
    quedaron con `es_grupo = false` por default (la columna no existía). Se
    corrigió a mano la de Yoel (id 155, "Trip") por ser la que motivó todo
    esto; el resto de las viejas no se tocó — si alguna se contesta antes de
    que se reprocese, va a guardar mal igual que antes. No es grave (dato real
    faltante, no hay downside más allá de tener que cargarlo de nuevo), pero
    si se quiere prolijo, revisar `preguntas_tecnicas_pendientes` con
    `kit_id` que matchee un `chat_pack_grupos.id` y marcarlas `es_grupo=true`
    a mano.
- **Nodo huérfano `Parsear Estado Pineado`** (borrador previo al corte real, ya sin uso ni
  conexión al flujo) sigue en el canvas de n8n — limpieza cosmética, se puede borrar cuando se
  retome esto, no urge.
- **Cargar el tema `garantia`** en `/admin/chatwoot/conocimiento` — hoy no tiene datos, así que
  cualquier pregunta de garantía escala en vez de contestarse sola.
- ~~Árbol de artículos: falta el paso de matching en el workflow~~ — superado: `kit_articulos`
  (la tabla vieja, solo Kit 8) quedó sin uso real desde que `kits_publicidad` se retiró del
  workflow (ver el corte del 2026-08-21 arriba). El matching de pieza suelta que reemplaza esta
  idea ya está construido y en producción sobre el catálogo nuevo (`chat_articulos`) — ver
  "Matching de artículo suelto dentro de un kit pineado" arriba.
- **Migración a GPT-5.6 sin validar a fondo la calidad de redacción** todavía — hecha por costo/
  disponibilidad, no por un problema con DeepSeek. Si aparece algo raro en el tono de una
  respuesta desde el 19/08, revisar si es esto antes que un bug de prompt nuevo.
- **`preguntas_precio_pendientes` / `preguntas_negocio_pendientes` son harina de otro costal.**
  El panel las lee y las tiene desde antes, pero el workflow 2.0 nunca escribe ni escucha
  respuestas ahí — son remanentes de `workflow_mateo`. La Fase 6 ya cubre ese terreno de otra
  forma (categorías `envio`/`negocio`/`otro`), así que no parece necesario portarlas — solo
  tenerlo presente si aparece un caso que no encaje en ninguna categoría nueva.
- **La rama `negocio` del partidor hace una llamada extra de IA** (clasificar el tema puntual:
  horarios/ubicación/etc.) en todo mensaje que llega a esa rama, por diseño (mantener el camino
  lineal sin bifurcar). Es plata/tiempo de más, chico pero real; margen de optimización si en
  algún momento importa el costo.
- **Sin ambiente de staging real para el workflow** (ver punto 1 de "Cómo se trabaja" arriba) —
  si hace falta uno aislado, armarlo pensado para "Respuestas chatwoot 2.0", no para el viejo.
- **Sin investigar:** un pin de Redis de un kit desapareció una vez bien dentro de su TTL de
  96hs (~44hs transcurridas, conv 2074, 18/08) sin causa determinada. Puede haber sido un caso
  aislado — si un pin desaparece antes de tiempo de nuevo, revisar.
- **Bug real con cliente afectado: `rm_modelo_ok` daba falso positivo entre motos que comparten
  nombre pero tienen cilindrada distinta (2026-08-21).** Conv 2110, +5493731635177 (Milton G.):
  preguntó por el Combo Escape PWR + Leva 6.40 diciendo tener una "Motomel Blitz 125", y el bot
  contestó "tu moto es compatible!" — no lo es, la única Blitz cargada compatible es la 110
  (china genérica, motor distinto a la 125). Martín lo agarró en el momento y corrigió a mano en
  el chat antes de este fix. Causa: `rm_modelo_ok` puntuaba por palabras en común sin pesar el
  número de cilindrada — "motomel blitz 125" vs "motomel blitz 110" comparte 2 de 3 palabras
  (score 0.667, arriba del umbral 0.5), y el número que sí decide (110≠125) contaba como una
  palabra más, no como dato excluyente. **Fix aplicado**
  (`n8n-workflows/fix-rm-modelo-ok-conflicto-cilindrada.sql`, ya corrido en producción): si tanto
  el modelo guardado como el consultado tienen un número y no coinciden, no matchea sin importar
  cuántas palabras compartan (función nueva `rm_numeros_conflictivos`). Validado contra las 251
  filas reales comparadas consigo mismas (0 regresiones) y contra 17 consultas realistas de
  motos/cilindradas antes de aplicar — solo cambió los 2 casos que debía cambiar (Blitz 110 vs
  125, y el mismo bug latente en Zanella ZB 110 vs 125, que no había llegado a pasar en
  producción todavía). **Ojo, el fix de función solo no alcanzaba:** la entrada genérica sin
  número `"motomel"` (compatible=true, habilitada por `fix-rm-modelo-ok-un-token.sql`) seguía
  matcheando "Motomel Blitz 125" igual, porque no tiene número con el cual entrar en conflicto —
  hizo falta sumar además una fila negativa puntual (`compatible=false`) para "motomel blitz 125"
  en los 3 artículos del combo, mismo patrón que ya existía para `biz 105/110/125`. **Pendiente
  real:** cualquier otra marca con líneas de distinta cilindrada que comparta nombre y solo tenga
  cargada una entrada genérica sin número corre el mismo riesgo silencioso — no hay forma
  automática de detectarlo, solo aparece cuando un cliente real lo dispara.
- **`Identificar Necesidad` se pierde con historial largo y mezclado, encontrado con un mensaje
  real en la propia conversación de prueba (2026-08-22).** Martín le escribió a `+5493513784909`
  (conv 1) "Hola. Quiero saber sobre la tapa cdi y cilindro 120" — nombra "Tapa cdi" casi literal,
  que está en la lista cerrada de kits activos — y el clasificador devolvió `tipo: "ninguno"` en
  vez de reconocerlo. Sin ningún kit identificado, el flujo cayó al camino genérico de
  sub-preguntas y respondió algo desconectado ("Sí, tenemos stock disponible... entrega
  inmediata") en vez de la bienvenida del kit + la pregunta de la moto. **Causa confirmada, no
  solo sospechada:** se repitió el mismo mensaje en una conversación nueva y limpia (sin el
  historial de meses de pruebas mezcladas de conv 1 — Kit 120, Tapa CDI, compatibilidad Bajaj
  Boxer, mensajes viejos con prefijo `[auditoria-fix-cierre]`, etc.) y ahí sí clasificó bien
  (`candidatos`, repreguntando entre Tapa cdi y Kit 120 para 110). El ruido del historial, no un
  bug de prompt nuevo, fue la causa. **No se tocó el prompt** — hacerlo más robusto contra
  historiales largos queda pendiente si vuelve a pasar con un cliente real (con clientes reales
  el historial nunca llega a ser tan largo ni tan mezclado de temas distintos como el de una
  conversación de pruebas de meses). **Acción tomada:** se retiró `conversation_id 1` como
  conversación de prueba (sigue existiendo en Chatwoot, solo no se usa más) y se armó una nueva,
  `conversation_id 2405`, mismo contacto/teléfono — ver punto 2 de "Cómo se trabaja" arriba.
- **Segundo hallazgo del mismo caso: la lista de kits que recibe `Identificar Necesidad` no
  alcanza para desambiguar productos con nombres que se pisan (2026-08-22).** Ya con historial
  limpio (conv 2405), el mismo mensaje "tapa cdi y cilindro 120" clasificó como `candidatos` entre
  "Tapa cdi" y "Kit 120 para 110" — mejor que "ninguno", pero seguía sin ser lo más inteligente:
  "Tapa cdi" es un nombre bastante exclusivo del combo id 3 (que ya incluye tapa cdi + cilindro
  120 + corona), y "Kit 120 para 110" ni siquiera trae tapa cdi. Causa: `Formatear Historial`
  (nodo Code) le pasaba a la IA la lista de kits activos con **solo el nombre**
  (`` `- id ${k.id}: ${k.nombre}` ``) — sin nada del contenido real de cada combo, así que la
  única señal que tenía para distinguir "Tapa cdi" de "Kit 120 para 110" era la palabra "120"
  compartida, y la trataba como ambigua. **Fix aplicado** (directo contra la API de n8n,
  `setNodeParameter` sobre el `jsCode` de `Formatear Historial`): se suma a cada línea el
  `plantillas_bienvenida` del kit (el texto real del anuncio, que ya se traía en
  `Buscar Kits Activos` pero no se usaba acá) — ej. `- id 3: Tapa cdi (anuncio del cliente: "¡Hola!
  Quiero más información SOBRE EL COMBO TAPA CDI 125 + CILINDRO 120!")`. Con eso la IA ve las
  mismas palabras clave que el cliente vio en el anuncio real, y puede reconocer que "tapa cdi y
  cilindro 120" calca el anuncio de un combo puntual en vez de partir la diferencia entre dos.
  Validado con 3 conversaciones nuevas y limpias antes de dar por bueno: el caso que fallaba ahora
  identifica directo "Tapa cdi" (bienvenida + pregunta de moto, sin repreguntar), y dos casos que
  ya andaban bien ("Quiero el kit 120 para mi moto", "Info del escape con leva 6.40") siguieron
  clasificando igual de bien — sin sobrecorrección hacia Tapa cdi por compartir "120".
- **Bug real, caso frecuente: la rama de GRUPO escalaba con nota rota si el cliente contestaba
  algo que no era una moto mientras el pin esperaba el modelo (2026-08-22).** Con el grupo "Tapa
  cdi" pineado en estado `esperando_moto`, Martín preguntó "Cuánto la tapa sola?" (una pregunta de
  precio, no un modelo de moto) y el bot mandó una nota privada de escalado rota: *"El cliente está
  preguntando si el Tapa cdi es compatible con su **."* — con la moto vacía adentro de los
  asteriscos, porque `Extraer Modelo Grupo` (correctamente) devolvió `modelo_moto: ""` y el flujo
  igual siguió de largo hacia la búsqueda de compatibilidad y el escalado, en vez de frenar y
  repreguntar. Causa: la rama de GRUPO (`Parsear Modelo Grupo` → `Buscar Compatibilidad del
  Grupo`) nunca tuvo el chequeo de "modelo vacío" que sí existe hace rato en la rama de kit
  SIMPLE (`¿Compatibilidad Sin Marca/Modelo?`, conectado solo desde `Parsear Pregunta
  Compatibilidad`) — mismo patrón que el bug de escalado de grupo del 21/8 (funcionalidad que
  existía para kits simples y nunca se replicó para grupos). **Fix aplicado** (nodos nuevos en la
  API real de n8n, agregados desconectados y verificados con BFS antes de cablearlos, sin tocar
  ni reusar los nodos de la rama simple para no arrastrar una referencia `$('NodoX').item` a un
  nodo que no es ancestro ahí — ver gotcha de paired-item en [[n8n_chatwoot_bot]]): nodo IF nuevo
  `¿Grupo Sin Modelo?` entre `Parsear Modelo Grupo` y `Buscar Compatibilidad del Grupo` — si
  `modelo_moto` viene vacío, en vez de seguir hacia la búsqueda/escalado, manda una repregunta
  directa ("Que marca y modelo es tu moto? Así te confirmo si el [nombre del grupo] te sirve.")
  vía 3 nodos nuevos (`Preparar Repregunta Modelo (Grupo)` → `Enviar Repregunta Modelo (Grupo)` →
  `Fin - Repregunta Modelo Grupo Enviada`); si `modelo_moto` sí vino, sigue exactamente igual que
  antes hacia `Buscar Compatibilidad del Grupo`. El pin queda igual en `esperando_moto`, así que
  el próximo mensaje reintenta la extracción sin que haga falta ningún estado nuevo. 221→225
  nodos. Validado con 2 conversaciones nuevas antes de dar por bueno: el caso real (pregunta de
  precio mientras espera moto) ahora repregunta en vez de escalar roto, y el flujo normal
  (bienvenida → moto real → compatible → corto/largo) siguió andando igual, sin regresión. Se
  borró además la fila de escalado rota que había quedado en `preguntas_tecnicas_pendientes`
  (id 158, `modelo_moto` vacío) — era basura de la reproducción, no una pregunta real para
  contestar.
- **Mejora sobre el mismo caso: la rama de GRUPO ahora también contesta preguntas de artículo
  suelto mientras espera la moto, en vez de ignorarlas (2026-08-22).** Motivación de Martín: el
  catálogo nuevo se armó justamente en grupos con packs formados por artículos reales
  (`chat_articulos`) para poder responder preguntas sobre una pieza suelta de un kit por el que
  arrancó la charla, no solo sobre el combo entero — y ese dato ya estaba cargado (para el caso de
  arriba, artículo id 16 "Tapa cdi 125", alias `tapa sola, tapa nomas, cdi sola, tapa cdi sola`,
  $129.999) pero el flujo de grupo nunca lo consultaba. El mecanismo para esto **ya existía y
  funcionaba** para kits simples (`Buscar Detalle Kit Pineado (Sub-pregunta)` →
  `Responder Otro desde Detalle Kit`, un agente que matchea la pregunta contra los artículos
  sueltos reales del kit pineado, con precio siempre revalidado contra la base — nunca confía en
  un precio que redacte la IA); el gap era que la rama de grupo, al ser un camino sin salida hacia
  el separador de sub-preguntas (ver hallazgo de arriba), nunca llegaba a ese mecanismo. **Fix
  aplicado** (nodos nuevos y aislados, mismo criterio que el punto anterior — no se reusaron los
  nodos de la rama simple, referencian ancestros propios de la rama de grupo): se intercaló, en el
  mismo punto donde antes solo se mandaba la repregunta de moto (`modelo_moto` vacío), un chequeo
  nuevo — `Buscar Detalle Grupo Pineado` (trae los artículos de TODOS los packs del grupo pineado,
  deduplicados por `grupo_id` en vez de por un pack puntual, porque a esta altura todavía no se
  resolvió la variante corto/largo) → `Responder Articulo Suelto (Grupo)` (mismo prompt que la
  rama simple, agente + modelo de lenguaje dedicado) → `Parsear Articulo Suelto (Grupo)` (misma
  revalidación de precio real) → `¿Resuelto Articulo Suelto (Grupo)?`: si resolvió, manda la
  respuesta del artículo Y IGUAL sigue mandando la repregunta de moto de siempre (2 mensajes); si
  no resolvió, cae exactamente al mismo camino de antes (1 solo mensaje, la repregunta). 225→232
  nodos. Validado con 3 conversaciones nuevas: pregunta de artículo real (contesta precio + sigue
  preguntando moto), moto real sin pregunta de artículo (sin cambios, sin mensaje de más), y
  mensaje ambiguo sin moto ni artículo identificable (cae al fallback normal, sin falso positivo).
  **Alcance a propósito, no cubre todo:** esto solo se dispara cuando `modelo_moto` vino vacío. Si
  el cliente da la moto Y pregunta algo más en el mismo mensaje (ej. "tengo una wave, cuánto la
  tapa sola?"), la parte extra se sigue perdiendo — mismo gap, sin resolver todavía, para ese caso
  específico.
- **Continuación del mismo caso: stress test con mensajes reales de WhatsApp (sin signos de
  pregunta, mal escritos, ambiguos) encontró un bug real de precio — y arreglarlo llevó dos
  intentos fallidos antes de la solución que sí funciona (2026-08-22, sesión cortada a mitad,
  retomar mañana).** Martín preguntó explícitamente si el mecanismo de artículo suelto de arriba
  aguantaba lenguaje real (la gente que escribe no usa "?", se expresa mal). Se armó una batería de
  6 mensajes reales contra `Responder Articulo Suelto (Grupo)`:
  1. Mención sin pedido ("tengo la tapa así que con el cilindro nomás alcanza") → OK, no contestó.
  2. Pregunta real sin "?" ("cuanto sale la tapa nomas") → OK, contestó $129.999.
  3. **Ambiguo entre 2 artículos reales** ("cuanto el cilindro solo") → **MAL**: el grupo tiene
     2 cilindros distintos (id 7 corto $54.999, id 12 largo $74.999), y encima **ambos alias
     incluyen literalmente "cilindro solo"/"cilindro unicamente"** — la pregunta del cliente no
     tiene forma de distinguir cuál sin que el cliente aclare. El bot igual contestó $54.999 sin
     avisar que hay dos opciones — precio potencialmente equivocado si el cliente necesitaba el
     largo.
  4. Cambio de tema ("hacen envios a cordoba") → no lo confundió con ningún artículo (bien), pero
     tampoco contestó el envío (gap ya conocido de mensaje mixto, no nuevo).
  5. Muy informal/mal escrito ("q la tapa cuanto sale toda cascoteada no consigo plata") → OK,
     $129.999.
  6. Pregunta de stock, no precio explícito ("la tapa la venden suelta") → OK, contestó con el
     precio (respuesta razonable: confirma que se vende suelta Y da el precio).
  Osea, 5 de 6 bien y un bug de precio real (caso 3) — justo el tipo de "similitud de nombre"
  delicada que ya había pasado con la compatibilidad de motos (ver
  `fix-rm-modelo-ok-conflicto-cilindrada.sql` más arriba en este mismo documento).
  - **Intento 1 (prompt-only, fallido):** se agregó un párrafo al `systemMessage` de
    `Responder Articulo Suelto (Grupo)` pidiéndole explícitamente que tratara como ambiguo dos
    artículos de la misma categoría con distinta `variante` (campo nuevo agregado a la query
    `Buscar Detalle Grupo Pineado`: `p.criterio_variante AS variante`, igual patrón que
    `Extraer Modelo Grupo`). Arregló el caso 3 en la primera prueba, pero **rompió el caso 6**
    ("la tapa la venden suelta" dejó de contestar) — la tapa aparece 2 veces en la lista (una por
    cada pack del grupo, porque es una pieza compartida entre corto/largo) con la MISMA id pero
    DISTINTA `variante` en cada fila, y el párrafo nuevo no distinguía ese caso (pieza única
    repartida en 2 filas) del caso realmente ambiguo (dos ids distintos). Regresión real, detectada
    reproduciendo los 4 casos de nuevo antes de dar por bueno.
  - **Intento 2 (prompt corregido, fallido — inconsistente):** se reescribió el párrafo agregando
    "con ID DISTINTO" y una excepción explícita para el caso de la tapa repetida. Arregló el caso 6
    de vuelta, pero **el caso 3 volvió a fallar** — y no por casualidad: corriéndolo 5 veces
    seguidas contra el mismo prompt, dio **0 de 5 bien** (siempre contestó $54.999 sin avisar).
    Lección: para esta clase de regla ("ante ambigüedad real entre datos concretos, no elijas al
    azar"), redactarla mejor en prosa para el LLM no fue confiable — el modelo no la siguió de
    forma consistente ni siquiera dentro de la misma versión del prompt.
  - **Fix que sí funcionó: mover la decisión de código, no de prompt.** Se simplificó el
    `systemMessage` (que la IA elija el artículo que le parezca más probable igual, sin pedirle que
    se autorregule la ambigüedad) y se agregó una verificación determinística en
    `Parsear Articulo Suelto (Grupo)` (Code, sin IA de por medio): si el artículo que la IA eligió
    tiene otro artículo con **id distinto** en la misma `categoria` (un rival real), solo se acepta
    la respuesta si el mensaje del cliente contiene alguna palabra de `alias`/`nombre`/`variante`
    del artículo elegido que **no** esté también en las de su rival (ej. "largo"/"52.4"/"larga"
    distinguen al cilindro largo del corto; "solo"/"cilindro"/"unicamente" no distinguen nada,
    están en los dos). Si no encuentra ninguna palabra distintiva, fuerza `resuelto: false` sin
    importar lo que haya dicho la IA. El caso de la tapa repartida en 2 filas con la misma id ya
    ni siquiera entra en esta rama (el filtro es por id distinto, no por categoría sola), así que
    dejó de hacer falta la excepción frágil en prosa. Validado: los 4 casos (3, 6, y las dos
    regresiones) pasaron en la primera corrida, y **2 de 5 repeticiones del caso 3 confirmadas
    limpias antes de cortar la sesión** (las otras 3 quedaron corriendo en background, sin
    supervisar el resultado final — la lógica es determinística/no depende de sampling de IA para
    la parte crítica, así que no se esperan sorpresas, pero falta la confirmación final).
  - **PENDIENTE PARA MAÑANA:** 1) confirmar el resultado de las 5 repeticiones que quedaron
    corriendo en background al cortar la sesión (deberían ser 5/5 bien, revisar igual). 2) Las
    conversaciones de prueba usadas en toda esta investigación (ids 2412 en adelante, hasta
    ~2445) fueron todas descartables — ya quedaron `resolved`, no son la conversación de prueba
    principal (que sigue siendo `2411`, sin tocar durante todo este stress test). 3) Si aparece
    otro caso de "dos artículos con alias que se pisan" en otro grupo, mismo mecanismo debería
    cubrirlo solo (no hace falta cablear nada nuevo, es genérico por categoría/id). 4) Sigue
    pendiente el gap de mensaje mixto (moto + pregunta en el mismo mensaje) mencionado en el punto
    anterior — no se tocó en esta sesión.
- **Otro punto de transición del GRUPO que perdía una pregunta de negocio: moto ya confirmada
  compatible, ANTES de preguntar corto/largo (2026-08-24).** Caso real: conv 2653
  (+5493878319487), Kit 120 para 110. El cliente contestó "Keller 110" y, 5 segundos después,
  "Soy de oran salta" (misma ráfaga). El bot confirmó bien la compatibilidad y preguntó corto/largo,
  pero el dato de ubicación se perdió por completo — ni lo contestó ni escaló, a diferencia del
  resto del workflow. Mismo síntoma de fondo que la cobertura de negocio agregada hoy mismo para
  "grupo esperando moto" (ver más arriba), pero en el punto de transición siguiente: acá la moto YA
  se dio y ya se confirmó compatible, y lo que se pierde es lo que venga pegado a ESE mensaje, antes
  de mandar la pregunta de variante. Causa confirmada leyendo la ejecución real: `¿Variante
  Anticipada Resuelta?` (agregado el 22/08 para detectar si el cliente adelanta corto/largo en el
  mismo mensaje) en su rama `false` (no adelantó variante, el caso normal) iba directo a `Guardar
  Estado Esperando Variante` → `Enviar Pregunta Variante`, un callejón sin salida — cualquier otra
  cosa en el mismo mensaje (como la ubicación) nunca se evaluaba.
  Fix: 10 nodos nuevos, aislados (mismo criterio de siempre — no se reusan los nodos de la rama
  `(Variante)` ya existente, que resuelve el caso simétrico posterior, cliente respondiendo la
  variante), conectados en paralelo a `Guardar Estado Esperando Variante` desde la rama `false` de
  `¿Variante Anticipada Resuelta?`: `Extraer Tema Negocio (Esperando Variante)` (agente, mismo
  prompt base que las otras instancias de "tema de negocio", con un agregado a propósito: contar
  como tema "ubicacion" tanto una pregunta directa como el cliente mencionando su propia ciudad sin
  preguntar nada — el caso real de Orán no es una pregunta, es un dato suelto) → `Parsear Tema
  Negocio (Esperando Variante)` → `¿Es Negocio? (Esperando Variante)`: si no hay nada, no pasa
  nada más (la pregunta de variante ya sale por la rama de siempre, sin duplicar); si hay tema,
  `Buscar Info Negocio (Esperando Variante)` (mismo `rm_score` contra `info_negocio` de siempre) →
  `¿Hay Info Negocio? (Esperando Variante)`: con dato, lo contesta (`Preparar/Enviar Respuesta
  Negocio (Esperando Variante)`); sin dato, escala en silencio (`Registrar/Preparar Nota Escalado
  Negocio (Esperando Variante)`, reusa el `Enviar Nota Escalado` compartido) — igual que el resto
  del workflow, nunca se pierde nada. 343→353 nodos.
  Validado en la conversación de prueba (2411), reproduciendo el caso real paso a paso (plantilla
  del Kit 120 → "Keller 110" + "Soy de oran salta" en la misma ráfaga): el bot mandó los 2 mensajes
  esperados, la pregunta de compatibilidad/variante de siempre Y el dato de ubicación con envío
  (`info_negocio`, mismo texto que ya se completó el 22/08 con la aclaración de envío nacional —
  ver más arriba). Regresión chequeada aparte con una moto sola, sin nada pegado: siguió mandando
  un solo mensaje, sin cambios de comportamiento.
  **`rutas-bot-chatwoot.html` sigue sin actualizar** (arrastra la deuda ya anotada más arriba desde
  el 23/08) — pendiente la misma pasada grande de actualización del diagrama, no solo por este
  cambio.
- **Agujero de fondo detrás de los 2 fixes anteriores: preguntas reales que no son ni pieza del kit
  ni tema de negocio se perdían sin escalar, en los dos puntos de transición del GRUPO
  (2026-08-24/25).** Caso real: conv 2238 (+5493734465539), Kit 120 para 110. El cliente preguntó
  "Quiero saber los mm del cilindro, interior y exterior" mientras el grupo esperaba la moto — ni
  es una pieza con alias cargado, ni es un tema de negocio, así que los dos chequeos existentes
  (artículo suelto del 22/08, negocio del 24/8) le daban `false` a los dos y el mensaje caía
  directo a la repregunta de moto, **sin escalar** (a diferencia del resto del bot, donde lo no
  resuelto siempre queda pendiente para el equipo). El cliente insistió después ("Trip recorrido
  corto es... pero quiero saber las 2... recorrido largo y corto") y volvió a perderse igual, esta
  vez en el punto "moto ya compatible, antes de preguntar variante" (el fix de la entrada anterior).
  Causa de fondo: esos dos chequeos (`¿Es Negocio? (Grupo)` y `¿Es Negocio? (Esperando Variante)`)
  eran estrictamente booleanos — si no matcheaba pieza ni negocio, no había ningún tercer camino,
  a diferencia del partidor de sub-preguntas del kit ya resuelto (Fase 6), que siempre escala
  cualquier "otro" sin resolver.
  Fix: en vez de una tercera rama paralela más, se extendió el clasificador que ya existía en
  ambos puntos (`Extraer Tema Negocio (Grupo)` y `Extraer Tema Negocio (Esperando Variante)`) para
  que devuelva 3 categorías en vez de 2 (`{"clasificacion": "negocio"|"otro"|"nada", "tema": ...}`
  en vez de `{"es_negocio": bool, "tema": ...}`) — mismo prompt base, un párrafo nuevo que define
  "otro" como cualquier pedido real (medida técnica, dato no cargado, condición especial) que no
  sea sobre la moto/variante ni de negocio. `Parsear Tema Negocio (X)` sigue devolviendo
  `es_negocio` igual que antes (sin romper `¿Es Negocio? (X)`) y suma `es_otro`. Un IF nuevo en
  cada punto (`¿Es Otro Sin Resolver? (Grupo)` / `(Esperando Variante)`), colgado de la rama
  `false` de `¿Es Negocio? (X)`, enruta a los mismos nodos de escalado que ya existían para
  "negocio sin dato" (`Registrar/Preparar Nota Escalado Negocio (X)`, reusados tal cual — ya
  mandaban la nota privada Y seguían con la repregunta de moto/nada más, según la rama) — se les
  sacó "sobre el negocio" del texto de la nota porque ahora cubre los dos casos. 353→355 nodos.
  Validado en la conversación de prueba (2411), 4 casos: (1) "mm del cilindro" mientras espera
  moto → escaló con nota privada Y siguió preguntando la moto, como el resto del bot; (2) moto
  compatible + "quiero saber los mm para las 2 variantes" → escaló Y siguió preguntando
  corto/largo; (3) regresión, moto sola sin nada pegado → siguió mandando un solo mensaje, sin
  escalar de más; (4) regresión, moto + "soy de Orán, Salta" (el fix de la entrada anterior) →
  siguió clasificando bien como "negocio" y contestando el dato de envío, el prompt nuevo no rompió
  el camino viejo.
- **Precio de las dos variantes de una pieza a la vez, cuando el cliente lo pide explícito
  (2026-08-25).** A pedido de Martín, mismo hilo que las dos entradas anteriores: si el cliente
  pregunta el precio de una pieza con variantes corto/largo (ej. el cilindro) y pide las DOS a la
  vez ("cuánto sale el corto y el largo"), antes el mecanismo de artículo suelto solo podía elegir
  UNA — devolvía un precio real y correcto, pero incompleto, sin avisar que hay otra opción. A
  diferencia de los dos fixes anteriores, este no tenía ningún caso real todavía (Martín preguntó
  "¿esto también necesita un cambio grande?" antes de que pasara) — se armó preventivo, alcance
  acotado a propósito **solo para precio**, tal como pidió, para no arrastrar otros tipos de
  pregunta a este mecanismo.
  Fix, sin nodos nuevos, solo en `Responder Articulo Suelto (Grupo)` (prompt) y `Parsear Articulo
  Suelto (Grupo)` (Code): el JSON que devuelve la IA pasó de `articulo_id` (un solo número o null)
  a `articulo_ids` (arreglo, puede traer más de uno) — nueva regla explícita en el prompt: SOLO
  cuando el cliente pide el precio de más de una variante de la MISMA pieza a la vez, devolver
  todos los ids reales que pida; para cualquier otro caso (una sola pieza, ambigüedad real sin
  aclarar, pregunta que no es de precio), sigue exactamente igual que antes. En el Code: con 1 solo
  id sobrevive **la misma verificación de ambigüedad de siempre, sin tocar ni una línea de esa
  lógica** (red de seguridad contra que la IA "resuelva" una pieza ambigua sin que el cliente haya
  aclarado cuál) — con 2+ ids (el cliente ya aclaró que quiere ambas, no hay ambigüedad que
  resolver) arma un renglón de precio por cada una y las junta en un solo mensaje.
  Validado en la conversación de prueba (2411), 3 casos: "cuánto sale el cilindro, el corto y el
  largo" → un solo mensaje con las 2 líneas de precio reales ($54.999 y $74.999); "cuánto sale el
  cilindro corto solo" (una sola variante, clara) → un solo precio, sin cambios respecto de antes;
  "cuánto sale el cilindro solo" (ambiguo, sin aclarar cuál) → sin respuesta de precio, igual que
  antes del cambio — comportamiento sin tocar, no es una regresión nueva de hoy.
  **Gap encontrado de paso, sin resolver, pre-existente (no lo generó este cambio):** ese último
  caso ambiguo tampoco escala con nota privada pese al fix de "otro sin resolver" de la entrada
  anterior — `Extraer Tema Negocio (Grupo)` clasifica ese mensaje como "nada" (con razón, desde su
  perspectiva: la pregunta SÍ es sobre una pieza real del kit, no es un tema ajeno) sin saber que
  el chequeo de artículo suelto ya lo intentó y no pudo por ambigüedad. Confirmado en la ejecución
  real (`clasificacion: "nada"` pese a que `Responder Articulo Suelto` había devuelto
  `resuelto:false` por ambigüedad un paso antes). Mismo comportamiento que tenía el bot antes de
  cualquiera de los 3 fixes de hoy — no es nuevo, pero queda anotado como el próximo gap real si
  aparece un caso así en tráfico real.
- **Bug grave: un cliente que cambia de anuncio a mitad de charla terminaba atendido para el kit
  VIEJO, no el nuevo que pidió (2026-08-25).** Caso real: conv 2660 (+5491135791522). Pidió info de
  Tapa CDI (quedó pineado "esperando moto"), 14 minutos después clickeó el anuncio del Kit 120 para
  110 (un producto distinto) y en la misma ráfaga agregó "Quiero ese de 99". El clasificador sin IA
  reconoció bien la plantilla exacta nueva (`tipo:"grupo", deteccion:"plantilla_exacta",
  grupo_id:1`) — pero como venía texto pegado, pasaba por `Validar Continuidad de Tema (Grupo)`
  (IA, del fix de [[n8n_fix_resto_rafaga_grupo]] del 22/8) para decidir si el resto era del mismo
  tema. Dio "tema distinto" (dudoso), y esa rama estaba diseñada para el caso "sin pin todavía" —
  mandaba a `Leer Kit Pineado` sin pasar por `Enviar Saludo Grupo`, así que **nunca pineaba el kit
  nuevo** y el pin viejo de Tapa CDI seguía vigente. El cliente terminó confirmando compatibilidad
  y precio de Tapa CDI pensando que hablaba del Kit 120 — mala información real, no solo un
  mensaje perdido.
  Causa de fondo: la plantilla exacta es un dato determinístico (texto idéntico al anuncio, no una
  interpretación de IA) — un match nuevo tiene que ganarle siempre a cualquier pin anterior, sea
  cual sea el resto pegado. Eso ya pasa así cuando NO hay resto (rama `false` de `¿Hay Resto en la
  Rafaga? (Grupo)`, va directo a `Enviar Saludo Grupo` sin chequear nada). El chequeo de "mismo
  tema" nunca debió tener poder de decidir SI pinear, solo cómo tratar el resto después.
  Fix, sin nodos nuevos ni borrados: se recableó `¿Hay Resto en la Rafaga? (Grupo)` para que sus
  dos salidas (con resto y sin resto) vayan directo a `Enviar Saludo Grupo` — la plantilla exacta
  siempre pinea y saluda el kit nuevo, punto. `Validar Continuidad de Tema (Grupo)` / `GPT Model -
  Continuidad de Tema (Grupo)` / `Parsear Continuidad de Tema (Grupo)` / `¿Es Mismo Tema? (Grupo)`
  quedaron huérfanos en el canvas (sin conexión, no borrados) — ya no aportan nada desde que existe
  el fix de "otro sin resolver" de más arriba, que cubre en serio cualquier resto ajeno al kit
  recién pineado (antes de hoy esa red de seguridad no existía, por eso en su momento tenía sentido
  el diseño conservador de "ante la duda, no pinees nada"). Se verificó antes de recablear que
  `Enviar Saludo Grupo` y `Marcar Grupo Pineado (Esperando Moto)` ya leen todo lo que necesitan
  directo de `$('Clasificar Mensaje (sin IA)')` (nunca de `$json` ni del output de la rama de
  continuidad), así que saltearla no rompe nada río abajo.
  Validado en la conversación de prueba (2411), reproduciendo el caso real paso a paso (Tapa CDI
  pineado → plantilla del Kit 120 + "Quiero ese de 99" como 2 mensajes separados, 8s de diferencia,
  misma ráfaga): el bot saludó y pineó el Kit 120 correcto (no Tapa CDI), y encima contestó el
  resto con el detalle real del kit nuevo — antes del fix esto quedaba pegado a Tapa CDI y escalaba
  con nota privada.
- **Segundo hallazgo de la misma conversación real: el bot no entendía cuando el cliente contestaba
  corto/largo usando UNA PISTA que el mismo bot le había dado (color, dientes de la corona), en vez
  del nombre literal de la variante (2026-08-25).** En la conv 2660, tras confirmarle compatibilidad,
  el bot preguntó corto/largo dando 2 pistas alternativas ("28 dientes = corto, 32 = largo... color
  del cilindro, generalmente negro = corto"). El cliente contestó "Es negro el cilindro" — dato
  real, pensado explícitamente por el propio bot como forma válida de contestar — pero `Resolver
  Variante` no lo reconoció (solo compara contra el nombre literal de la variante,
  `criterio_variante`) y volvió a preguntar lo mismo.
  Fix: sin nodos ni queries nuevas. El texto de pistas (`chat_pack_grupos.pregunta_variante` —
  mismo campo que ya arma la pregunta original en `Enviar Pregunta Variante`, ya disponible en la
  misma estructura `Buscar Kits Activos().grupos` que `Resolver Variante` ya consulta) se agregó al
  prompt de `Resolver Variante` como contexto, con la instrucción de tratar una respuesta basada en
  esa pista como afirmación real, no como pregunta. Genérico a propósito — no hardcodea "negro =
  corto", usa el mismo texto de pistas que ya está cargado por grupo (algunos grupos usan medida de
  leva en vez de corona/color, ver la tabla de `pregunta_variante` más arriba).
  Validado en la conversación de prueba (2411): "Es negro el cilindro" (sin decir "corto") resolvió
  directo al pack corto y mandó la bienvenida final con precio y foto, sin repreguntar. Regresión
  chequeada aparte: una duda real ("no tengo idea cuál es, cómo me fijo?") siguió repreguntando
  igual que antes, sin inventar una respuesta.
- **Bug real de producción, no de interpretación: la repregunta de "candidatos" (cuando
  `Identificar Necesidad` no está seguro entre 2+ kits y el cliente no mencionó su moto) fallaba
  con error 400 y no mandaba nada (2026-08-25).** Encontrado a pedido de Martín en conv 2661
  (+5491139305243, "Lele") — clickeó un Reel de Facebook sobre el kit 200 varillero y escribió
  "Buenas ezta disponible"; `Identificar Necesidad` clasificó bien `tipo:"candidatos"` con un
  `mensaje` armado ("¿Te referís al Kit 170 varillero + leva o al kit dakar 200 económico?"), pero
  el bot no contestó nada — conversación muerta. Revisando las ejecuciones con error del workflow
  (`/executions?status=error`) apareció un SEGUNDO cliente real con el mismo error desde el día
  anterior: conv 2575 (+5493521477426, "Cristian"), "Kit de 110" (24/8 12:38), todavía sin
  respuesta al momento de este fix.
  Causa (gotcha ya documentado de este workflow, ver sección de gotchas): `Enviar Repregunta
  Candidatos (Propuesta)` usaba el atajo `content: $json.mensaje` (sin nombre de nodo). En algún
  momento (probablemente el fix de "compatibilidad a nivel de combo" del 23/8) se insertaron 3
  nodos en el medio de esa cadena (`Extraer Modelo (Candidatos)` → `Parsear Modelo (Candidatos)` →
  `¿Hay Modelo Mencionado (Candidatos)?`, para saltar la repregunta si el cliente ya dio la moto) —
  desde entonces `$json` dejó de apuntar a `Parsear Identificar Necesidad` (que sí tiene el campo
  `mensaje`) y pasó a apuntar a `Parsear Modelo (Candidatos)` (que NO lo tiene), así que el body
  del POST a `/api/chatwoot/enviar` viajaba con `content: undefined` y la API respondía 400 "Falta
  content". Rompía siempre que el cliente NO mencionara su moto en el mismo mensaje (el caso más
  común) — nunca se había notado porque no genera ninguna nota ni pendiente, solo un error en el
  log de ejecuciones de n8n que nadie estaba mirando.
  Fix de una línea: `content: $json.mensaje` → `content: $('Parsear Identificar Necesidad').item.json.mensaje`
  (mismo patrón de referencia explícita que ya usa el resto del workflow desde que se documentó
  este gotcha). Sin nodos nuevos.
  **Validación con una limitación honesta:** confirmé la causa exacta contra los datos reales de
  las 2 ejecuciones fallidas (no es una hipótesis) y el campo `mensaje` está garantizado en la
  salida de `Parsear Identificar Necesidad` para `tipo:"candidatos"` — pero **no logré re-disparar
  en vivo el mismo camino exacto en la conversación de prueba** (probé 4 veces, con y sin el mismo
  referral real de Lele, incluso en una conversación nueva sin historial) — `Identificar Necesidad`
  es un clasificador de IA y en la conversación de prueba resolvió otra cosa cada vez
  (`kit_confiado` dos veces, `sin_match` una vez) en lugar de `candidatos`. Confianza alta en el fix
  igual, por tratarse de una referencia de datos corregida (no una regla de negocio nueva) y por
  ser exactamente el mismo patrón ya probado en el resto del workflow — pero queda pendiente
  confirmar con un caso real que sí caiga en `candidatos` la próxima vez que pase.
  **Pendiente de decisión de Martín:** los 2 clientes reales afectados (Lele y Cristian) nunca
  recibieron nada — no quedó ningún pendiente registrado en ningún lado (esta rama no escala,
  solo repregunta) — así que si no se les contesta a mano, quedan perdidos sin que el equipo se
  entere por ningún canal.
- **Falso positivo real: "de qué parte(s) son" (mal escrito, preguntando UBICACIÓN) se interpretaba
  como pregunta por las PIEZAS del kit (2026-08-25).** Caso real: conv 2663 (+5493755415438,
  "Vilmar"), grupo Tapa CDI esperando moto. Escribió "De q parteson" (typo de "de qué parte son",
  el mismo tipo de apertura ya documentado en [[n8n_ubicacion_incluye_envio]], "¡Hola! De dónde
  son"). `Responder Articulo Suelto (Grupo)` la tomó al pie de la letra ("de qué partes son" =
  pregunta por los componentes) y contestó el detalle del kit ("Incluye tapa completa con
  válvulas..."), en vez de pasar a la ubicación — el chequeo de artículo suelto corre ANTES que el
  de negocio, así que "ganó" con una lectura literal equivocada antes de que el chequeo correcto
  llegara a evaluarla.
  Fix: una frase agregada al prompt de `Responder Articulo Suelto (Grupo)`, mismo lugar donde ya
  excluye explícitamente las preguntas de compatibilidad de moto -- "de qué parte(s) son"/"de
  dónde son" (mal escrita o no) NUNCA es sobre una pieza del kit aunque contenga la palabra
  "parte", es sobre la UBICACIÓN del negocio: `resuelto:false`, deja que caiga al chequeo de
  negocio de siempre. Sin nodos nuevos, mismo criterio ya usado varias veces hoy para excepciones
  de interpretación (ej. el fix de "envio" por mencionar solo la ciudad, más arriba).
  Validado en la conversación de prueba (2411): "De q parteson" (caso real exacto) contestó la
  ubicación con el dato de envío, y siguió preguntando la moto. Regresión chequeada con una
  pregunta real de piezas ("Que partes trae el kit") -- siguió contestando el detalle del kit
  como siempre, sin cambios.
- **6 fixes reales de un mismo día en la rama de GRUPO, partiendo de una sola conversación real
  (2026-08-25).** Arrancó revisando conv 2683 (+5493875476951, Matias): "Una gilera" + "La tapa
  viene completa?" en la misma ráfaga generó una pendiente técnica de compatibilidad en vez de
  contestar la pregunta de completitud del kit, que sí se podía responder sola. Causa: el fork
  `¿Grupo Sin Modelo?` es binario y mutuamente excluyente -- en cuanto `Extraer Modelo Grupo` saca
  el modelo, todo el turno se va por la rama "con modelo" y nunca pasa por
  `Responder Articulo Suelto (Grupo)` (que vive solo del lado "sin modelo").
  **Fix 1:** se agregó `resto_mensaje` a `Extraer Modelo Grupo`/`Parsear Modelo Grupo` (mismo
  patrón que ya usaba `Parsear Pregunta Compatibilidad` en la rama simple) y 4 nodos clonados
  `... (Con Modelo)` (`Buscar Detalle Grupo Pineado` → `Responder Articulo Suelto` →
  `Parsear Articulo Suelto` → IF de resuelto) colgando en paralelo de `¿Grupo Sin Modelo?`. Clones,
  no reconexión del original, porque su rama "no resuelto" repregunta la moto -- reusarla tal cual
  acá le repreguntaría algo que ya se sabe.
  **Fix 2, bug propio encontrado en el 1 durante la prueba en producción real:** el nodo de envío
  seguía reusando el compartido `Enviar Respuesta Articulo Suelto (Grupo)`, que continúa a la
  repregunta de moto sin guarda para "ya se sabe la moto" -- se le dio a la rama "Con Modelo" su
  propio nodo de envío terminal, y el chequeo pasó de paralelo a secuencial (necesario para que
  la guarda del fix 3 pueda leer el resultado del mismo turno sin condición de carrera). De paso
  apareció y se corrigió una referencia implícita rota en `Buscar Compatibilidad del Grupo` (dejó
  de recibir `grupo_id`/`modelo_moto_sql` al reordenar el flujo).
  **Fix 3:** guarda `¿Ya Resuelto Como Articulo Suelto (Con Modelo)?` en la rama "Esperando
  Variante", para no escalar una pendiente de negocio duplicada cuando la pregunta ya se contestó
  como artículo suelto en el mismo turno.
  **Fix 4:** la rama gemela de re-entrada (`Extraer Tema Negocio (Variante)`, cuando el cliente
  contesta la variante en un turno NUEVO y separado, no el mismo del pin) tenía el mismo agujero
  de fondo -- acá no hace falta guarda porque todos sus caminos convergen en repreguntar
  corto/largo de todas formas (la variante genuinamente sigue sin resolver), así que el chequeo de
  artículo suelto corre en paralelo sin insertarse en medio de nada.
  **Fix 5 (gap de diseño, no bug):** conv 2691 (+5492804861651, Richi) pidió "piston 54mm perno 13
  ...para tapa cdi" como primer mensaje, sin kit pineado -- ningún nodo busca en el catálogo
  completo sin un kit ya identificado. Se agregó un 3er nivel de prioridad en la cadena de
  sub-preguntas (`Buscar en Catálogo Completo de Articulos` → `Responder Articulo Suelto
  (Catálogo General)` → parser), después de "kit pineado" y "conocimiento aprendido", exigiendo
  alta confianza por la ambigüedad de tener 14+ artículos en vez de 2-3 de un kit puntual. De paso
  se confirmó que `kit_articulos` (tabla vieja, pre-migración del 19-20/08, datos huérfanos y
  peores que `chat_articulos`) no la usaba ningún nodo -- se dio de baja (tabla + la sección
  "Artículos" de la pestaña Kits en `/admin/chatwoot/conocimiento`, que sí la usaba).
  **Fix 6:** conv 2687 (+5491130795935, "el celoso") mostró dos bugs más. (a) `Extraer Tema
  Negocio (Grupo)` solo devolvía UN tema de negocio -- "cómo pago y cuánto tarda el envío" en el
  mismo mensaje perdía uno de los dos sin dejar rastro; pasó a devolver `temas: string[]` y la
  query de Postgres solo contesta si TODOS los temas pedidos tienen dato (si falta uno, escala
  completo como antes -- no se intentó "contesto lo que sé + escalo el resto" para no arriesgar el
  mismo bug de mensaje duplicado del fix 2). Mismo problema confirmado, sin tocar, en las ramas
  gemelas `(Sub-pregunta)`/`(Variante)`/`(Esperando Variante)`. (b) Regresión real del fix 1 de
  hoy: "Como se si es carrera corta o larga" + "Es un smash cilindro fundición" en la misma
  ráfaga hizo que `Responder Articulo Suelto (Grupo - Con Modelo)` tomara una mención entre
  paréntesis del `detalle` del kit ("la leva (corta) incluye...") como si fuera la respuesta a
  "cuál es la mía", contestando "La leva es corta." un segundo después de que el propio sistema
  escalara diciendo que no tenía el dato. Se agregó al prompt compartido (idéntico en
  `Responder Articulo Suelto (Grupo)`/`(Con Modelo)`/`(Variante)`) que "cómo determino cuál es MI
  variante" es la misma categoría excluida que "es compatible con mi moto", y una advertencia
  explícita contra tomar una mención parentética del detalle como respuesta.
  Los 6 fixes se aplicaron y validaron uno por uno contra la API real de n8n y la conversación de
  prueba (2411), con backup del workflow completo antes de cada cambio.
- **Fix 7: saludo repetido al retomar conversación vieja con compatibilidad ya confirmada
  (2026-08-25).** Conv 2269 (+5493584395611, Diego Funes): pin de hace 5 días expirado, el cliente
  vuelve y contesta la moto ("Para un Keller") en el mismo mensaje. `Identificar Necesidad` →
  `Extraer Modelo (Kit Confiado)` → `Procesar Compatibilidad Kit Confiado` hacen todo bien y
  confirman `modo:"compatible"`, pero `¿Es Compatible (Kit Confiado)?` en realidad solo distingue
  "incompatible" de "todo lo demás" (mezclaba `compatible` y `sin_dato`) y mandaba el saludo
  genérico de cero, tirando el trabajo ya hecho -- un humano tuvo que apagar el bot a mano.
  Fix: IF nuevo `¿Es Compatible o Sin Dato (Kit Confiado)?` que separa los dos casos. Para
  `compatible`, 7 nodos clonados del tramo "resolver variante anticipada" que ya usa la rama de
  pin activo (clonado, no reusado, porque el original referencia por nombre a nodos que no corren
  en esta rama -- mismo patrón de los fixes de hoy): si la variante ya se puede resolver, cierra
  con precio; si no, pregunta corto/largo. Para `sin_dato`, 5 nodos que reproducen el mismo
  patrón de escalado que ya usa el resto del bot (pendiente en `preguntas_tecnicas_pendientes` +
  nota privada, con dedup, reusando el nodo compartido `Enviar Nota Escalado` sin clonarlo). Los
  dos casos pinean el kit en Redis (345600 TTL) para que la conversación quede enganchada al flujo
  normal de ahí en más, en vez de perderse.
  Bug propio encontrado y corregido en el camino: los 2 nodos Postgres nuevos de dedup no tenían
  `alwaysOutputData:true` como el nodo original -- con 0 filas (caso normal, sin pendiente previa)
  Postgres no emite ningún item y n8n corta la cadena en silencio, sin error. Detectado en la
  primera prueba real (la nota de escalado no salía), parcheado.
  Validado con trace real en la conversación de prueba (2411), los dos casos: `compatible`
  ("Es una zanella zb 110", con compatibilidad de prueba insertada a propósito) contestó
  "Genial, es compatible / Tu moto es recorrido corto o largo?" en vez del saludo genérico;
  `sin_dato` ("Es una Kymco Xciting", moto sin ningún dato cargado, confirmado limpio antes de
  usarla) escaló con nota privada real y pendiente registrada, en vez del saludo genérico.
- **3 fixes reales de la misma conversación: contradicción "Recorrido corto" + repregunta de
  modelo repetida + pendiente huérfana (2026-08-25).** Caso real: conv 2703 (+5493329335105,
  Tomy), Kit 120. Preguntó "Que recorrido llevará una guerrero trío 2006" (moto sin dato cargado) y
  el bot le contestó "Recorrido corto." como un hecho **mientras, en paralelo, escalaba en
  silencio la misma pregunta al equipo por no tener el dato** (contradicción real, no cosmética).
  Después, un "Muchísimas gracias" de cierre (llegó justo al corte de mediodía, quedó en
  `respuestas_pendientes`) reabrió 2h25m más tarde repitiendo "Que marca y modelo es tu moto?" —
  ignorando que Tomy ya la había dado. Cuando por fin confirmó la moto de nuevo, el bot resolvió
  compatible y volvió a preguntar corto/largo sin cerrar la pendiente técnica que había quedado
  abierta de la primera vez. Un humano terminó apagando el bot a mano.
  1. **Prompt (`Responder Articulo Suelto (Grupo)` / `(Con Modelo)` / `(Variante)`, las 3
     idénticas):** la exclusión de "cuál es mi variante" (ya existía para frases tipo "cómo sé si
     la mía es corta o larga") no cubría la frase real de Tomy, que pide directamente que le digan
     cuál le corresponde. Se sumó ese ejemplo explícito + una regla nueva: si la compatibilidad
     todavía no está confirmada, nunca afirmar una variante como si ya estuviera resuelta.
  2. **Categoría nueva "cierre" en el grupo esperando moto** (antes solo existía "negocio"/"otro"/
     "nada" acá — la del partidor de sub-preguntas del kit ya resuelto es una rama distinta, no
     compartida). `Extraer Tema Negocio (Grupo)` y `Parsear Tema Negocio (Grupo)` ahora reconocen
     un comentario de cierre/agradecimiento sin pedido real (mismos ejemplos que la categoría
     "cierre" original, incluyendo variantes de pago futuro tipo "apenas tenga la plata les
     mando"). A pedido explícito de Martín, acá **no se contesta nada** (a diferencia del texto
     fijo "Dale, cualquier cosa nos escribís." que usa la rama del kit ya resuelto) — nodo IF nuevo
     `¿Es Cierre? (Grupo)` + `Fin - Cierre Sin Respuesta (Grupo)` (NoOp), insertados entre `¿Es
     Otro Sin Resolver? (Grupo)` y `Preparar Repregunta Modelo (Grupo)`.
  3. **Cierre de pendiente huérfana:** nodo Postgres nuevo `Cerrar Pendiente Tecnica (Grupo)`
     (`UPDATE preguntas_tecnicas_pendientes SET estado='respondida' WHERE conversation_id=... AND
     kit_id=grupo_id AND es_grupo=true AND estado='pendiente'`), colgado en paralelo de
     `Resolver Variante Anticipada` desde la salida true de `¿Es Compatible (Grupo)?` — si la
     compatibilidad se termina confirmando por otro camino (el cliente vuelve a escribir la moto),
     cualquier pendiente técnica vieja de la misma conversación/grupo se cierra sola en vez de
     quedar huérfana en el panel.
  384→387 nodos. Validado en la conversación de prueba (2411) replicando la secuencia real paso a
  paso: (1) "Que recorrido llevará una Voskhod Minsk 350" (sin dato) con el grupo ya pineado →
  `Responder Articulo Suelto (Grupo - Con Modelo)` devolvió `resuelto:false` (antes: `"Recorrido
  corto."` inventado) y escaló limpio, deduplicado contra una pendiente ya abierta; (2)
  "Buenisimo, muchas gracias" → clasificó `"cierre"` y no mandó nada (antes: repregunta de
  modelo repetida); (3) "Es una Zanella ZB 110" (dato real cargado) → confirmó compatible, preguntó
  corto/largo, y `Cerrar Pendiente Tecnica (Grupo)` marcó `respondida` la pendiente que había
  quedado de la prueba (1) — confirmado contra la base, sin tocarla a mano.
- **Fix real: el bot seguía pidiendo la moto aunque el cliente ya hubiera contestado el recorrido
  (2026-08-25).** Caso real: conv 2720 (+5493435311660, emi🥷), Tapa CDI. Contestó "Recorrido corto"
  directo, sin dar la moto -- el bot respondió "El cilindro que incluye este combo es la versión
  corta." y volvió a preguntar "Que marca y modelo es tu moto?" de nuevo, ignorando que ya tenía el
  único dato que hacía falta. Causa: el mecanismo que anticipa el recorrido cuando el cliente lo dice
  antes de tiempo (`Resolver Variante Anticipada`) solo corre DESPUÉS de confirmar que la moto es
  compatible -- no existía nada equivalente para cuando el cliente da el recorrido SOLO, sin moto.
  Decisión de Martín: para Kit 120 y Tapa CDI la moto solo sirve para inferir el recorrido, no hay
  incompatibilidad física real -- si el cliente ya dio el recorrido, alcanza. Escape+Leva (sí tiene
  compatibilidad física real documentada) queda afuera. Fix: columna nueva
  `chat_pack_grupos.compatibilidad_universal` (`chat-catalogo-compatibilidad-universal.sql`, default
  `false`, prendida solo para Kit 120 e id 3 Tapa CDI) + 5 nodos nuevos aislados, insertados entre
  `¿Grupo Sin Modelo?` (rama true) y `Buscar Detalle Grupo Pineado`: `¿Grupo Compatibilidad
  Universal?` (If, chequea el flag del grupo) → si el grupo lo tiene, `Resolver Variante Sin Moto`
  (Agent, mismo prompt que `Resolver Variante` -- mismo criterio ya probado de afirmación real vs.
  pregunta/duda -- adaptado para correr sin que la compatibilidad esté confirmada) + su modelo
  (`GPT Model - Variante Sin Moto`) → `Parsear Variante Sin Moto` → `¿Variante Sin Moto Resuelta?`:
  si resolvió, reconecta directo al `Marcar Pack Final Pineado` ya existente (mismo punto de
  convergencia que usan `Resolver Variante`/`Resolver Variante Anticipada`); si no resolvió, o el
  grupo no tiene el flag, cae exactamente al camino de siempre (`Buscar Detalle Grupo Pineado`,
  sigue pidiendo la moto). `Buscar Kits Activos` ahora expone `compatibilidad_universal` por grupo.
  387→392 nodos. Validado en producción con la conversación de prueba (2411, +5493513784909)
  replicando los 2 escenarios: plantilla Tapa CDI + "Recorrido corto" solo → resolvió directo
  ("Genial, entonces le va perfecto el combo de Tapa CDI + Cilindro 120 recorrido corto — $175.000,
  envío gratis a todo el país...") sin preguntar la moto; plantilla Escape+Leva (sin el flag) +
  "Recorrido corto" solo → siguió pidiendo la moto exactamente igual que antes del fix, sin cambios.
- **Regresión real del "Fix 7" (conv 2269) de más arriba: kits SIMPLES sin variantes (Kit 170,
  Kit Dakar 200) se quedaban sin ninguna respuesta al confirmar compatibilidad — 2026-08-26,
  encontrada revisando la conv real de un cliente afectado (Ramiro, +5493816568345, conv 2734).**
  Escribió por Kit 170 varillero + leva ("Hola amigo te vi... kit de 170 para un barillero" + "Yo
  tengo un skua" en la misma ráfaga), el bot confirmó bien que la Skua es compatible, y ahí la
  ejecución murió con error HTTP 400 "Falta content" — cero respuesta, sin nota, sin quedar
  registrado en ningún pendiente (mismo síntoma que el bug de `candidatos`/Lele-Cristian del 25/8).
  Causa: el tramo de 7 nodos del Fix 7 (resolver variante anticipada / preguntar corto-largo) se
  agregó pensando solo en combos con variantes (grupo) — nunca chequeaba `es_grupo` antes de
  entrar. Para un kit simple, busca una "variante" que no existe (`grupos` no tiene esa id, está en
  `packs`), la pregunta de variante sale con texto vacío, y Chatwoot rechaza el mensaje vacío. Antes
  de romperse alcanzó a pinear en Redis un pin roto ("esperando variante" de un grupo inexistente) —
  cualquier mensaje nuevo de Ramiro iba a repetir el mismo error hasta limpiarlo a mano.
  **Fix aplicado** (nodo IF nuevo `¿Es Grupo (Kit Confiado)?` insertado entre `¿Es Compatible o Sin
  Dato (Kit Confiado)?` y `Resolver Variante Anticipada (Kit Confiado)`): si `es_grupo`, sigue
  exactamente el camino de siempre (sin tocar nada del Fix 7); si no, nodo nuevo
  `Preparar Pack Simple Pineado (Kit Confiado)` arma `pack_id`/`pack_nombre`/`mensaje_bienvenida`/
  `foto_url` directo desde `Buscar Kits Activos().packs` (sin pasar por la resolución de variante,
  que no aplica) y converge en el `Marcar Pack Final Pineado (Kit Confiado)` que ya existía. A
  pedido de Martín, para el mensaje se reusa la bienvenida original del kit (la misma que manda la
  plantilla exacta) en vez de redactar un texto de confirmación nuevo — vuelve a preguntar la moto
  aunque el cliente ya la haya dado, pero es dato correcto y no rompe nada; queda como mejora
  cosmética futura si molesta en la práctica. 393→395 nodos.
  **Validación con la misma limitación honesta que el fix de `candidatos` del 25/8:** confirmé la
  causa exacta contra la ejecución real que falló (no es hipótesis) y probé en vivo, contra una
  conversación de prueba nueva y limpia, que el mecanismo reusado (`Marcar Pack Final Pineado` /
  `Enviar Bienvenida Pack Final`) funciona bien para un pack simple sin romperse — pero no logré
  reproducir en vivo el camino EXACTO de Ramiro (mensaje+moto juntos en la misma ráfaga →
  `Identificar Necesidad` → `kit_confiado` → compatible) por un problema de latencia del entorno de
  pruebas esa noche (la API de ejecuciones de n8n y hasta la entrega de mensajes de Chatwoot
  quedaron con varios minutos de lag para los webhooks disparados a mano, mientras el tráfico real
  seguía procesando normal — no se llegó a entender la causa de ese lag puntual). Confianza alta en
  el fix igual: es un cambio quirúrgico (agrega una rama, no toca la lógica ya validada del Fix 7
  para grupos) que reusa nodos que ya funcionan en producción. Pin roto de Ramiro y datos sintéticos
  de la prueba, limpiados. **Pendiente:** Ramiro se quedó sin ninguna respuesta desde las 21:31 del
  25/8 — hay que contestarle a mano.
- **Tema "mayorista" — solo en la rama Grupo esperando moto (2026-08-26):** caso real (conv 2754,
  +5492984583210, grupo Tapa CDI) — un lubricentro preguntó por venta al por mayor mientras el bot
  esperaba que dijera su moto; escaló bien en silencio, pero SIGUIÓ preguntando "¿qué marca y modelo
  es tu moto?" (comportamiento a propósito del 24/08, para no perder nada) — sin sentido para
  alguien que no va a instalar nada, confundió al equipo (llegó a escribirse `/bot off` por error,
  pensando que era otra conversación). Fix: se sumó "mayorista" a la lista cerrada de temas de
  `Extraer Tema Negocio (Grupo)` / `Parsear Tema Negocio (Grupo)` (agregar `es_mayorista` al output)
  + un gate nuevo `¿Fue Mayorista?` insertado justo donde ya convergían "negocio contestado" y
  "negocio escalado" antes de seguir hacia `Preparar Repregunta Modelo (Grupo)`: si el tema fue
  mayorista, en vez de preguntar la moto, borra el pin del grupo (`Borrar Pin Grupo (Mayorista)`,
  mismo patrón `DEL kit_pineado:{telefono}` que ya usa `Borrar Pin Grupo (No Compatible)`) y termina
  ahí (`Fin - Mayorista (Sin Repregunta)`). Si todavía no hay respuesta cargada para "mayorista" en
  Conocimiento, escala en silencio igual que cualquier otro tema sin dato — decisión explícita de
  Martín, no hace falta nada especial ahí. `lib/temas-negocio.ts` también suma la opción (label
  "Venta por mayor / reventa") para poder cargar la respuesta real desde
  `/admin/chatwoot/conocimiento`. 395→398 nodos. Validado en la conversación de prueba (2411)
  reproduciendo el caso real paso a paso: bienvenida del grupo Tapa CDI → mensaje de mayorista →
  escaló en silencio, nota privada, **sin** repregunta de moto; se confirmó contra la ejecución real
  de n8n que `Preparar Repregunta Modelo (Grupo)` no corrió y que `Borrar Pin Grupo (Mayorista)`
  corrió sin error.
  **Pendiente:**
  1. Cargar la respuesta real de "mayorista" en `/admin/chatwoot/conocimiento` — por ahora escala
     siempre, no hay dato cargado.
  2. Quedan 2 ramas más con el patrón "negocio mientras hay algo pineado, sigue preguntando
     después" sin tocar (kit con variante pineado, grupo esperando variante corto/largo) — ver
     entrada de abajo sobre por qué NO son 4 ramas como se pensó al principio.
  3. `rutas-bot-chatwoot.html` sigue sin actualizar (arrastra desactualización de varias rondas
     anteriores, ver entradas previas).
- **Tema "mayorista" — sumado también a la rama compartida "sin nada pineado" / "kit ya resuelto"
  (2026-08-26, mismo día):** al rastrear el cableado real para planear esta extensión se corrigió
  algo mal asumido en la entrada de arriba: no son 4 ramas separadas del patrón negocio. Hay 3
  clasificadores de tema realmente aislados (`Extraer Tema Negocio (Grupo)` ya con mayorista,
  `(Variante)`, `(Esperando Variante)`, estas 2 últimas sin tocar) más un **único** nodo compartido
  (`Extraer Tema Negocio (Sub-pregunta)` / `Parsear Tema Negocio`, corazón del partidor de
  sub-preguntas de la Fase 6) al que convergen DOS situaciones distintas: sin ningún kit pineado
  (`Identificar Necesidad` no pudo asociar nada) y kit pineado pero ya resuelto (no "esperando
  moto"/"esperando variante"). Ninguna de las dos deja una repregunta pendiente después de resolver
  negocio — a diferencia de la rama Grupo, acá no hace falta gate ni borrado de pin, solo sumar
  "mayorista" a la lista cerrada del prompt (`Extraer Tema Negocio (Sub-pregunta)`) y del parser
  (`Parsear Tema Negocio`). Validado en la conversación de prueba (2411, estado limpio, sin nada
  pineado) con un mensaje de mayorista suelto ("¿Tienen ventas por mayor?..."): escaló en silencio
  con nota privada, confirmado contra la ejecución real de n8n que clasificó `tema: "mayorista"`
  correctamente y nunca generó ninguna pregunta de más. Mismo pendiente que arriba: cargar la
  respuesta real en Conocimiento.
- **Dos bugs reales encontrados en conv 2760 (+5493813326002), 2026-08-26 — uno arreglado, uno
  documentado sin tocar todavía:**
  1. **(Sin arreglar, a propósito) Mensajes de anuncio con texto genérico ("¡Hola! Quiero más
     información") caen como saludo puro y pierden el kit.** Ese mensaje trae junto metadata real
     de Meta Ads en `body.referral` (`headline`/`body` con el nombre y descripción exactos del
     kit publicitado — confirmado en la ejecución real, el campo llega y queda expuesto en
     `Unir Mensajes` pero ningún nodo lo usa). El clasificador (`Clasificar Mensaje (sin IA)`)
     tiene "informacion"/"info"/"mas"/"quiero" en su lista de stopwords para separar saludo de
     pedido real — así que a este mensaje, después de sacarle el saludo, no le queda ningún token
     de contenido y cae `tipo: "saludo"` sin pasar por `Identificar Necesidad`. Esto es
     **decisión de diseño original, no un bug nuevo** — "¡Hola! Quiero más información" está
     citado a propósito como ejemplo de saludo puro en [[project-chatwoot-2-0-rediseno]]
     (2026-08-12). Lo nuevo es la evidencia real de que ese mensaje llega con `referral` capaz de
     identificar el kit sin ambigüedad. Discutido con Martín el 26/8, decidió arreglar primero el
     bug 2 (abajo) y dejar este para después — no usar `referral` todavía sin su OK explícito.
  2. **(Arreglado) Una sub-pregunta con dato YA encontrado se perdía en silencio si llegaba junto
     a otra sin resolver en la misma ráfaga.** Caso real: "Quería saber el combo q publicaron" +
     "De donde son" en un mismo mensaje agrupado — el partidor de sub-preguntas (Fase 6) separó
     bien las dos partes y `Buscar Info Negocio (Negocio)` encontró la dirección real para la
     segunda, pero nunca llegó a mandarse ni a quedar registrada en ningún pendiente: dos bugs de
     ítems que desaparecen de un lote, uno atrás del otro, ambos silenciosos (ejecución completa
     sin error).
     - Causa 1: `Buscar Cierre Reciente (Sub-pregunta)` (Redis `get`, corría una vez por
       sub-pregunta) devolvía 1 ítem de un lote de 2 — ver el gotcha nuevo de Redis más arriba.
       Fix: sacar esa consulta del loop, correrla una sola vez por ráfaga
       (`Buscar Cierre Reciente (Rafaga)`, insertado en serie entre `Extraer Ultimo Mensaje
       Nuestro` y `Preparar Contexto Sub-preguntas`) y propagar el resultado a cada sub-pregunta
       vía `Parsear Sub-preguntas` (mismo patrón que `kit_id`/`kit_nombre`). `Consolidar Dato
       Resuelto` ahora lee `$('Separar Pedazos').item.json.cierre_reciente_raw` en vez de
       consultar Redis de nuevo.
     - Causa 2, encontrada recién al validar el fix de la causa 1 (antes quedaba tapada porque el
       ítem ya venía perdido desde antes): `Parsear Articulo Suelto (Catálogo General)` (Code)
       tenía el código escrito para `runOnceForEachItem` (`return { json: {...} }` suelto, sin
       array) pero le faltaba el parámetro `"mode": "runOnceForEachItem"` — mismo gotcha ya
       documentado arriba, instancia nueva. Fix: agregar el `mode` que faltaba.
     - Validado en vivo contra la conversación de prueba (2411, +5493513784909, estado limpio):
       mensaje sintético con la misma forma real (`[auditoria-bug2] Quería preguntar por un
       repuesto raro que no tienen en la publicidad` + `De donde son ustedes`) — antes del fix la
       parte de ubicación se perdía igual que en el caso real (confirmado contra la ejecución,
       0 → 1 ítem en `Parsear Articulo Suelto`); después del fix las dos partes sobrevivieron
       completas: la dirección se mandó sola al cliente y la otra quedó escalada en silencio,
       sin mezclarse. Datos sintéticos de la prueba (fila de `preguntas_sin_match_pendientes`,
       pin de Redis) limpiados al terminar.
  **Pendiente:** el cliente real de conv 2760 se quedó sin respuesta de ubicación (nunca se le
  mandó ni quedó registrada en ningún lado — el bug 2 corría en producción en ese momento) y con
  la pregunta del combo todavía escalada sin contestar — hay que responderle a mano. El bug 1 de
  arriba queda pendiente de decisión, no de implementación.
- **Bug 1 de arriba, arreglado el mismo día (2026-08-26, charlado y decidido con Martín):**
  identificar el kit por la metadata real de Meta Ads (`referral.headline`/`referral.body`) cuando
  el botón del anuncio manda un texto genérico en vez de la plantilla fija. Decisión tomada con
  Martín: matchear por **texto del anuncio** (no por `source_id`, que evita ambigüedad pero tiene
  arranque en frío — el primer cliente de una campaña nueva no lo tendría cargado) y **sin IA**,
  mismo patrón determinístico que la plantilla exacta (consistente con la decisión del 12/8 de
  sacar toda ambigüedad de este paso, ver [[project-chatwoot-2-0-rediseno]]).
  - **Campo nuevo:** `plantillas_referral` (text, una entrada por línea — headline o body, se
    matchea contra cualquiera de los dos) en `chat_packs` y `chat_pack_grupos`
    (`chat-catalogo-plantillas-referral.sql`), mismo patrón que `plantillas_bienvenida`. Editable
    desde `/admin/chatwoot/catalogo` (pestañas Packs y Grupos) — nuevo campo "Textos de anuncio de
    Meta Ads", visible donde ya vivía el campo de plantilla exacta (packs sin grupo / grupos).
  - **Workflow:** `Buscar Kits Activos` ahora trae `plantillas_referral` de packs y grupos.
    `Clasificar Mensaje (sin IA)` suma un paso nuevo (entre la plantilla exacta y la detección de
    saludo): si `Unir Mensajes` trajo `referral` (ya se extraía desde el 22/8, sin usar hasta
    ahora — ver su propio comentario en el código), compara `headline`/`body` normalizados contra
    las líneas de `plantillas_referral` de cada pack/grupo; matchea con `deteccion: 'referral'`
    (mismo shape de salida que `'plantilla_exacta'`, así que reusa sin tocar nada el ruteo por
    `tipo` y la continuidad de tema de la Fase 10 — el ruteo nunca mira `deteccion`, confirmado
    grepeando el resto del workflow). 400→400 nodos (no se agregó ningún nodo, todo el cambio es
    en un query y un Code ya existentes).
  - **Datos reales cargados de una** (las 3 campañas activas encontradas revisando ejecuciones del
    mismo día, todas venían pegando contra el saludo genérico sin que nadie lo notara):
    "KIT DE POTENCIACION PARA 110" → grupo 1 (Kit 120 para 110); "GANA MAS RENDIMIENTO EN TU 110!"
    → grupo 3 (Tapa cdi); "PEDI EL TUYO!!" / "POTENCIA TU VARILLERO A 170CC!" → pack 11 (Kit 170
    varillero + leva).
  - **Validado en vivo** contra la conversación de prueba (2411, limpia) reproduciendo el mensaje
    real exacto de conv 2760 (`"¡Hola! Quiero más información"` + el `referral` real capturado de
    esa conversación, inyectado a mano en `content_attributes.referral` del payload — el mock de
    `/api/chatwoot/prueba-mensaje` no arma ese campo, hubo que construir el POST directo al webhook
    de n8n): confirmado contra la ejecución real que clasificó `tipo: "grupo", deteccion:
    "referral", grupo_id: 1` y mandó la bienvenida completa del combo (precio, detalle, pregunta de
    la moto) en vez del saludo genérico.
  - **Pendiente:** cargar `plantillas_referral` para el resto de los packs/grupos activos a medida
    que se detecten sus campañas reales (por ahora solo las 3 de arriba). Sin mecanismo para
    detectar automáticamente una campaña nueva sin registrar — sigue cayendo a saludo genérico
    hasta que alguien la cargue a mano (mismo arranque en frío que ya se aceptó al descartar
    `source_id`).
- **Referral mandaba el saludo del kit a ciegas cuando el cliente pedía algo puntual y distinto en
  el mismo primer mensaje (2026-08-26, mismo día que el fix de arriba).** Caso real: conv 2779
  (+5493515913795), clickeó el anuncio "POTENCIA TU VARILLERO A 170CC!" (Kit 170) pero escribió
  "Hola tendrás piston alta comprecion para Honda titan" — el bot mandó igual la bienvenida
  completa del Kit 170, el cliente contestó "✅️" sin elegir nada, y el equipo tuvo que aclarar a
  mano que no se vende ese pistón puntual.
  Causa: a diferencia de la plantilla exacta (que por definición consume TODO el primer mensaje,
  texto literal conocido — nada del cliente queda "suelto"), el referral matchea por metadata del
  anuncio sin mirar el texto, así que el primer mensaje puede traer un pedido real y específico sin
  que nada lo capture como "resto" (quedaba `resto_mensaje: ""` aunque el mensaje tuviera contenido
  propio).
  Fix, sin nodos nuevos: en `Clasificar Mensaje (sin IA)`, cuando matchea por referral y el mensaje
  tiene contenido propio (no es puro saludo/relleno, mismo chequeo de tokens que ya usa la rama de
  saludo), se manda el mensaje completo como `resto_mensaje` en vez de dejarlo vacío — así entra al
  mismo camino de `Validar Continuidad de Tema` (Fase 10) que ya usa la plantilla exacta: si sigue
  siendo del mismo kit, saluda igual que siempre; si es tema distinto, no manda el saludo y escala
  en silencio. El caso de mensaje genérico ("Hola quiero info", sin contenido propio) sigue exacto
  igual que antes — decisión ya tomada arriba de no tocarlo todavía. También se ajustó el prompt de
  `Validar Continuidad de Tema` (antes decía "coincide EXACTO con la plantilla", que ya no es cierto
  para el caso referral) para que sea agnóstico a cómo se identificó el kit.
  **Validado en vivo** contra la conversación de prueba (2411): (1) reproduciendo el caso real
  exacto (mismo `referral` de Kit 170 + la pregunta del pistón) — `mismo_tema: false`, no mandó el
  saludo del kit, `Identificar Necesidad` no inventó ningún kit (`tipo: "ninguno"`), y quedó
  escalado en silencio con nota privada, sin mandar nada al cliente; (2) caso límite pedido por
  Martín antes de aprobar el fix — plantilla exacta + "cuanto el kit mas una leva" (el Kit 170 ya
  incluye una leva) — `mismo_tema: true`, mandó el saludo normal sin duplicar el precio (ya
  suprimido por la regla existente de "la bienvenida recién mandada ya lo cubre").
- **Referral repetía la bienvenida completa a mitad de una charla ya arrancada, ignorando que el
  kit ya estaba pineado (2026-08-26, mismo día que los dos fixes de referral de arriba).** Caso real:
  conv 2495 (+5492954686592), cliente ya venía charlando del Kit 170 (pineado desde el primer
  mensaje) y mandó un audio preguntando horarios + confirmando el contenido del kit — el bot volvió
  a mandar la bienvenida completa con foto ($99.990, "a que moto se lo queres poner?"), y lo mismo
  pasó un rato después con un simple "Okey"/"Estamos en contacto". Martín terminó frenando el bot a
  mano (`/bot off`) por la repetición.
  Causa, confirmada contra la ejecución real (payload crudo que Chatwoot reenvía a n8n): Meta sigue
  pegando el `content_attributes.referral` del anuncio original en mensajes **posteriores** de la
  misma conversación, no solo en el que la abrió — el audio y el "Okey" de esta charla, mandados
  días después del primer clic, traían el mismo `referral` del Kit 170. `Clasificar Mensaje (sin IA)`
  nunca chequeaba si ya había un kit pineado para ese teléfono antes de intentar el match por
  referral, así que cualquier mensaje con ese campo pegado disparaba `tipo: "kit", deteccion:
  "referral"` de nuevo y, si `Validar Continuidad de Tema` decía `mismo_tema: true` (razonable, el
  audio SÍ era del mismo kit), re-mandaba el saludo completo — no es un caso raro ni un fluke de
  Meta, es comportamiento esperado que se va a repetir mientras la conversación siga viva.
  Fix, sin nodos de IA nuevos: se agregó `Leer Kit Pineado (Pre-Referral)` (Redis `get`, mismo
  patrón de key que `Leer Kit Pineado`, insertado en serie entre `Buscar Kits Activos` y
  `Clasificar Mensaje (sin IA)`) y el paso 2 del clasificador (referral) ahora solo corre si
  **todavía no hay nada pineado** para ese teléfono — si ya hay un kit pineado, el mensaje cae en
  `sin_match` sin importar que traiga referral, y sigue el camino normal de "kit ya pineado" (el
  mismo que ya resolvía bien horario/medios de pago/detalle en este caso real). No se tocó el
  chequeo de plantilla exacta (paso 1) — ese es texto literal que el cliente tendría que volver a
  escribir a propósito, no algo que Meta repite solo.
  **Validado en vivo** contra la conversación de prueba (2411, +5493513784909, pin limpio):
  mensaje 1 con el `referral` real de Kit 170 (`POTENCIA TU VARILLERO A 170CC!`) → pineó el kit y
  mandó la bienvenida, como siempre; mensaje 2, mismo `referral`, con una pregunta de seguimiento
  tipo la real ("hasta que dia trabajan... el piston, el cilindro y la leva, todo no es cierto?") →
  confirmado contra la ejecución real que `Leer Kit Pineado (Pre-Referral)` encontró el kit ya
  pineado, `Clasificar Mensaje (sin IA)` devolvió `tipo: "sin_match"` (sin pasar por `Enviar Saludo
  Kit`), y el mensaje se resolvió por el camino normal de sub-preguntas (contestó el detalle del kit,
  escaló en silencio la parte de horario) — cero reenvío de la bienvenida. Pin de prueba limpiado al
  terminar.
- **Aviso de "posible venta" + pausa permanente cuando el cliente muestra intención de compra
  (2026-08-26/27).** A pedido de Martín: con un kit ya pineado (bienvenida/precio ya mandados), si el
  cliente escribe algo tipo "lo quiero", "como lo pago", "me interesa" (lista fija de ~25 frases, sin
  IA — coincidencia de texto normalizado sin acentos/mayúsculas), el bot deja de responder esa
  conversación **para siempre** (mismo mecanismo `bot_pausado:{conv}` de siempre, pero sin TTL — antes
  solo se seteaba con 30 días), le pone la etiqueta "posible venta" en Chatwoot y deja una nota privada
  avisando qué frase disparó la pausa. Solo se levanta con `/bot on` manual — no hizo falta tocar ese
  comando, ya borra la clave sin importar si tenía TTL o no.
  Nodos nuevos, sin tocar nada existente, insertados entre `Parsear Kit Pineado` y `¿Es Grupo en
  Resolución?` (corre igual para kit final y para grupo en resolución de variante): `Detectar Interes
  de Compra` (Code) → `¿Detecto Interes de Compra?` (If) → si true: `Armar Nota Interes Compra` →
  (2026-08-28: entre medio ahora hay un gate de IA acotada, ver entrada del 28/8 más abajo)
  `Enviar Nota Interes Compra` → `Obtener Etiquetas Actuales` → `Armar Etiquetas Posible Venta` (Code,
  suma "posible venta" sin pisar etiquetas existentes) → `Agregar Etiqueta Posible Venta` → `Marcar Bot
  Pausado (Posible Venta)` (Redis `set` sin `expire`) → `Fin - Posible Venta Pausado`. 404→413 nodos.
  **Gotcha de Chatwoot encontrado:** el endpoint de etiquetas de conversación (`POST .../labels`)
  acepta cualquier texto como etiqueta nueva sin que exista antes en Ajustes > Etiquetas — pero así
  queda sin color y no aparece en la barra lateral, a diferencia de "intervencion"/"ventas" que sí
  están registradas ahí. El token de la API no tiene permiso para crear etiquetas de cuenta (401 en
  `POST /accounts/{id}/labels`) — **pendiente que Martín cree la etiqueta "posible venta" a mano en
  Chatwoot** (Ajustes > Etiquetas, mismo texto exacto) para que tenga color y aparezca en la barra
  lateral igual que las otras dos.
  **Riesgo conocido, aceptado a propósito:** "me interesa" es una frase amplia (ej. "me interesa saber
  si tienen envío" también matchea) — como el costo de un falso positivo es una pausa silenciosa
  reversible con `/bot on` (no una respuesta mala al cliente), se dejó así en vez de complicar la
  detección.
  **Validado en vivo** contra la conversación de prueba (2411, +5493513784909, pin limpio): kit pineado
  por plantilla exacta ("kit dakar 200 economico") → "Dale, lo quiero! como lo pago?" corrió el camino
  nuevo completo (confirmado nodo por nodo en la ejecución real), dejó la nota privada, la etiqueta
  "posible venta" quedó puesta (confirmado contra la API real de Chatwoot), y un tercer mensaje
  ("hola siguen ahi?") confirmó que el bot quedó en silencio (mismo camino de `¿Bot Pausado?` que ya
  usa `/bot off`). Pin y etiqueta de prueba limpiados al terminar.

- **Aclaraciones de motor en ráfaga se trataban como consultas de repuesto suelto (2026-08-27).** Caso real:
  conv 2829 (+5492645600215), cliente mandó "Tengo una okinoy 150" + "Varillera". `Extraer Pregunta Compatibilidad`
  separó "Varillera" a `resto_mensaje` en vez de incluirlo en `modelo_moto`, y `Responder Articulo Suelto (Catálogo General)`
  matcheó "Varillera" contra "Leva Varillera 7.8" ignorando los alias de la pieza y mandando precio de leva suelta.
  Fix: se ajustó el prompt de `Extraer Pregunta Compatibilidad` para que especificaciones/adjetivos de motor (varillero/cadenero/etc.)
  formen parte de `modelo_moto` y no de `resto_mensaje`, y se reforzó en `Responder Articulo Suelto` (Catálogo General, Grupo, y Detalle)
  la prohibición explícita de matchear repuestos sueltos a partir de adjetivos o tipos de motor sin pedido explícito de la pieza.

- **Referral de Meta Ads pineaba el GRUPO equivocado por un título de anuncio compartido, y sin chequeo de
  continuidad de tema (2026-08-27).** Caso real: conv 2818 (+5492227678179, Tobías). El cliente vino por el
  anuncio del Combo Escape PWR + Leva (`referral.body = "Combo Escape Paolucci PWR 110 + Leva de calle de 6.40..."`,
  `referral.headline = "GANA MAS RENDIMIENTO EN TU 110!"`) y el bot le mandó la bienvenida de **Tapa CDI** y lo
  pineó ahí — después "Escape" (aclaración del cliente) se leyó como modelo de moto y escaló una nota absurda
  ("¿el Tapa cdi es compatible con su Escape?"). **No fue una regresión** de los fixes de referral del 26/8 sino
  la composición de dos decisiones previas: (a) el 26/8 se eligió matchear el referral por **texto del anuncio**
  (no `source_id`) comparando `headline` **o** `body` contra `plantillas_referral`, y se cargó como clave de
  Tapa CDI el título `"GANA MAS RENDIMIENTO EN TU 110!"`, que Meta reusa TAL CUAL en el anuncio del Escape; (b) el
  25/8 se recableó `¿Hay Resto en la Rafaga? (Grupo)` para que SIEMPRE saludara/pineara (dejando huérfano
  `Validar Continuidad de Tema (Grupo)`), razonamiento válido para la plantilla exacta pero no para el referral,
  donde el primer mensaje es texto libre del cliente. El fix #2 del 26/8 (referral con contenido propio →
  `resto_mensaje` → continuidad) solo se cableó en la rama de kit suelto, nunca en la de grupo (se probó con
  Kit 170, un pack).
  **Fix (3 partes):**
  1. **`Clasificar Mensaje (sin IA)`: el referral matchea SOLO por `body`, nunca por `headline`.** Los títulos
     son slogans que Meta repite entre campañas; la descripción es específica. Confirmado en ejecuciones reales
     que Escape y Tapa CDI comparten el mismo `headline`.
  2. **Nodo nuevo `¿Identificado por Referral? (Grupo)`** (If `deteccion == 'referral'`) entre la salida "hay
     resto" de `¿Hay Resto en la Rafaga? (Grupo)` y `Enviar Saludo Grupo`: si el grupo se identificó por
     referral (no plantilla exacta) y el cliente escribió texto propio, pasa por `Validar Continuidad de Tema
     (Grupo)` → `¿Es Mismo Tema? (Grupo)` (los nodos huérfanos del 25/8, ahora reconectados) — si es tema
     distinto NO saluda ni pinea, cae a `Leer Kit Pineado` → `Identificar Necesidad`. La plantilla exacta sigue
     yendo directo a `Enviar Saludo Grupo` (rama falsa del nodo nuevo), sin tocar el fix del 25/8. 413→414 nodos.
  3. **Datos:** `plantillas_referral` de los 3 grupos + 2 packs activos recargado con solo la línea de
     descripción real (sacado el título de los que lo tenían); cargado el `body` del Combo Escape + Leva (grupo 2,
     antes `null`) y del Kit Dakar 200 (pack 12, antes `null` — venía cayendo a `sin_match`). Label/placeholder
     del campo en `/admin/chatwoot/catalogo` (Packs y Grupos) actualizado: "solo la descripción, no el título".
  **Validado:** (A) 14 casos deterministas del clasificador (body-only, sin colisión de título, guarda de kit
  ya pineado, fallbacks a saludo/sin_match). (B) 3 e2e reales contra la conv de prueba 2411:
  - referral Escape + "info sobre el escape de 110" → matchea **grupo 2 (Escape+Leva)**, correcto (el bug de
    Tapa CDI desapareció); la continuidad dio "tema distinto" (conservadora) pero `Identificar Necesidad` volvió
    a pinear grupo 2 y mandó su bienvenida — resultado final correcto, un hop de IA de más.
  - referral Tapa CDI + "tenés cubierta trasera para una gilera smash?" → continuidad "tema distinto" → NO manda
    bienvenida, NO pinea, escala en silencio (nota privada) — el caso negativo que motivó todo.
  - plantilla exacta Tapa CDI + "para una wave" (regresión fix 25/8) → rama falsa del nodo nuevo → `Enviar Saludo
    Grupo` directo, pinea y resuelve compatibilidad, sin pasar por continuidad — intacto.
  **Pendiente:** contestarle a mano a Tobías (conv 2818) — vino por el Combo Escape PWR + Leva 6.40. El pin viejo
  ya se limpió el 28/8 (ver la entrada de esa fecha sobre "grupo esperando la moto"). `rutas-bot-chatwoot.html`
  sigue desactualizado.

- **Mención de producto o publicación se clasificaba erróneamente como `cierre` (2026-08-27).** Caso real:
  conv 2809 (+5493704514103, Edgardo Short). El cliente escribió: "Hola.. vi una publicación de una leva de 110" + "Hacen envíos?".
  `Dividir y Etiquetar Sub-preguntas` etiquetó "Hacen envíos?" como `envio` y "vi una publicación de una leva de 110" como `cierre`
  porque la definición de cierre incluía "algo que ya pasó". `Armar Mensajes` mandó la info de envíos y pegó "Dale, cualquier cosa nos escribís.",
  cerrando la charla en falso sin escalar la leva de 110 ni responder nada sobre el producto.
  Fix integral aplicado:
  1. **Prompt de `Dividir y Etiquetar Sub-preguntas`:** Prohibición estricta de `cierre` cuando se menciona cualquier repuesto
     (leva, cilindro, tapa, carburador, escape, filtro, pistón, biela, cigüeñal, etc.), kit, combo, moto, cilindrada, o frases de contexto
     ("vi una publicación", "me contaron de", "un amigo me recomendó", "escuché que tienen", "busco"). Todo eso es interés comercial / producto y va como `otro`.
  2. **Código de `Armar Mensajes`:** Si en la misma ráfaga hay alguna respuesta informativa resuelta (`precio`, `stock`, `envio`, `negocio`, `otro`)
     o si hay piezas sin resolver (`haySinResolverReal`), cualquier mensaje de `cierre` se descarta automáticamente.
  3. **Escalado:** Al catalogarse como `otro`, la leva de 110 ambigua genera una nota privada en silencio para el equipo, sin despedidas prematuras.
  **Validado:** Caso del hallazgo, caso alternativo ("me contaron de..."), cotización de artículo suelto sin regresión, y cierre puro.
- **Repregunta de variante corto/largo en loop en vez de escalar + respuestas por pista que caían en `null` (2026-08-27).** Caso real: conv 2849 (+5492216199968, "juaniiii"), Tapa CDI. Tras darle las pistas, el cliente dijo "Entonces es recorrido largo" y el bot le volvió a mandar las mismas pistas (y lo habría hecho una 3ª vez antes de escalar). Con Martín: se mantiene la interpretación de duda del cliente tal cual, pero se corta el loop.
  1. **`¿Superó Intentos Variante?`**: umbral de `>= 3` a `>= 2`. Ahora: 1ª respuesta sin resolver → pistas una vez (útil, contesta el "¿cómo me doy cuenta?"); 2ª respuesta que sigue sin resolver → nota privada al equipo ("escribile directo, el bot no le va a insistir más") + `preguntas_sin_match_pendientes`, sin re-preguntar. El contador (`repregunta_variante_intentos:{tel}`, Redis) solo sube con respuestas poco claras — una respuesta que resuelve nunca lo toca.
  2. **Bug preexistente destapado en la regresión:** el fix del 25/08 (respuesta basada en pista = afirmación real) referenciaba `pregunta_variante`, pero desde el corte del 21/08 las pistas viven en `pregunta_variante_reintento` y `pregunta_variante` quedó como la pregunta pelada — así que `Resolver Variante` y `Resolver Variante Sin Moto` nunca veían las pistas y "el cilindro es negro" caía en `null` (y ahora, con umbral 2, escalaba de más). Los dos nodos ahora reciben también `pregunta_variante_reintento` en el prompt.
  3. **"Utilidad - Limpiar Pin de Prueba"** (workflow `Jg3VrFqnkOG4HYEK`): ahora borra también `repregunta_variante_intentos:{tel}` y `variante_escalada:{tel}` — sin esto, pruebas repetidas del flujo corto/largo arrastran un intento viejo y el escalado salta antes de tiempo.
  **Validado en conv 2411:** (a) duda tras las pistas ("y no sé, será el largo capaz?") → nota al equipo, sin re-preguntar; (b) respuesta por pista ("el cilindro es negro") → resuelve al pack corto con la bienvenida final y precio; (c) "no tengo idea" (1ª vez) → sigue mandando las pistas, sin escalar.
  **Suelto, no arreglado:** `Redactar Variante Repregunta Variante` a veces mete "¿" de apertura (ej. "¿Cuál tiene tu moto?") pese a que su prompt lo prohíbe — es uno de los prompts viejos pendientes de [[feedback-bot-preguntas-sin-apertura]], no se tocó acá.

- **Tras un "no tenemos nada para tu moto", el bot igual daba el precio del kit pineado (2026-08-27).** Caso real: conv 2277 (+5493482272506, David Sandoval). El equipo le dijo por nota privada que no tenemos nada para potenciar su Honda Wave NF; 30 min después preguntó "un aproximado" y el bot contestó "El precio es de $84.999" — el precio del Kit 170 que seguía pineado en Redis, para un producto que le acabábamos de decir que no tenemos para él. Dos agujeros encadenados: (1) cuando el equipo responde "no compatible" por nota privada y el kit es **simple** (no grupo), el workflow guardaba en compatibilidades y avisaba, pero **nunca marcaba `incompatible_reciente`** — solo la rama grupo lo hacía (drift grupo vs kit simple de siempre, [[project-chatwoot-grupo-vs-kit-simple-drift]]); idem la rama de "no compatible" resuelta directo de la base (`¿Es Realmente Compatible?` → `Fin - Incompatible`). (2) El partidor de sub-preguntas (Fase 6) nunca miraba `incompatible_reciente`: `Buscar Precio Kit Pineado` contesta el precio del kit pineado sin ningún chequeo.
  **Fix (3 partes, +4 nodos, 414→418):**
  1. **P1a** — nodo IF nuevo `¿Es Compatible? (Actualizar Pin Simple)` colgado de `Guardar en Compatibilidades` (rama respuesta-equipo, kit simple): si el equipo dijo NO, marca `incompatible_reciente` (reusa `Marcar Incompatibilidad Reciente (Respuesta Equipo)`, que ya existía para grupos). **No borra el pin** — a diferencia de la rama grupo — para no arriesgar un re-welcome; el flag + el gate de P2 alcanzan.
  2. **P1b** — `¿Es Realmente Compatible?` (rama "no") ahora también dispara `Marcar Incompatibilidad Reciente (Kit Simple)` (nodo redis nuevo, key con el patrón `messages[0].sender.phone_number`).
  3. **P2** — nodo redis nuevo `Leer Incompatibilidad Reciente (Rafaga)` en serie entre `Buscar Cierre Reciente (Rafaga)` y `Preparar Contexto Sub-preguntas` (mismo patrón "una vez por ráfaga" que `cierre_reciente`). `Preparar Contexto Sub-preguntas` y `Parsear Sub-preguntas` propagan el flag; si `incompatible_reciente.grupo_id === kit_id` del pin, `Parsear Sub-preguntas` **anula `kit_id`** → `precio`/`stock` caen a `otro` (regla `!kitIdEfectivo` ya existente) y `otro`/`detalle` no encuentran nada → todo escala en silencio. Envío general y negocio no usan `kit_id`, siguen igual.
  4. **P3** — `Chequear Insiste Pese a Incompatibilidad`: el nombre del kit para la nota ahora también se busca en `packs` (antes solo `grupos`). El match por id directo ya servía para packs.
  **Validado en vivo** (conv de prueba 2411, +5493513784909, bot respondiendo en vivo por estar el número en `bot_numeros_exceptuados`), 7 escenarios contra Chatwoot + ejecución real de n8n:
  - **Positivo directo:** Kit 170 pineado → "¿compatible con Fan 125?" (no, dato en base) → "¿precio aproximado?" → `Leer Incompatibilidad Reciente (Rafaga)` leyó `{grupo_id:11}`, `Parsear Sub-preguntas` bajó a `otro` con `kit_id:null`, escaló en `preguntas_sin_match_pendientes`, **cero precio**.
  - **Positivo P1a:** Kit 170 pineado → "¿anda en una Gilera Futura 110?" (sin dato → escala a equipo) → equipo responde por nota privada "no le entra" → `¿Es Compatible? (Actualizar Pin Simple)` ruteó `compatible:false` → `Marcar Incompatibilidad Reciente (Respuesta Equipo)` = `{success:true}` (la key con `contact_inbox.source_id` matchea la que lee el flujo entrante con `sender.phone_number`) → "¿precio aproximado?" → flag leído, `kit_id` anulado, **cero precio** (dedupeó con el pendiente ya abierto de la misma conv — anti-dup esperado de Fase 6).
  - **Negativo (no regresión):** Kit 170 pineado **sin** incompatibilidad → "¿cuánto sale? ¿envíos?" → "El precio es de 99990.00" + política de envíos, normal.
  - **Negativo:** "¿compatible con Skua 150?" (sí) → "Sí, es compatible" y **no** marcó flag → "¿precio?" → precio normal.
  - **Regresión rama grupo:** plantilla Tapa CDI + "para una Honda Wave NF" → "No, este producto no es compatible..." + `Borrar Pin Grupo (No Compatible)` corrió, intacto.
  **No cubierto por prueba en vivo:** P3 (necesita el camino `¿Es Kit Ya Resuelto?` → `Chequear Insiste`) — es un agregado de 1 línea al lookup de nombre, bajo riesgo. **Pendiente:** contestarle a mano a David (conv 2277) — quedó con el precio equivocado como último mensaje — y `rutas-bot-chatwoot.html` sigue desactualizado. Script del fix: `n8n-workflows/apply-fix-no-asumir-tras-incompatible.mjs`, backup `workflow_backup_pre-fix-no-asumir-tras-incompatible_2026-08-27.json`.

- **Dos fixes a partir de conv 2385 (+5493735466916): falso "posible venta" + bienvenida de kit equivocado tras `/bot on` (2026-08-28).** El cliente venía con Kit 170 pineado. (a) Escribió "De q parte me lo mandarían al cilindro **si lo compro**?" (pregunta condicional de envío) y `Detectar Interes de Compra` matcheó la frase "lo compro" de su lista → etiqueta "posible venta" + pausa permanente, falso positivo. (b) Martín hizo `/bot on`; el cliente preguntó "Y lo pago cuando llega?" y el bot le mandó la bienvenida completa del **Combo Escape PWR + Leva 6.40** (kit equivocado) y pisó el pin: con un kit simple pineado, un mensaje `sin_match` igual pasa por `Identificar Necesidad` (cuyo prompt asume "todavía no hay ningún kit identificado"), que ante un historial con mucha charla de "leva" clasificó `kit_confiado` apuntando a otro kit → `Preparar Pin desde Identificacion` dumpeó la bienvenida.
  **Fix 1 — gate de IA para intención de compra (+4 nodos):** la lista de ~25 frases ahora solo *dispara la sospecha*. `Detectar Interes de Compra` → `¿Sospecha de Compra?` (If `interes_compra == true`): rama true → `Validar Interes de Compra (IA)` (agent, `gpt-5.6-luna`, `LLM - Validar Interes Compra`) + `Parsear Validacion Interes` → `¿Detecto Interes de Compra?`; rama false → directo a `¿Detecto Interes de Compra?`. La IA lee el mensaje completo del cliente + la frase detectada y devuelve `{"intencion_real": true|false}` — descarta condicionales/hipotéticos ("si lo compro…", "cuando lo pague…", "cómo sería si…", "lo pago cuando llega?"). **Fallback conservador:** si la IA falla (parseo o error), `Parsear Validacion Interes` deja `interes_compra: true` → se pausa igual (un falso positivo se arregla con `/bot on`, una venta perdida no). La IA solo corre cuando ya hubo match de la lista (~5% de los mensajes con kit pineado), no en cada mensaje.
  **Fix 2 — respetar el kit pineado en `Identificar Necesidad` (+1 nodo):** nodo Code `Respetar Kit Pineado (Identificacion)` insertado entre `Parsear Identificar Necesidad` y `¿Qué Identificó?`. Si hay un pack **simple** pineado (`es_grupo === false && kit_id`) y la IA identificó un kit **distinto** (ni el mismo pack ni su grupo — misma lógica de detección que `Chequear Kit Ya Resuelto`), fuerza `{tipo:'ninguno', kit_id:null, candidatos:[], mensaje:''}` → el mensaje cae al partidor de sub-preguntas con el kit pineado de contexto, sin re-saludar ni pisar el pin. Si identificó el mismo kit (o su grupo), o ya venía `ninguno`, pasa igual (rama de compatibilidad `¿Es Kit Ya Resuelto?` intacta). Falla hacia un humano (escala), nunca hacia una respuesta automática equivocada. 418→423 nodos.
  **Validado en vivo** (conv de prueba 2411, +5493513784909, número exceptuado):
  - Fix 1 negativo: "De q parte me lo mandarían al cilindro si lo compro?" con Kit 170 pineado → `Validar Interes de Compra (IA)` = `{"intencion_real":false}` → NO pausó, el partidor lo contestó como envío ("Te lo enviamos gratis por Andreani…").
  - Fix 1 positivo: "buenísimo lo compro, te hago la transferencia ahora mismo, pasame el cbu" → `{"intencion_real":true}` → nota "🛒 Posible venta" + etiqueta + pausa.
  - Fix 2 (rama guarda): Kit 170 pineado → "che y el combo escape pwr paolucci mas leva de 6.40 cuanto sale" → `Identificar Necesidad` devolvió `kit_confiado: 2` (el bug exacto) → `Respetar Kit Pineado` lo forzó a `ninguno` → escaló en silencio, **cero bienvenida del Combo Escape, pin de Kit 170 intacto**.
  - Fix 2 (passthrough): mismo mensaje pero identificando el mismo Kit 170 → pasó sin tocar, rama de compatibilidad ("¿compatible con zanella zb 110?") escaló normal.
  - Regresión partidor (precio/envío/negocio) y `/bot on`: OK.
  Script del fix: `apply.mjs` (sesión de Claude Code del 28/8). **Pendiente:** `rutas-bot-chatwoot.html` sigue desactualizado (falta dibujar el gate de IA y el nodo `Respetar Kit Pineado`).

- **El bot confirmó una Honda Wave como compatible con un combo que NO le entra (2026-08-28).** Caso real: conv 2882 (+5493834829374, Matias Rivarola), grupo Kit 120 para 110. Cliente dio "wave 2014"; el bot respondió "le va bien a tu moto" y siguió con corto/largo (exec 88987: `Buscar Compatibilidad del Grupo` devolvió `compatible: true`). Dos causas encadenadas:
  1. **Dato roto al guardarlo.** `parsearListaCompat` (`lib/compatibilidad-texto.ts`) no toleraba una aclaración con paréntesis anidados ("…(alesar los cárteres)…") ni saltos de línea como separador → guardaba todo el pegote como `modelo_moto` con `detalle` vacío. `rm_modelo_ok` nunca matchea ese texto largo, así que las 4 reglas "wave/biz/crypton = NO compatible" del grupo eran inalcanzables. Afectaba 8 filas de `chat_combo_compatibilidad` (grupos 1 y 3) + 10 de `chat_articulo_compatibilidad`. **Fix:** parser reescrito con conteo de anidación (último paréntesis balanceado = aclaración) y `\n`/`\r` como separador además de la coma; limpieza de datos con `n8n-workflows/fix-compatibilidad-modelo-detalle-pegado_2026-08-28.mjs` (re-parsea y reescribe modelo+detalle; filas con 2 modelos pegados por salto de línea se abren en 2).
  2. **Una pieza periférica tapaba el "no" de la central.** Con la regla del combo inalcanzable, la consulta cae al CTE `articulo`, que tomaba `ORDER BY creado_en DESC LIMIT 1` entre TODAS las piezas del combo — carburador/codo/filtro sí entran en una Wave, así que devolvía `compatible: true` ignorando que el cilindro dice "no". **Fix:** en `Buscar Compatibilidad del Grupo` y `Buscar Compatibilidad del Kit`, el CTE `articulo` ahora ordena `compatible ASC, creado_en DESC` → un "no compatible" de cualquier pieza bloquea el combo entero. El CTE `combo` (curado a mano) sigue con `creado_en DESC`. Backup: `workflow_backup_pre-fix-compat-pieza-periferica_2026-08-28.json`.
  Verificado que con el dato limpio la consulta devuelve `compatible: false` para "wave 2014"/grupo 1. **Pendiente:** validación en vivo con conversación de prueba (bot fuera de horario al aplicar).

- **Grupo pineado "esperando la moto": una consulta real que ese combo no puede contestar hacía que el bot insistiera con la moto en vez de escalar (2026-08-28).** Continuación del bug de referral del 27/8 (conv 2818, +5492227678179, Tobías — pin de Tapa CDI que quedó sin limpiar). Con un grupo pineado en estado `esperando_moto`, TODO mensaje entrante pasa por `Extraer Modelo Grupo` asumiendo que es la respuesta de la moto. Con "El escape quiero saber cuánto vale" (precio de una pieza que no es de ese combo): el extractor no encuentra moto → `¿Grupo Sin Modelo?` → el chequeo de pieza suelta no matchea (el escape es de otro grupo) → `Extraer Tema Negocio (Grupo)` lo clasificaba **"nada"** (lo confundía con "menciona una pieza, ya se manejó") → caía en el default `Preparar Repregunta Modelo (Grupo)` → "Que marca y modelo es tu moto?". Y cuando el cliente contestaba la moto ("Wave nf 100"), se tomaba como consulta de compatibilidad del combo equivocado → "no es compatible con tu Wave".
  **Fix (2 partes, solo prompt + 1 conexión, sin nodos nuevos — 423 nodos):**
  1. **Prompt de `Extraer Tema Negocio (Grupo)`:** una pregunta de precio / medida / disponibilidad / dato de cualquier producto o pieza que el chequeo de piezas NO resolvió — esté o no dentro del combo — ahora es **"otro"** (escala en nota privada silenciosa), nunca "nada". "nada" queda solo para charla pura de la moto o comentarios sin pedido.
  2. **Cortada la conexión `Preparar Nota Escalado Negocio (Grupo)` → `¿Fue Mayorista?`:** el escalado silencioso de "otro" (y de "negocio sin info") quedaba enganchado al nodo que vuelve a pedir la moto, así que mandaba la nota privada Y "decime tu moto" a la vez (señal contradictoria — misma familia que el fix del 21/8 de "no mandar cierre si hay algo sin resolver"). Ahora el escalado termina en `Fin - Escalado a Equipo`, mudo. El re-pregunto de la moto queda solo para la rama de negocio RESUELTO (`Enviar Respuesta Negocio (Grupo)` → `¿Fue Mayorista?`), intacta. Riesgo aceptado: un caso raro de mayorista escalado mientras se espera la moto ya no borra el pin — peor caso, pin viejo recuperable.
  **Validado en vivo** (conv de prueba 2411, +5493513784909, grupo Kit 120 pineado `esperando_moto`, vía webhook sintético — la cola de "esperar ráfaga" de n8n estaba lentísima, ~15 min por ejecución): (a) solo con el fix 1, `Extraer Tema Negocio (Grupo)` dio "otro" y dejó la nota privada, PERO igual mandó "Que marca y modelo es tu moto?" al cliente (destapó el 2º agujero); (b) con los dos fixes, exec 89348: "el escape pwr paolucci cuanto sale" → "otro" → `Registrar Pendiente Negocio (Grupo)` → `Enviar Nota Escalado` (privada) → `Fin - Escalado a Equipo`, **cero mensaje al cliente** (confirmado contra Chatwoot real).
  **Pin de Tobías (conv 2818) limpiado** con "Utilidad - Limpiar Pin de Prueba". **Pendiente:** contestarle a mano a Tobías el precio del escape suelto ($95.000); `rutas-bot-chatwoot.html` sigue desactualizado (falta reflejar la conexión cortada).

- **Grupo pineado "esperando la moto": cuando la ráfaga trae la moto + otra consulta, la otra consulta se perdía (2026-08-28).** Caso real: conv 2931 (+5493537563183, Octavio Oviedo), grupo Kit 120 para 110. Ráfaga: "Para una guerrero 110cc" / "Recorrido largo" / "Tendrán levas levantadas". El flujo de `esperando_moto` toma la moto → `Buscar Compatibilidad del Grupo` (sin dato para Guerrero 110) → escala en silencio a `preguntas_tecnicas_pendientes` + nota privada. Todo bien hasta ahí — pero la nota privada solo hablaba de compatibilidad; el "Recorrido largo" (variante ya elegida) y el "Tendrán levas levantadas" (pieza ajena al combo) no aparecían en ningún lado visible para el equipo (el `pregunta_original` de la fila SÍ los guarda, pero nadie mira la tabla, miran la nota en Chatwoot). Es el caso espejo del fix anterior: aquel cubrió "la moto NO viene en la ráfaga", este es "la moto SÍ viene + resto".
  **Fix (1 nodo, solo texto — `Preparar Nota Escalado (Grupo)`):** el `motivo` ahora, si `$('Parsear Modelo Grupo').item.json.resto_mensaje` no está vacío, agrega un párrafo "Ojo: en la misma ráfaga el cliente también escribió «…». Si ahí hay algo para responder (una pieza suelta, o la variante recorrido corto/largo), sumalo en tu respuesta." Sin nodos nuevos, sin tocar wiring. Aplicado vía REST API n8n (`PUT /workflows/s7EpPTjNFy6iCclg`).
  **Gotcha de encoding encontrado acá:** un `PUT` con el body como `JSON.stringify(payload)` UTF-8 crudo hacía que n8n guardara la "í" (U+00ED) partida — quedaba solo el 2º byte (`0xAD`), y en la nota entregada se veía "Todav?a" / "ah?". Se veía bien en el `GET` de la app pero mal en el mensaje real. **Solución:** mandar el body con `json.dumps(..., ensure_ascii=True)` (escapes `\uXXXX` puros ASCII en el cable). Esta corrupción de "í" ya venía de antes en varios textos del workflow (ej. "Envío" en las bienvenidas) — mismo origen probable, no reparado en masa todavía.
  **Validado en vivo** (conv de prueba 2411, grupo Kit 120 pineado `esperando_moto`, webhook sintético, `preguntas_tecnicas_pendientes` de la conv borrada antes para forzar nota nueva — exec 89670 y la re-corrida): nota privada con el párrafo "Ojo:" y `resto_mensaje` limpio ("Recorrido largo / Tendrán levas levantadas"), encoding correcto, cero mensaje al cliente. Dedup por fila pendiente sigue funcionando (con una fila ya existente no re-escala). Datos de prueba y pin limpiados al terminar.
  **No resuelto a propósito (charlado, queda para otra iteración):** (a) si la compatibilidad SÍ estuviera cargada y diera compatible, el "Tendrán levas levantadas" se sigue perdiendo — el camino compatible va directo a `Resolver Variante Anticipada` sin mirar el resto; (b) el "Recorrido largo" no se guarda: tras confirmar compatibilidad el bot vuelve a preguntar corto/largo igual. Ambos son cambios más profundos (tocan el camino compatible); por ahora la nota se lo deja servido al humano. `rutas-bot-chatwoot.html` sin cambios (el fix es solo texto de un nodo).
  **Pendiente:** contestar a mano la nota de la conv 2931 real (¿compatible la Guerrero 110 con el Kit 120? + ¿hay levas levantadas?).

- **El bot "siempre se inclinaba a recorrido corto" en los grupos de 2 variantes (2026-08-28).** Caso real: conv 2919 (+5492923416762), grupo Tapa CDI. El cliente preguntó "ese motor es recorrido largo o recorrido corto??" y el bot mandó DOS mensajes contradictorios en la misma ejecución (89723): la pregunta de variante correcta + "El cilindro que incluye este combo es la versión corta." (falso — el combo viene en las dos). Dos causas:
  1. **Dato: el `detalle` a nivel grupo traía una variante incrustada.** Cada `chat_packs.detalle` de un grupo termina describiendo SU variante ("(recorrido corto)", "la leva (corta)", "...la versión corta."). `Buscar Detalle Grupo Pineado (Con Modelo)` / `(Variante)` / `(Sub-pregunta)` hacen `ORDER BY k.id LIMIT 1` → **siempre agarran el pack "corto"**. Así, mientras la variante no está resuelta, la IA siempre ve "corto" en la ficha. Pasaba en los 3 grupos. **Fix:** se limpiaron los 6 `detalle` de packs de grupo (ids 3-8) sacando la cláusula de variante — los dos packs de cada grupo quedan idénticos y neutros. La variante ya la dicen `criterio_variante`, la bienvenida y la `pregunta_variante`. Sin migración (era editar texto, no estructura).
  2. **Prompt: `Responder Articulo Suelto (Grupo*)` contestaba la pregunta de "qué recorrido es" desde el detalle.** El prompt ya excluía "cuál es la MÍA" pero el modelo leyó "ese motor es corto o largo?" como "qué trae el kit" y copió la frase del detalle. **Fix:** se agregó a los 3 nodos `Responder Articulo Suelto (Grupo)` / `(Grupo - Con Modelo)` / `(Grupo - Variante)` (systemMessage idéntico) una REGLA DURA: cualquier pregunta sobre qué recorrido/versión/variante ES el combo o necesita la moto, con la variante sin resolver → siempre `resuelto:false`, aunque el detalle nombre una variante. Con el ejemplo real textual.
  **De paso:** el "Utilidad - Limpiar Pin de Prueba" ahora también borra el buffer de ráfaga (`{telefono}` lista) y `seq2:{telefono}` — sin eso, mensajes de una prueba abandonada quedaban en el buffer de Redis y se procesaban pegados a la siguiente ráfaga de prueba (pasó en esta validación, exec 89748 proceso "es de color negro la tapa" de una prueba vieja).
  **Validado** (conv 2411, grupo Tapa CDI): (a) repro limpio exec 89781 — `Buscar Detalle` sirve el texto neutro, `Responder Articulo Suelto` = `resuelto:false`, único mensaje al cliente = la pregunta de variante, cero "versión corta"; (b) positivo "qué trae el combo?" exec 89783 — contesta desde el detalle neutro, sin afirmar variante (el camino `resuelto:true, articulo_ids:[], dato=<detalle>` sigue funcionando). **Nota:** en estado `esperando_variante`, `Resolver Variante` tiene prioridad sobre el chequeo de pieza suelta — "el cilindro corto aparte cuánto sale?" se tomó como respuesta de variante ("corto") en vez de pedido de precio suelto. Es previo a este fix y la frase es genuinamente ambigua; queda anotado, no se tocó.
