# Migración a Chatwoot real: hecha, falta probar con tráfico real

> **ANTES de importar la versión actual del workflow: correr `conocimiento-libre.sql` y
> `bot-onoff.sql` en la base.**
> `conocimiento-libre.sql` crea la tabla `conocimiento_libre` y las funciones `rm_tokens` /
> `rm_score` / `rm_modelo_ok`, de las que ahora dependen las 6 búsquedas del bot. Si se importa el
> workflow sin correr el SQL, toda consulta a la base de conocimiento falla.
> `bot-onoff.sql` crea `bot_estado` y `respuestas_pendientes`, de las que ahora depende **todo
> mensaje al cliente** (ver `BOTON-ONOFF.md`): sin esas tablas el bot queda mudo.
> El orden inverso (SQL primero, workflow después) es seguro: el workflow viejo no usa nada de eso.

> **2026-08-06 — leer también `AUDITORIA-2026-08-06.md`.** El archivo del workflow pasó a
> llamarse `workflow_mateo.json` (el viejo `workflow_mateo (3).json` se borró: le faltaba el
> bloque "Seguimiento Kit" que se había hecho en la UI y nunca se exportó). Trae 13 correcciones
> sin importar todavía. El punto 2 de "Qué mirar el primer día" ya está resuelto.

Estado al 2026-08-05. El workflow (entonces `workflow_mateo (3).json`) está **importado, activo, y
apuntando a Chatwoot real** (no al simulador). Los 3 datos pendientes se resolvieron y se
confirmaron por API contra la instancia real de n8n. Falta el primer mensaje real de un cliente
para validar de punta a punta.

**Historial de esta migración (2026-08-05, tarde):** apareció un workflow viejo (`chatwoot (1).json`,
ya borrado del repo) que funcionó contra la instancia real. Tenía los 3 datos pendientes escritos
en texto plano — se verificaron contra la API real (llamadas de solo lectura) y se borró el archivo
del disco antes de que llegara a versionarse. Quedan los hallazgos, sin los valores:

## Ya está hecho y verificado

- Transcripción de audio (probada con una nota de voz real).
- Agrupado de mensajes por ráfaga: 21 mensajes de 4 clientes simultáneos → una respuesta por
  ráfaga. Se reproduce con `node scripts/carga-chatwoot.mjs --correr`.
- Autenticación del webhook (token en la query, validado contra `$env.CHATWOOT_WEBHOOK_TOKEN`).
- Reintentos en 62 nodos + workflow de errores → `/api/n8n/error` → notificación con push.
  Probado forzando un fallo real.
- Las 7 tablas del bot vaciadas: arranca sin conocimiento previo, aprende de lo que responda
  el equipo.

## Los 3 datos pendientes — los tres cerrados

### 1. Token de Chatwoot — cargado

- Se usa el token del administrador (`martinalejandrohakanson29@gmail.com`), verificado activo
  con `GET /api/v1/profile` (200 OK). Las respuestas del bot figuran a su nombre; se puede migrar
  después a un agente dedicado sin tocar el workflow (solo cambiando el env var).
- Cargado en Easypanel → servicio **n8n** → Environment → `CHATWOOT_API_TOKEN`, y n8n reiniciado.
  El valor no se escribe en este archivo porque se versiona en git.

### 2. Dirección de la API — cargada

- `https://chat.revolucionmotos.tech/api/v1`, confirmada real y activa.
- Confirmado por API de n8n (`get_workflow_details`) que el nodo **`Config Chatwoot`** de la
  instancia real ya tiene este valor en el campo `chatwoot_api` (antes tenía la URL del
  simulador, `.../api/chatwoot/mock`). El JSON del repo (`workflow_mateo (3).json`) también
  quedó actualizado para que coincidan.
- De paso quedó confirmado `account_id: 1`.

### 3. Webhook en Chatwoot — corregido

- Ya existía un webhook (id 1, "N8N HOSTINGER") de cuando se probó el workflow viejo, apuntando
  a `https://n8n.revolucionmotos.tech/webhook/chatwoot-mensaje` pero sin el token de auth y con
  un evento de más (`conversation_created`).
- Se corrigió por API (`PATCH /api/v1/accounts/1/webhooks/1`): ahora la URL lleva
  `?token=...` (el valor de `CHATWOOT_WEBHOOK_TOKEN`) y las suscripciones quedaron solo en
  `message_created`.

## Qué mirar el primer día

1. **Punto que ya no preocupa tanto**: el workflow arma las URLs con `sender.account.id` del
   payload. Se dudaba si el Chatwoot real lo mandaba igual que el simulador. El payload real
   capturado por el workflow viejo confirma que sí viene (`body.sender.account.id: 1`, y también
   `body.account.id: 1` como alternativa por si hiciera falta). Si aun así al primer mensaje real
   el bot no responde, revisar esto primero. Se diagnostica rápido con el MCP de n8n
   (`execute_workflow` devuelve el json de entrada y salida de cada nodo).
2. ~~**El bot puede pausarse solo**~~ — **resuelto el 2026-08-06** (ver auditoría, puntos 2 a 4).
   El chequeo de auto-eco comparaba el texto crudo del agente contra el ya transformado por
   `devuelve outputs`, así que fallaba en cuanto la respuesta tenía un `¿`. Ahora compara
   normalizado, se marca antes de enviar y el TTL es explícito (600s, era 60s implícito). El
   filtro primario sigue siendo `sender.id !== chatwoot_bot_user_id`. Se reactiva igual que
   antes, escribiendo `/bot on` en el chat — mejor como **nota privada**, si no lo ve el cliente.
3. **Cuando un humano del equipo responde, el bot se calla 30 días** en esa conversación. Es a
   propósito, pero el equipo tiene que saberlo.
4. **Todo lo que responda el equipo se vuelve conocimiento permanente.** Con las tablas vacías,
   las primeras respuestas pesan más que nunca.
5. **Vaciar las tablas dejó los kits a medias** (detectado el 2026-08-06). Un kit vive en
   `kits_publicidad` (el saludo) y en `precios_stock` (una fila por alias, `fuente =
   'admin-kit-{id}'`, que es lo que miran las búsquedas). El vaciado borró `precios_stock` y dejó
   `kits_publicidad`: el kit saludaba pero el bot no encontraba su precio ni su detalle y
   escalaba, mientras en `/admin/chatwoot/conocimiento` se veía cargado y completo. Se
   resincroniza guardando cada kit de nuevo. Chequeo rápido:
   `SELECT count(*) FROM precios_stock WHERE fuente LIKE 'admin-kit-%'`.

## Después de migrar

Correr `node scripts/carga-chatwoot.mjs --correr` de nuevo. Ojo: el script le pega al simulador,
así que una vez migrado a Chatwoot real deja de servir tal cual — sirve como referencia del
escenario, no como test automático.

## Dimensionamiento (cuando haya tráfico real)

`N8N_CONCURRENCY_PRODUCTION_LIMIT` está sin tope. El techo práctico va a ser el rate limit de
DeepSeek y el pool de Postgres, no n8n. Se mide con tráfico, no se decide antes.
