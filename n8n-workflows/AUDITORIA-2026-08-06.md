# Auditoría del bot de WhatsApp — 2026-08-06

Revisión completa del workflow que responde en Chatwoot. Se auditó **la versión que
corre en producción** (`MAqIthTkpuAo7iKi`, 226 nodos, actualizada 2026-08-06 21:50).

El repo tenía 219: producción estaba **adelante** en 7 nodos — todo el bloque
"Seguimiento Kit", más cambios en `Detectar Mencion Kit`, `Parsear Deteccion Kit`,
`Buscar Compatibilidad`, `Chequear`/`Marcar Cooldown Escalado` y `HTTP Request2`. Se
habían hecho en la UI de n8n y nunca se exportaron.

## Archivos

| archivo | qué es |
|---|---|
| `workflow_mateo.json` | producción **con las correcciones aplicadas**. Es el que hay que importar. |
| `workflow_mateo.produccion-2026-08-06.json` | copia exacta de producción antes de tocar nada, para volver atrás. |

El viejo `workflow_mateo (3).json` se borró: quedó reemplazado por `workflow_mateo.json`,
que además incluye los 7 nodos que solo existían en producción. Está en el historial de git.

## Cómo aplicar

1. n8n → workflow_mateo → `...` → **Import from File** → `workflow_mateo.json`.
2. Confirmar en la UI que **Wait3 diga 15 Seconds** y **Wait2 diga 2 Seconds**
   (antes no declaraban unidad; ver punto 1 de abajo).
3. Guardar y mandar un mensaje de prueba.

Para volver atrás: importar `workflow_mateo.produccion-2026-08-06.json`.

> ### Ojo al exportar por la API
>
> **La API de n8n no devuelve las credenciales de los nodos.** Un workflow bajado con
> `get_workflow_details` (o `GET /workflows/:id`) trae los 229 nodos pero con el campo
> `credentials` vacío en los 68 que lo necesitan. Si se importa así, n8n marca error en
> cada uno de esos nodos y **no deja activar el workflow**.
>
> Pasó exactamente eso al armar este archivo. Las credenciales se restauraron desde el
> último export hecho **desde la UI** (`d18c2e0~1:n8n-workflows/workflow_mateo (3).json`),
> cruzando por nombre de nodo. Son cuatro, una sola de cada clase:
>
> | clase | nombre | nodos |
> |---|---|---|
> | `postgres` | Postgres account | 44 |
> | `redis` | Redis account 2 | 21 |
> | `deepSeekApi` | DeepSeek account | 2 |
> | `openAiApi` | OpenAi account 2 | 1 |
>
> `workflow_mateo.produccion-2026-08-06.json` (el rollback) viene de la API, así que
> **tampoco tiene credenciales**: sirve para diffear y para recuperar la lógica, pero si
> hay que importarlo hay que reasignarlas a mano.
>
> Para versionar el workflow de acá en más, conviene exportarlo desde la UI
> (`...` → Download), que sí las incluye.

---

## Corregido

### 1. Los dos nodos Wait no declaraban unidad
`{"amount": 15}` y `{"amount": 2}`, sin `unit`. **El default del nodo Wait de n8n es
`hours`**, no segundos. Empíricamente el agrupado funcionaba, así que la instancia lo
venía resolviendo como segundos, pero cualquier re-import podía convertir la espera de
agrupado en 15 horas. Ahora dice `"unit": "seconds"` explícito.

### 2. El auto-eco comparaba textos que nunca podían ser iguales
`Marcar Auto-Eco - *` guardaba el texto crudo del agente; lo que volvía de Chatwoot era
el texto ya pasado por `devuelve outputs`, que le saca los `¿`, los puntos y los saltos
de línea. `eco.includes(content)` daba **false** en cuanto la respuesta tenía un signo de
pregunta — o sea casi siempre.

Consecuencia: el bot leía su propia respuesta como "contestó un humano" y se pausaba
**30 días** en esa conversación. Hoy no explotaba porque el filtro primario es
`sender.id !== chatwoot_bot_user_id`, pero el auto-eco es el respaldo de ese filtro y
estaba roto justo en la rama más usada.

Ahora `¿Es Auto-Eco?` normaliza los dos lados (signos y espacios) antes de comparar, y
exige que el mensaje tenga al menos 12 caracteres para contar como eco — sin eso, un
"ok" del equipo puede quedar contenido en la respuesta anterior del bot y **no** pausarlo.
Ante la duda conviene equivocarse pausando.

### 3. En la rama principal el eco se marcaba después de enviar
El orden de conexión de `AI Agent2` era `[Guardar Turno, Marcar Auto-Eco]`. Con
`executionOrder: v1`, n8n termina la primera rama **entera** antes de empezar la segunda,
y esa primera rama incluye todo el envío con `Wait2` entre parte y parte. O sea: el
mensaje ya había salido y la clave `bot_msg:` todavía no existía.

