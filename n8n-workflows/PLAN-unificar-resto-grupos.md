# Plan — unificar el manejo del "resto de la ráfaga" en los grupos

> Estado: **PUT 1, PUT 2 y PUT 2b aplicados y validados el 2026-08-31.**
> PUT 2 salió en versión ACOTADA (no se recableó a la máquina — ver tabla de rollout).
> PUT 2b = cierre de pendientes (tope de reintentos + dedup de precio).
> PUT 3 (borrar las ~35 caseras) **descartado como "solo borrar"** — ver nota abajo.
> Workflow: "Respuestas chatwoot 2.0" (n8n, id `s7EpPTjNFy6iCclg`).
> Contexto del problema: ver `CHATWOOT-BOT-CONTEXTO.md` y la memoria
> `[[project-chatwoot-grupo-vs-kit-simple-drift]]`.

---

## 1. El problema (recordatorio corto)

Cuando un cliente entra por un anuncio de un **grupo** (Kit 120, Tapa CDI, Escape+Leva) y
en la misma ráfaga agrega una pregunta simple ("Precio?", "es para recorrido corto?"),
el bot:

- manda / encola la bienvenida (bien), y
- ademas trata TODO lo que sobra como si fuera la moto → lo pasa a `Extraer Modelo Grupo`
  → no encuentra moto → escala una nota privada al equipo.

O sea: el cliente igual queda esperando a un humano, para un dato que ya está en la
bienvenida. Confirmado en 3 conversaciones reales (3044, 3021, 2981) y en sus ejecuciones
de n8n (91126, 91089).

Causa de fondo: los grupos, mientras resuelven, **asumen que cualquier cosa que el cliente
escriba es la moto**. No hay un paso que diga "¿esto es una moto, o es precio / stock /
negocio / cierre?". La máquina que SÍ sabe hacer eso (el partidor de sub-preguntas, Fase 6)
solo la usa el kit simple, no los grupos.

---

## 2. Estado actual — los 4 sub-estados de grupo

Todos cuelgan de `¿Es Grupo en Resolución?` (rama `true`), que a su vez sale de
`Parsear Kit Pineado` (cuando el pin de Redis tiene `grupo_id` en vez de `kit_id`).

| # | Estado (`estado` en el pin) | Nodo que lo detecta | Qué espera del cliente |
|---|---|---|---|
| 1 | `esperando_moto` | `¿Pineado Esperando Moto?` | la marca/modelo de la moto |
| 2 | `esperando_variante` | `¿Pineado Esperando Variante?` | corto / largo |
| 3 | esperando variante **sin** moto (combo universal) | `¿Grupo Compatibilidad Universal?` + `Guardar Estado Esperando Variante` | corto / largo (nunca preguntamos la moto) |
| 4 | resolviendo con la moto ya sabida | `¿Grupo Sin Modelo?` rama `false` | (paso intermedio, resuelve compatibilidad) |

Cada uno tiene su **cascada casera** para el "resto", copiada con sufijos distintos:

- **Artículo suelto**: `Buscar Detalle Grupo Pineado` / `(Con Modelo)` / `(Variante)` →
  `Responder Articulo Suelto (Grupo)` / `(Grupo - Con Modelo)` / `(Grupo - Variante)` +
  sus `Parsear` / `¿Resuelto?` / `Preparar/Enviar Respuesta`.
- **Tema negocio**: `Extraer Tema Negocio (Grupo)` / `(Variante)` / `(Esperando Variante)` +
  modelo IA + `Parsear` + `¿Es Negocio?` + `Buscar Info Negocio` + `¿Hay Info Negocio?` +
  `Preparar/Enviar Respuesta Negocio` + `Registrar Pendiente Negocio` +
  `Preparar Nota Escalado Negocio`.
- **Sin resolver / cierre**: `¿Es Otro Sin Resolver? (Grupo)` / `(Esperando Variante)`,
  `¿Es Cierre? (Grupo)`, `Fin - Cierre Sin Respuesta (Grupo)`.
- **Re-preguntar la moto**: `Preparar Repregunta Modelo (Grupo)` → `¿Moto Recien Pedida?` →
  `Contar Intento` → `¿Repregunta Repetida?` → redactar / texto fijo → enviar.

Total a colapsar: **~35 nodos** en 3-4 copias del mismo patrón.

---

## 3. La máquina que ya existe (Fase 6, la usa el kit simple)

