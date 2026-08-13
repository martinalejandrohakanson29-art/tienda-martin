# Bot de WhatsApp (Chatwoot + n8n) — contexto completo

> Este documento reemplaza toda la documentación dispersa anterior (auditorías de
> `workflow_mateo`, notas de migración, etc.). Están en el historial de git si hace falta
> desenterrar algo puntual, pero para entender el estado actual **alcanza con este archivo**.
> Actualizalo cuando cambie algo importante — la idea es que una conversación nueva pueda
> arrancar leyendo esto, sin tener que repetir toda la explicación de cero.

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
  ahí salió la ronda de mejoras documentada abajo (Fases 5 a 8, 2026-08-13).

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
   último mensaje (subido de 45s a 90s el 2026-08-13; se estira solo con cada mensaje nuevo, no
   es una ventana fija desde el primero). Nodo: `Esperar Rafaga (45s)` — el nombre quedó
   desactualizado, el valor real está en `parameters.amount = 90`.
3. **Clasificador rápido, sin IA** (`Clasificar Mensaje (sin IA)`): compara el texto agrupado
   contra las plantillas exactas de `kits_publicidad` y detecta saludo puro. Si no matchea
   ninguna de las dos → `sin_match`.
4. **Si matcheó un kit**: manda el saludo/foto del kit y lo "pinea" en Redis
   (`kit_pineado:{teléfono}`, TTL 12hs) para que las siguientes preguntas de esa conversación
   sepan de qué kit se está hablando.
5. **Si hay un kit pineado y el mensaje no matcheó nada nuevo**: se chequea con IA acotada
   (DeepSeek) si es una pregunta de compatibilidad ("¿anda en tal moto?"). Si sí, busca la
   respuesta en `compatibilidades`; si no hay dato, escala al equipo (ver Fase 3).
6. **Si no es ni plantilla, ni saludo, ni compatibilidad** (o no hay kit pineado): entra la
   lógica nueva de las Fases 5-7 — **acá es donde vale la pena leer el resto de este documento**.

### Fases aplicadas (orden cronológico, todas ya en producción salvo que se indique lo contrario)

Cada fase se aplicó con un script `n8n-workflows/auditoria-harness/apply-faseN-*.mjs` que baja un
backup del workflow activo, arma los nodos nuevos, y hace `PUT` contra la API real de n8n. Los
backups quedan en la misma carpeta (`workflow_backup_pre-faseN-*.json`) como puntos de rollback.

- **Fase 1-4** (2026-08-12/13, `apply-fase2-pin-compatibilidad.mjs`,
  `apply-fase3-escalado-equipo.mjs`, `apply-fase4-pausa-conversacion.mjs`): pineo de kit +
  compatibilidad, escalado al equipo con aprendizaje, pausa de conversación cuando responde un
  humano. Base de lo descrito en los puntos 4-5 de arriba.
- **Fase 5** (`n8n-workflows/escalado-sin-match.sql`): tabla `preguntas_sin_match_pendientes`
  para guardar lo que no se puede resolver automáticamente.
- **Fase 6** (`apply-fase6-split-sin-match.mjs`): cuando cae en `sin_match`, un paso de IA
  acotada (nunca redacta, solo separa y etiqueta) parte el mensaje en sub-preguntas —
  `precio` (solo válido si hay kit pineado), `envio`, `negocio`, `otro`. Cada una se resuelve
  contra datos ya cargados: `kits_publicidad` (precio/envío del kit puntual, gana sobre la
  política general), `info_negocio` (envío general, horarios, ubicación, medios de pago,
  garantía — buscado con la función SQL `rm_score`, comparación difusa), o `conocimiento_libre`
  categoria `sin_match` (lo que ya enseñó el equipo antes). Lo resuelto se redacta con otro paso
  de IA acotada (**nunca inventa, solo redacta el dato que ya se encontró**) y se manda como 1 o
  2 mensajes (prioridad precio > envío > negocio para decidir qué va primero). Lo que no se
  resuelve escala en silencio a `preguntas_sin_match_pendientes` (con protección anti-duplicado
  por conversación).
- **Fase 7** (`apply-fase7-retorno-sin-match.mjs`): cuando el equipo contesta la escalada (nota
  privada en Chatwoot), se interpreta con IA acotada, se le manda al cliente con la voz del bot
  (nunca revela que hubo un humano de por medio), se marca la fila como respondida, y se guarda
  en `conocimiento_libre` para que la próxima pregunta parecida ya no necesite escalar.
- **Fase 8** (`app/actions/pendientes-equipo.ts`, `app/admin/chatwoot/pendientes/`): el panel de
  pendientes ahora tiene 4 categorías (técnica, precio, negocio, sin clasificar) en vez de 3.

## Filosofía de diseño (para cuando pidan algo nuevo)

- **Sin IA donde se pueda.** Todo lo que sea determinístico (plantilla exacta, búsqueda en base
  con `rm_score`) se resuelve sin modelo. Es la reacción directa a la fatiga de
  `workflow_mateo`.
