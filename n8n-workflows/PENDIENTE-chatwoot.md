# Pendiente: pasar el bot de WhatsApp del simulador a Chatwoot real

Estado al 2026-08-05. El workflow (`workflow_mateo (3).json`) está **importado, activo y
verificado** en n8n, pero apuntando al **simulador** de `/admin/chatwoot/prueba`, no a Chatwoot.

## Ya está hecho y verificado

- Transcripción de audio (probada con una nota de voz real).
- Agrupado de mensajes por ráfaga: 21 mensajes de 4 clientes simultáneos → una respuesta por
  ráfaga. Se reproduce con `node scripts/carga-chatwoot.mjs --correr`.
- Autenticación del webhook (token en la query, validado contra `$env.CHATWOOT_WEBHOOK_TOKEN`).
- Reintentos en 62 nodos + workflow de errores → `/api/n8n/error` → notificación con push.
  Probado forzando un fallo real.
- Las 7 tablas del bot vaciadas: arranca sin conocimiento previo, aprende de lo que responda
  el equipo.

## Lo que falta (3 datos)

### 1. Token de Chatwoot

- **De dónde**: entrar a Chatwoot **con el usuario del bot** (el token es por usuario; no está en
  la lista de agentes). Foto de perfil → Profile Settings → Access Token.
  Para entrar como el bot hace falta su contraseña, que llega por el mail de invitación. Si el mail
  no existe, recrear el agente con uno real (sirve el truco `tumail+bot@gmail.com`).
  Alternativa rápida: usar el token propio; solo cambia a nombre de quién figuran las respuestas.
- **Dónde va**: Easypanel → servicio **n8n** → Environment → `CHATWOOT_API_TOKEN`
  (hoy tiene `mock-token-prueba`). Reiniciar n8n.
- **No olvidar**: el agente bot tiene que ser **miembro del inbox de WhatsApp**
  (Settings → Inboxes → el inbox → Collaborators). Sin eso, Chatwoot no lo deja responder.

### 2. Dirección de la API

- **Qué es**: la URL con la que se entra a Chatwoot + `/api/v1`, **sin barra final**.
  Ej: `https://chat.revolucionmotos.tech/api/v1`
- **Dónde va**: n8n → workflow_mateo → nodo **`Config Chatwoot`** → campo `chatwoot_api`.
  Es el **único** lugar del workflow donde está escrita la dirección; los 10 nodos HTTP leen de ahí.

### 3. Webhook en Chatwoot

- Chatwoot → Settings → Integrations → Webhooks → Add new webhook.
- URL: `https://n8n.revolucionmotos.tech/webhook/chatwoot-mensaje?token=EL_TOKEN`
  donde `EL_TOKEN` es el valor de la variable **`CHATWOOT_WEBHOOK_TOKEN`** de Easypanel
  (está en n8n y en la app, con el mismo valor). No se escribe acá a propósito: este archivo
  se versiona en git.
- Eventos: solo **Message created**.

## Qué mirar el primer día

1. **Punto más probable de falla**: el workflow arma las URLs con `sender.account.id` del payload.
   El simulador lo manda; no está confirmado que el Chatwoot real lo haga igual. Si al primer
   mensaje real el bot no responde, revisar esto primero — el arreglo es usar `body.account.id`
   como alternativa. Se diagnostica rápido con el MCP de n8n (`execute_workflow` devuelve el json
   de entrada y salida de cada nodo).
2. **El bot puede pausarse solo**: cuando responde, Chatwoot le avisa de su propio mensaje y el
   workflow lo ignora por el chequeo de auto-eco (`bot_msg:{conversation_id}` en Redis). Si ese
   aviso llegara después del TTL de esa clave, lo tomaría como "contestó un humano" y se pausaría
   **30 días** en esa conversación. Se reactiva escribiendo `/bot on` en el chat. Si pasa seguido,
   subir el TTL de los nodos `Marcar Auto-Eco - *`.
3. **Cuando un humano del equipo responde, el bot se calla 30 días** en esa conversación. Es a
   propósito, pero el equipo tiene que saberlo.
4. **Todo lo que responda el equipo se vuelve conocimiento permanente.** Con las tablas vacías,
   las primeras respuestas pesan más que nunca.

## Después de migrar

Correr `node scripts/carga-chatwoot.mjs --correr` de nuevo. Ojo: el script le pega al simulador,
así que una vez migrado a Chatwoot real deja de servir tal cual — sirve como referencia del
escenario, no como test automático.

## Dimensionamiento (cuando haya tráfico real)

`N8N_CONCURRENCY_PRODUCTION_LIMIT` está sin tope. El techo práctico va a ser el rate limit de
DeepSeek y el pool de Postgres, no n8n. Se mide con tráfico, no se decide antes.