Puerta de entrada: `Traer Ultimo Mensaje Nuestro` → `Extraer Ultimo Mensaje Nuestro` →
`Buscar Cierre Reciente (Rafaga)` → `Leer Incompatibilidad Reciente (Rafaga)` →
`Preparar Contexto Sub-preguntas` → `Dividir y Etiquetar Sub-preguntas` (IA: parte el
mensaje en pedazos y etiqueta cada uno: `precio` / `stock` / `envio` / `negocio` /
`cierre` / `otro`) → `Parsear Sub-preguntas` → `Separar Pedazos` → cadena de resolución
(precio y envío de `chat_packs`, negocio de `info_negocio`, detalle, conocimiento libre,
catálogo) → `Redactar Respuesta desde Dato` → `Aggregate` → `Armar Mensajes` → manda un
solo mensaje con lo resuelto y escala en silencio, una sola vez, lo que quedó sin resolver.

Ya sabe:
- si NO hay `kit_id` → `precio`/`stock` pasan a `otro` y escalan (no inventa precios).
- si la bienvenida/kit se confirmó **en este mismo turno** (`kit_recien_confirmado`) → tira
  el pedazo `precio` (no repite el precio que ya está en la bienvenida).
- "recorrido" = recorrido del pistón (corto/largo), nunca envío.
- `stock` siempre "sí tenemos", sin escalar.
- `cierre` ya enviado hace <24hs → lo omite (Redis).

Ya entra desde varios lados a la vez (`¿Hay Resto Adicional en la Rafaga?`,
`¿Qué Identificó?[4]`, `¿Es Kit Ya Resuelto? (Stock)`, `¿Es Compatibilidad Con Modelo?`).
Sumar los grupos como una entrada más es el patrón normal.

**Ojo — el `kit_id` de un grupo en resolución es `null`.** `Parsear Kit Pineado` solo
llena `grupo_id`. Sin cambios, la máquina clasificaría "Precio?" como `otro` y escalaría.
Ese es el enganche donde metemos la lógica nueva (punto 4).

---

## 4. Arquitectura propuesta

### 4.1 Etiqueta nueva `moto`

- `Dividir y Etiquetar Sub-preguntas` (prompt): agregar `moto` a la lista cerrada de
  categorías. Definición: "el cliente está diciendo para qué moto es (marca y/o modelo:
  'una gilera smash', 'zanella zb 110', 'para la wave')".
- `Parsear Sub-preguntas` (Code): agregar `'moto'` al array `categoriasValidas` — **si no,
  se pisa sola a `otro` en silencio** (tropezón ya conocido, pasó con `cierre`).

### 4.2 `Preparar Contexto Sub-preguntas` — hacerlo consciente del grupo

Hoy lee `kit_id`/`kit_nombre` de `Parsear Kit Pineado` y `kit_recien_confirmado` de los
nodos "Marcar ... Pineado". Agregar:

- `es_grupo`, `grupo_id`, `estado` (de `Parsear Kit Pineado`).
- `bienvenida_fresca`: `true` si alguno de estos nodos corrió en ESTE turno —
  `Marcar Grupo Pineado (Esperando Moto)`, `Guardar Estado Esperando Variante`,
  `Marcar Grupo Pineado (Candidato Unico)`, `Enviar Saludo Grupo`,
  `Enviar Saludo Grupo (Identificacion)`, `Enviar Bienvenida Pack Final`. (Mismo mecanismo
  `try { $('Nodo').item } catch {}` que ya usa para `kit_recien_confirmado`.)
- `grupo_bienvenida_texto` + `grupo_precios_variantes`: del `Buscar Kits Activos`
  (`grupos[].mensaje_bienvenida` y `grupos[].variantes[].precio`), por si hay que reenviar.

### 4.3 `Parsear Sub-preguntas` / `Consolidar Dato Resuelto` — rama grupo

Cuando `es_grupo === true` y el estado todavía no tiene pack final (1, 2, 3):

| Pedazo | Bienvenida fresca | Bienvenida vieja |
|---|---|---|
| `precio` / `stock` / `envio` | `omitir = true` (silencio total, ni respuesta ni nota) | reenviar la bienvenida del grupo (`grupo_bienvenida_texto`) como el dato resuelto |
| `negocio` | resolver contra `info_negocio` igual que el kit simple | idem |
| `cierre` | igual que hoy (texto fijo / omitir si repetido) | idem |
| `moto` | ver 4.4 | ver 4.4 |
| `otro` | pasa por detalle/catálogo; si no resuelve → escala | idem |