Las otras seis ramas (aprendizaje técnico/negocio/precio, saludo kit, seguimiento kit,
escalado) ya lo marcaban antes. Esta quedó alineada.

### 4. TTL del auto-eco: implícito y de 60 segundos
Los `Marcar Auto-Eco - *` tenían `expire: true` sin `ttl`, así que tomaban el default del
nodo Redis: 60s. Contra `bot_pausado` que sí tenía sus 2592000 escritos, cualquier demora
de Chatwoot por encima del minuto se convertía en una pausa de 30 días. Ahora es 600s
explícito en los ocho nodos.

### 5. Tres fallos que se perdían en silencio
Con `onError: continueErrorOutput` y la salida de error sin conectar, un fallo no rompe
la ejecución ni dispara el workflow de errores: simplemente no pasa nada.

| nodo | qué se perdía |
|---|---|
| `1ª Parte Respuesta1` | el loop se cortaba: el cliente quedaba sin respuesta, y el turno ya figuraba respondido en `conversaciones_historial` |
| `Escalar - Agregar Label` | cortaba la cadena entera, así que **tampoco se creaba la nota privada**: el escalado desaparecía |
| `Escalar - Nota Privada` | el equipo nunca veía el motivo |

Las tres salidas ahora van a un `Stop and Error` con mensaje propio, que marca la
ejecución como fallida y dispara `Errores - Avisar a la app` → notificación push.

### 6. El cliente podía inyectar datos "confirmados por el equipo"
El texto del cliente y los bloques internos (`[Dato interno confirmado por el equipo: ...]`)
se concatenan en el mismo mensaje de usuario, y la regla 4 del system prompt dice
textualmente "usá esa información tal cual, no la cuestiones ni la cambies". Un cliente
que escribiera ese bloque a mano tenía al bot afirmando lo que él quisiera.

`Code in JavaScript1` ahora rompe el corchete de apertura de `[Dato interno` y
`[Nota interna` en el texto del cliente, antes de que llegue a ningún prompt.

### 7. Podía afirmar compatibilidad de un modelo que el cliente nunca dijo
`¿Datos Tecnicos Suficientes?` pasa con **solo el kit** (`modelo || kit`), y en ese caso
`Preparar Contexto Encontrado` le pasaba al agente literalmente
`Modelo:  | Kit: X | Compatible: SI` — un modelo vacío presentado como dato verificado.

Ahora, sin modelo, el bloque omite el campo y agrega una advertencia explícita al agente
de que ese dato **no** está confirmado para el modelo del cliente y que pida el modelo
antes de confirmar. Aplicado en la rama simple y en la Multi.

> Esto tapa el síntoma. La causa estaba en `rm_modelo_ok`, y se corrigió: ver punto 12.

### 8. Ruteo roto después del saludo de un kit
`¿Seguimiento Kit Tiene Dato?` mandaba el caso `SIN_DATO` directo a la rama **técnica**,
salteando el clasificador. Como la marca `kit_saludo:` dura 30 días, un cliente que
recibió el saludo de un kit y después preguntaba "¿dónde están ubicados?" nunca se
clasificaba como `INFO_NEGOCIO`: iba a extracción técnica, salía con modelo y kit vacíos
y terminaba escalado a un humano como consulta técnica — teniendo la ubicación cargada
en `info_negocio`. Ahora `SIN_DATO` vuelve al `Clasificador Intento`.

### 9. Los 14 nodos Redis no tenían reintentos
El resto del workflow tiene reintentos en 62 nodos, pero ninguno de Redis. Un hipo de
Redis en un `Marcar Auto-Eco` deja al bot autopausado 30 días. Los 21 nodos Redis quedaron
con 3 reintentos cada 1s.

### 10. Los precios perdían el separador de miles
En `devuelve outputs`, el paso que borra los puntos corría **después** de restaurar los
decimales protegidos, así que los borraba igual: `$1.500` salía como `$1500` y
`2.5 litros` como `25 litros`. Se invirtió el orden. De paso se protegieron las
abreviaturas frecuentes (`Av.`, `Sr.`, `Dr.`, `aprox.`, `etc.`), que partían el mensaje
en dos: "Estamos en Av. 9 de Julio" salía como "Estamos en Av" + "9 de Julio".

### 11. Clientes sin teléfono compartían el mismo buffer
Todo el agrupado por ráfaga usa `sender.phone_number` como key de Redis. Si viene vacío
(canal sin teléfono, contacto sin número cargado), **todos** esos clientes comparten la
misma lista y se les mezclan los mensajes entre conversaciones. Ahora cae a
`conv-<conversation_id>`. Para los contactos con teléfono no cambia nada, así que el
historial existente se mantiene.

