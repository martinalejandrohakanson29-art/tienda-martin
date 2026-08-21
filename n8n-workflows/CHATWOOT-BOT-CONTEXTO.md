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
   `conversation_id 1`, teléfono `+5493513784909`. Reglas de higiene aprendidas a los golpes:
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
- **Todavía sin hacer:** reescribir el `mensaje_bienvenida` propio de los packs 7 y 8 (Tapa CDI) —
  hoy es idéntico al del grupo (menciona los 2 precios y repregunta la moto) en vez de decir el
  precio único ya resuelto (no rompe nada, `/api/chatwoot/enviar` dedupa el contenido repetido, pero
  el mensaje final no es tan preciso como podría ser); agregar al `detalle` del artículo Cilindro
  (Kit 120) el párrafo sobre ambigüedad recorrido corto/largo que tenía el kit viejo y no se migró;
  y extender el matching de artículo suelto al caso de "resto en la misma ráfaga que un grupo sin
  resolver" (ver arriba).

## Qué falta / pendiente (al 2026-08-21)

- **Reescribir el `mensaje_bienvenida` propio de los packs 7 y 8** (Tapa CDI corto/largo) —
  hoy es idéntico al mensaje del grupo (menciona los 2 precios y vuelve a preguntar la moto) en
  vez de decir el precio único ya resuelto. No rompe nada (`/api/chatwoot/enviar` dedupa el
  contenido repetido), pero el mensaje final que recibe el cliente no es tan preciso como podría
  ser. Se puede editar directo en `/admin/chatwoot/catalogo` (pestaña Packs). **Primer punto para
  retomar la próxima sesión.**
- **Monitorear en tráfico real** los 3 grupos migrados (Kit 120, Escape pwr+Leva, Tapa CDI) — ya
  confirmado con clientes reales (ver "Bug real de la ventana de transición" y "Barrido de
  reprocesamiento" arriba), pero el barrido solo cubrió las últimas 48hs. Si aparece un pin raro
  de una conversación de antes del 2026-08-19, es probable que sea la misma ventana de
  transición — limpiar el pin de ese teléfono alcanza, no hace falta tocar el workflow de nuevo.
- **Revisar si quedó nota duplicada** en conv 2226 y 2248 (Chatwoot) — el barrido de
  reprocesamiento les contestó precio/stock pero la compatibilidad volvió a escalar; puede haber
  quedado una nota de escalado vieja al lado de una nueva para la misma pregunta.
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