> Decisión acordada con Martín (2026-08-31): "si preguntan algo que está en la bienvenida,
> y la bienvenida se manda sí o sí, no hacemos nada". El "no hacemos nada" aplica **solo
> con bienvenida fresca**; si es vieja y repreguntan, se reenvía la bienvenida.

### 4.4 El pedazo `moto`

Después de `Parsear Sub-preguntas`, un IF nuevo: **`¿Hay pedazo "moto"?`**

- **Sí** → Code `Juntar Texto Moto` (concatena el/los pedazos `moto`) → conecta al
  `Extraer Modelo Grupo` **existente** (para el estado 1) / al `Resolver Variante` existente
  (estados 2/3, por si contestó corto/largo con una pista). De ahí para adelante, el flujo
  de compatibilidad / variante queda **igual que hoy, sin tocar**.
  - Los demás pedazos de la misma ráfaga (precio, negocio, etc.) **se descartan** — la
    bienvenida ya cubrió precio/envío/contenido, y "moto + otra cosa" en la misma ráfaga es
    raro. **Limitación conocida y deliberada**, a revisar si aparece en tráfico real.
- **No** → `Separar Pedazos` → máquina normal (4.3).

### 4.5 Re-preguntar la moto después de contestar algo

Si en el estado 1 la máquina contestó un `negocio` (o un `otro`) y NO hubo pedazo `moto`,
todavía necesitamos cerrar con "y para qué moto es?". Enganche: la salida de
`Armar Mensajes` / `Enviar Mensaje 1 (Sub-pregunta)`, cuando `es_grupo && estado ===
'esperando_moto' && !hubo_pedazo_moto`, encadena a `Preparar Repregunta Modelo (Grupo)`
(que se conserva) en vez de terminar. (Detalle fino a cerrar en implementación.)

### 4.6 Qué se borra

Las 3-4 copias caseras de: `Extraer Tema Negocio (Grupo/Variante/Esperando Variante)` +
`¿Es Negocio? (*)` + `Buscar Info Negocio (Grupo/Variante/Esperando Variante)` +
`¿Hay Info Negocio? (*)` + `Preparar/Enviar Respuesta Negocio (*)` +
`Registrar Pendiente Negocio (*)` + `Preparar Nota Escalado Negocio (*)` +
`¿Es Otro Sin Resolver? (Grupo/Esperando Variante)` + `¿Es Cierre? (Grupo)` +
`Fin - Cierre Sin Respuesta (Grupo)` + `Responder Articulo Suelto (Grupo/Grupo-Variante)` +
`Buscar Detalle Grupo Pineado` / `(Variante)` y sus `Parsear`/`¿Resuelto?`/`Preparar`.

Se conservan: todo el flujo de compatibilidad, `Resolver Variante*`, `Extraer Modelo Grupo`,
`Preparar Repregunta Modelo (Grupo)` y su sub-cadena de reintentos,
`Detectar Otro Kit en Resto (Grupo)` (fix del 31/08, complementario).

### 4.7 Tabla de pendientes

Unificar todas las escaladas de resto de grupo en `preguntas_sin_match_pendientes` (la
estándar de Fase 6, la que alimenta `/admin/chatwoot/pendientes`), no en
`preguntas_negocio_pendientes` (remanente de `workflow_mateo`).

---

## 5. Sub-decisiones abiertas (para cerrar antes de implementar)

1. **Punto 4.4 — descartar los pedazos no-moto cuando hay moto.** ¿OK como limitación, o
   querés que esos pedazos se guarden y se contesten después de resolver compatibilidad?
   (Recomiendo: descartar por ahora, es simple y el caso es raro.)
2. **Punto 4.3 — reenviar bienvenida completa vs solo la línea de precio** cuando la
   bienvenida es vieja. (Recomiendo: bienvenida completa, ya re-pregunta la moto.)
3. **Punto 4.2 — qué "cubre" la bienvenida en cada estado.** Estado 1: precio + envío +
   contenido. Estados 2/3: ¿la última cosa que mandamos (confirmación de compat + pregunta
   de variante) repite el precio? Hay que mirar el texto real de esos nodos y definir la
   lista `cubre_bienvenida` por estado.
4. **Estados 2/3 con pedazo `moto`.** ¿Tiene sentido que alguien en "esperando corto/largo"
   conteste con una moto? Si es raro, dejamos que caiga en `otro` y escale, y el `moto`
   routing solo lo cableamos para el estado 1.

---

