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
   `conversation_id 2405`, teléfono `+5493513784909` (la `conversation_id 1` que se usaba antes
   quedó retirada el 2026-08-22 — acumuló tanto historial mezclado de pruebas de kits distintos
   que terminó confundiendo de verdad a `Identificar Necesidad` con un mensaje real: "tapa cdi y
   cilindro 120" dio `tipo: "ninguno"` ahí, y con historial limpio en la 2405 el mismo mensaje dio
   el resultado correcto, `candidatos`. Sigue existiendo en Chatwoot por si hace falta consultar
   el historial viejo, simplemente no se usa más para probar). Reglas de higiene aprendidas a los
   golpes:
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
- **Bug conocido, sin arreglar:** `parsearListaCompat` (compartido con los kits viejos) solo separa
  por comas — si se tipea una lista de compatibilidad con saltos de línea en vez de comas, todo
  queda pegado en un solo `modelo_moto` con el salto de línea adentro.
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

## Qué falta / pendiente (al 2026-08-21)

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