### 12. El matching traía datos de otra moto y de otro producto

Se confirmó contra la base y se corrigió. Detalle completo en `fix-matching.sql`; la
definición anterior de `rm_modelo_ok` está en el historial de git de
`conocimiento-libre.sql`, que es de donde salen las funciones.

**a) `rm_modelo_ok` daba `true` cuando el cliente no decía el modelo.** `rm_tokens('')`
devuelve NULL, y la función tenía `OR rm_tokens(consulta) IS NULL`, así que una consulta
sin modelo matcheaba cualquier fila. Verificado con los datos reales: preguntar "¿el kit
120 sirve?" sin decir la moto traía la compatibilidad de la `wave nf`. **Aplicado en la
base el 2026-08-06.**

**b) `rm_score` es asimétrico** — mide qué fracción de los tokens *de la consulta* aparece
en el dato guardado, así que una consulta genérica gana con puntaje perfecto:
`rm_score('cadena de arrastre titan 150', 'cadena')` = **1.000**. Con `precios_stock`
todavía vacía no pegaba, pero apenas se carguen precios "¿cuánto sale la cadena?" iba a
devolver el precio de la primera cadena cargada. No se tocó `rm_score` (sus umbrales están
calibrados): se agregó la condición inversa en las 8 búsquedas sobre tablas estructuradas.

**c) `conocimiento_libre` con umbral 0.6 alcanzaba con los tokens del modelo.** Apareció al
verificar (b) contra los datos reales: la consulta "kit 120 para titan 150" daba 0.667
contra la fila *"titan 150 Cubiertas delanteras y traseras 18"* y devolvía la respuesta
sobre cubiertas de $110.000 como dato confirmado. Subido a 0.75.

> Si el bot empieza a escalar de más, el número a bajar es el 0.75 de (c) — está 6 veces
> en el workflow, siempre como `>= 0.75` sobre `k.pregunta`.

---

## Lo que no pude cerrar

### 1. `/bot on` se lo come el cliente
Si un agente lo escribe como mensaje normal, sale por WhatsApp. Solo queda invisible si lo
manda como **nota privada** (el workflow no distingue `private`, así que funciona igual).
Vale la pena que el equipo lo sepa. Tampoco hay `/bot off` por conversación: no lo agregué
porque es funcionalidad nueva, no una corrección.

### 2. `CHATWOOT_BOT_USER_ID` es el punto único de falla del on/off
Ya está anotado en la sticky del workflow. `Config Chatwoot` tiene `chatwoot_bot_user_id: 2`
hardcodeado y la app tiene que enviar con ese mismo usuario. Si no coinciden, el bot lee
sus propias respuestas como humanas y se pausa 30 días. Conviene verificar contra Chatwoot
qué usuario es el 2 y con cuál está enviando la app.

---

## Dos cosas que reporté mal

Quedan escritas para que no se busquen de nuevo. Las dos salieron de auditar con una copia
local del repo que estaba **6 commits atrás de `origin/main`**, sin verificarlo antes.

**"Nada de la capa nueva está versionado" — falso.** `bot-onoff.sql`,
`app/api/chatwoot/enviar/route.ts` y las funciones `rm_*` (dentro de `conocimiento-libre.sql`)
estaban versionados desde `28be5bf` y `ee3dac5`. Lo único realmente sin versionar eran los
7 nodos de "Seguimiento Kit" en n8n. Por eso se borraron `funciones-rm.sql` y
`exportar-funciones-rm.sql`, que duplicaban `conocimiento-libre.sql`.

**"La cola sale igual aunque un humano ya haya resuelto la conversación" — falso.**
`lib/chatwoot-cola.ts` ya llama a `humanoRespondioDespues()` antes de mandar cada fila, y
descarta la conversación entera con motivo si alguien del equipo contestó después de que se
encoló. Resuelto de forma más robusta que lo que yo proponía: consulta los mensajes reales
de Chatwoot (filtrando `private`, `sender.type` y el `botUserId`) en vez de mirar
`bot_pausado` en Redis, que puede haber expirado.

---

## No tocado a propósito

- **`Chequear Bot Pausado` corre después de transcribir el audio y del agrupado**: se paga
  Whisper y se esperan los 15s aunque el bot esté pausado en esa conversación. Moverlo
  antes implica reestructurar el pipeline de entrada; es costo, no un defecto de lógica.
- **`If` e `incoming?1` chequean exactamente lo mismo** (`body.message_type === 'incoming'`).
  Redundante pero inofensivo.
- **Las ramas false de `¿Hay Encontrados? (Multi)` y `¿Hay Pendientes? (Multi)`** están sin
  conectar. El caso solo se da si el loop no produce ningún resultado, que hoy no puede pasar.