## 6. Grilla de validación (conversación de prueba 2411, +5493513784909)

Antes de publicar, probar cada fila en cada estado aplicable. Bot apagado / fuera de
horario está OK — se inspecciona `respuestas_pendientes` / `preguntas_sin_match_pendientes`
directo (mismo criterio que gotchas ya documentados).

| Mensaje del resto | Estado 1 (esp. moto) | Estado 2 (esp. variante) | Estado 3 (universal) | Estado 4 |
|---|---|---|---|---|
| "Precio?" (bienvenida fresca) | silencio | silencio | silencio | precio real |
| "cuál era el precio?" (día después) | reenvía bienvenida | reenvía | reenvía | precio real |
| "para una gilera smash" | resuelve compat | (def. #4) | (def. #4) | — |
| "hacen envío a Salta?" | contesta envío | idem | idem | idem |
| "están en Córdoba capital?" (negocio) | contesta + re-pregunta moto | contesta | contesta | contesta |
| "corto" / "es la negra" (pista variante) | — | resuelve variante | resuelve variante | — |
| "gracias" / "dale" (cierre) | omite si repetido | idem | idem | idem |
| "precio del cigüeñal suelto" (pieza ajena) | escala en silencio | idem | idem | idem |
| "para una wave, cuánto sale?" (moto + precio) | resuelve compat, descarta precio | — | — | — |
| plantilla de OTRO kit + "quiero ese" | `Detectar Otro Kit` → escala (sin tocar) | idem | idem | idem |

Regresión a chequear aparte: kit simple (que ya usa la máquina) sigue igual en todos los
casos de arriba.

---

## 7. Riesgos y rollback

- **Zona de mucho tráfico y con la parte delicada (compatibilidad) al lado.** Mitigación:
  no se toca nada del flujo de compat/variante, solo qué lo alimenta y qué atrapa lo que
  sobra; validación exhaustiva con la grilla antes de publicar.
- **Un solo cambio coordinado (un PUT).** Migrar 2 estados y dejar 2 con la cascada vieja
  es justo el drift que queremos matar.
- **Rollback**: historial de versiones de n8n (`get_workflow_history` /
  `restore_workflow_version`, o REST API con `APIKEY_N8N`). Antes del PUT, anotar el id de
  versión vigente en el commit.
- **Gotchas de n8n a tener presentes** (todos ya en `CHATWOOT-BOT-CONTEXTO.md`): nodos en
  paralelo referenciados por `$()` que corren al final; `$json` sin nombre de nodo se rompe
  al reordenar; lista blanca hardcodeada al sumar categoría; `PUT` con UTF-8 crudo corrompe
  la "í" (mandar con escapes `\uXXXX`); `/executions` tarda minutos en reflejar.

---

## Rollout en 3 PUTs (acordado 2026-08-31)

| PUT | Qué | Estado |
|---|---|---|
| **1** | Etiqueta `moto` + máquina grupo-aware + recableo de **solo `esperando_moto`**. Caseras del estado 1 quedan desconectadas, sin borrar. | ✅ **hecho 2026-08-31** — `apply-put1-resto-grupo-maquina.mjs`, validado conv 2411 (5 casos: Precio pegado→silencio, precio al otro día→reenvía bienvenida, "recorrido corto?" pegado→silencio, moto→compat OK, negocio→contesta+repregunta). Rollback: versión n8n `099f776a-1e6a-48c8-844c-d83ad3c9d4b3`. |
| **2** | ~~Recablear `esperando_variante` etc. a la máquina~~ → **cambiado a versión ACOTADA**: agregar categoría/flag `precio` a los 3 `Extraer Tema Negocio (*)` + rutear a `Enviar Precio Grupo` (línea de precio del grupo) en vez de escalar. Sin recablear a la máquina. | ✅ **hecho 2026-08-31** — `apply-put2-precio-grupo-no-escala.mjs` (432→437), validado conv 2411 (`(Esperando Variante)` y `(Variante)`). Rollback: versión n8n `62670389-2ef1-4e3b-bc2e-719bc296225d`. |
| **2b** | Cierre de pendientes de la sesión: (a) **tope de reintentos** en el camino de PUT 1 — tras 3 nudges (reenvío bienvenida / repregunta moto) sin la moto, la 4ta escala al equipo en vez de loopear (contador Redis `resto_grupo_intentos:{tel}` TTL 24h; 3 nodos nuevos); (b) **dedup de precio** — si las 2 variantes de un grupo tienen el mismo precio, la línea muestra "$X" una vez. | ✅ **hecho 2026-08-31** — `apply-put2b-tope-reintentos-y-dedup-precio.mjs` (437→440), validado conv 2411 (regresión PUT 1 OK; contador incrementa 0→1→2; al leer 3 → `escalar_grupo` → nota al equipo). Rollback: versión n8n `cb6d0475-333e-4f4e-bf21-e67ffa4bd9fe`. |
| **3** | ~~Borrar las ~35 caseras huérfanas~~ | **descartado** — ver abajo |

**PUT 3 — por qué no se hace (2026-08-31):** tras PUT 1/2/2b **ninguna casera quedó
huérfana**. Las cascadas `(Grupo)` / `(Variante)` / `(Esperando Variante)` siguen siendo el
mecanismo real de los estados 2/3/4 (esperando corto/largo, con y sin moto), y PUT 2 les
metió adentro el camino de precio (`¿Es Precio? (X)` → `Enviar Precio Grupo`). "Borrarlas"
implica primero re-rutear esos 3 estados a la máquina y portar precio + negocio + re-pregunta
+ contadores — que es exactamente la versión amplia que se descartó por poco beneficio y
mucho riesgo. Conclusión: **las caseras se quedan.** Ya no escalan info conocida (PUT 2), no
loopean sin fin (PUT 2b para el estado 1; los estados 2/3 ya tenían sus contadores). Si en el
futuro molesta la duplicación, la tarea es "re-rutear estados 2/3/4 a la máquina" (grande),
no "borrar nodos" (imposible sin lo anterior).

**Por qué PUT 2 cambió de forma:** al mapearlo se vio que las 3 cascadas caseras (`(Grupo)`,
`(Variante)`, `(Esperando Variante)`) no son espejos limpios — cada una con su prompt, su parser,
su re-pregunta y su contador de reintentos. "Meter todo en una máquina" peleaba con esa
estructura por poco beneficio. El fix acotado mata el bug real ("precio escala") sin tocar nada
delicado. La que escalaba de verdad era `(Esperando Variante)`; `(Grupo)`/`(Variante)` quedaron
como red de seguridad (PUT 1 ya intercepta casi todo "precio?" ahí).

### Detalle de lo que hizo PUT 1 (para PUT 2/3)

- La rama nueva vive dentro de `Parsear Sub-preguntas` (guardada por `ctx.esperando_moto_grupo`)
  y `Consolidar Dato Resuelto` / `Marcar Resuelto o No Resuelto` (categorías `reenvio_bienvenida`
  y `repregunta_moto`, que se mandan verbatim). PUT 2 extiende el guard a los otros estados y
  agrega sus textos ("qué cubre la bienvenida" por estado, punto 1 de la sección 5).
- `¿Rutear al Extractor de Modelo? (Grupo)` (If, `$json.ruteo_moto === true`) es el gate entre
  `Parsear Sub-preguntas` y `Separar Pedazos`. `ruteo_moto` lo decide `Parsear Sub-preguntas`.
- `Extraer Modelo Grupo` sigue recibiendo el texto original completo de `Unir Mensajes` (no el
  pedazo `moto`), así que si viene "moto + otra cosa" extrae la moto y descarta el resto (decisión #1).
- Gotcha confirmado sano: `Extraer Modelo Grupo` usa `$('Buscar Kits Activos').item` / `$('Parsear
  Kit Pineado').item` y resuelve bien por el camino nuevo (no dio "No path back").
- Costo real medido: un `reenvio_bienvenida` gasta ~3 llamadas IA de la máquina que no aplican
  (tema negocio, otro-desde-detalle, artículo-catálogo). PUT 2 puede gatearlas.

## 8. Orden de trabajo (PUT 2)

1. Cerrar las 4 sub-decisiones del punto 5.
2. Bajar el JSON del workflow vigente + anotar id de versión.
3. Construir en este orden: etiqueta `moto` → contexto grupo-aware → rama grupo en
   `Parsear`/`Consolidar` → IF `¿Hay pedazo moto?` + routing → enganche re-pregunta moto →
   rewire de los 4 estados a la puerta de la máquina → borrar cascadas caseras.
4. Validar la grilla completa (punto 6) con el bot apagado.
5. PUT a producción, actualizar `CHATWOOT-BOT-CONTEXTO.md` + `rutas-bot-chatwoot.html` en
   el mismo commit.
6. Vigilar ejecuciones reales 2-3 días.