- **Cuando hace falta IA, que su trabajo sea chico y acotado.** Nunca "resolvé esto vos", siempre
  "extraeme este dato puntual" o "redactá esto usando SOLO el texto que te doy, no agregues
  nada". El precedente ya probado: `Extraer Pregunta Compatibilidad`, `Extraer Tema Negocio`,
  `Dividir y Etiquetar Sub-preguntas`, `Redactar Respuesta desde Dato`. Modelo usado en todos
  lados: DeepSeek (`deepseek-v4-flash`, `temperature: 0`, credential `DeepSeek account`) — no se
  agregó OpenAI/otro proveedor a propósito, por consistencia de infraestructura.
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
| `respuestas_pendientes` | Cola de mensajes cuando el bot está apagado | `bot-onoff.sql` |
| `bot_conversacion_lock` | Lock por teléfono, no procesar 2 mensajes en simultáneo | `lock-conversacion.sql` |
| `kits_publicidad` | Kits publicitados: plantilla exacta, precio, envío, detalle | (histórico, sin `.sql` propio) |
| `info_negocio` | Preguntas frecuentes del negocio (`tema`: ubicacion/horarios/medios_pago/envios/garantia/otro) — admin en `/admin/chatwoot/conocimiento` | — |
| `conocimiento_libre` | Aprendizaje libre por categoría (`tecnica`/`precio`/`negocio`/`sin_match`), buscado con `rm_score` como respaldo | `conocimiento-libre.sql` (también crea `rm_tokens`/`rm_score`/`rm_modelo_ok`) |
| `compatibilidades` | Compatibilidad kit↔modelo de moto ya confirmada | — |
| `preguntas_tecnicas_pendientes` | Escaladas de compatibilidad sin resolver | `link-compatibilidades-kit.sql`, `link-preguntas-tecnicas-kit.sql` (agregan `kit_id`) |
| `preguntas_precio_pendientes`, `preguntas_negocio_pendientes` | Escaladas de precio/negocio — **heredadas de `workflow_mateo`, el 2.0 todavía no escribe ahí** (ver "Pendiente" abajo) | — |
| `preguntas_sin_match_pendientes` | Escaladas de la Fase 6 (nada matcheó) | `escalado-sin-match.sql` |

## Cómo se trabaja sobre el workflow (proceso, no reinventar)

1. Los cambios se aplican **directo contra la API real de n8n** (`https://n8n.revolucionmotos.tech/api/v1`,
   key en `.env` como `APIKEY_N8N`), no hay ambiente de staging separado para el workflow. La
   seguridad viene de: bajar backup antes de cada `PUT` (`workflow_backup_pre-<algo>_<fecha>.json`),
   y validar con una **conversación de prueba dedicada** antes de dar por bueno el cambio:
   `conversation_id 1`, teléfono `+5493513784909`.
2. Herramientas en `n8n-workflows/auditoria-harness/`:
   - `send.js` — manda un mensaje sintético al webhook (`WEBHOOK_TOKEN=... node send.js '{"content":"...", "senderType":"contact"}'`). `senderType` puede ser `contact`, `team` (simula que responde un humano — **hay que pasar también `"message_type":"outgoing"`, si no lo toma como mensaje entrante de cliente**) o `bot`.
   - `wait_exec.js` — espera la ejecución resultante en n8n y muestra el camino de nodos que
     recorrió (`API_KEY_N8N=... node wait_exec.js <msgId> <sentAtISO>`).
   - `query.js` — consulta directo la base real.
   - `apply-faseN-*.mjs` — el patrón para agregar nodos nuevos: bajar backup, armar nodos con
     `buildNodes()`, reconectar, `PUT`.
3. **Reglas de higiene** (aprendidas a los golpes, algunas el mismo 2026-08-13): marcar todo lo
   sintético con prefijo `[auditoria-XX]` en el contenido; limpiar por `id` exacto, no por patrón
   de texto amplio; reusar la conversación de prueba en vez de inventar IDs.
4. **Gotchas de n8n descubiertos armando la Fase 6** (para no repetir el error):
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

## Qué falta / pendiente (al 2026-08-13, revisar si sigue vigente)

- **Cargar el tema `garantia`** en `/admin/chatwoot/conocimiento` — hoy no tiene datos, así que
  cualquier pregunta de garantía escala en vez de contestarse sola.
- **Fase 8 sin commitear.** Los cambios de `app/actions/pendientes-equipo.ts` y
  `app/admin/chatwoot/pendientes/pendientes-client.tsx` están en el working tree, typecheck
  limpio, pero no se subieron todavía.
- **`preguntas_precio_pendientes` / `preguntas_negocio_pendientes` son harina de otro costal.**
  El panel las lee y las tiene desde antes, pero el workflow 2.0 nunca escribe ni escucha
  respuestas ahí — son remanentes de `workflow_mateo`. Hoy la Fase 6 ya cubre ese terreno de
  otra forma (a través de `envio`/`negocio` y `sin_match`), así que no parece necesario portarlas
  — solo tenerlo presente si en algún momento aparece un caso que no encaje en ninguna de las
  categorías nuevas.
- **La rama `negocio` de la Fase 6 hace una llamada extra a DeepSeek** (clasificar el tema
  puntual: horarios/ubicación/etc.) en TODO mensaje que llega a esa rama, incluso para los que
  van a `precio`/`envio`/`otro` (corre igual por diseño, para mantener el camino lineal sin
  bifurcar — ver gotchas arriba). Es plata/tiempo de más, chico pero real; si en algún momento
  importa el costo, ahí hay margen de optimización.
- **Fase 7 duplica el camino de "el equipo respondió"** en vez de unificarlo con el de la rama
  técnica — si una conversación tiene a la vez una pendiente técnica y una `sin_match`, hace
  falta una respuesta del equipo por cada una. Aceptado a propósito por menor riesgo de tocar lo
  que ya funcionaba; revisar si con el tiempo conviene unificar.
- **Sin ambiente de staging real para el workflow.** Existió en algún momento un stack local
  (n8n + Postgres + Chatwoot mockeado) para probar sin tocar producción, armado para
  `workflow_mateo` — se retiró en la limpieza del 2026-08-13 porque no se había vuelto a usar
  desde el rediseño (todo el trabajo reciente se validó directo contra producción con la
  conversación de prueba dedicada, ver arriba). Si en algún momento hace falta un ambiente
  aislado de nuevo, armarlo de cero pensado para "Respuestas chatwoot 2.0", no para el viejo.
