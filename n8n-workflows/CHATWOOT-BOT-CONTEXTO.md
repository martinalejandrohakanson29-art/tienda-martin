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
- **Todavía sin hacer:** terminar de cargar los packs reales que faltan (5 de 6), agregar al
  `detalle` del artículo Cilindro (Kit 120) el párrafo sobre ambigüedad recorrido corto/largo que
  tenía el kit viejo y no se migró, y el paso de matching en el workflow de n8n que use esta base —
  sigue siendo el punto pendiente real, a charlar paso a paso.

## Qué falta / pendiente (al 2026-08-20)

- **Cargar el tema `garantia`** en `/admin/chatwoot/conocimiento` — hoy no tiene datos, así que
  cualquier pregunta de garantía escala en vez de contestarse sola.
- **Kit 8 (combo TAPA CDI + CILINDRO 120) sigue con precio ambiguo.** Su campo `precio` tiene dos
  valores en el mismo texto (recorrido corto / largo). Los fixes ya sacaron la instrucción
  indebida de re-preguntar y la respuesta duplicada, pero el precio en sí sigue siendo doble —
  no se charló todavía si conviene separarlo en dos kits, dejar un precio "desde", o escalar
  cuando el precio tiene más de un valor.
- **Árbol de artículos: falta el paso de matching en el workflow.** Base de datos y admin ya
  están (Kit 8 con 2 artículos cargados), pero el bot todavía no distingue "el cliente pide una
  pieza suelta" de "el cliente pide el kit completo". Ver
  [[project-chatwoot-arbol-articulos-idea]] para las decisiones de diseño ya tomadas antes de
  retomar esto.
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
