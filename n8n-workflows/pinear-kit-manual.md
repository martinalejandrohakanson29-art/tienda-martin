# Workflow n8n: "Utilidad - Pinear Kit Manual"

**Creado y activo** (id `XYWqKHTCMvTcBBoV`, proyecto personal de Martín), vía la
API de n8n con `APIKEY_N8N`. Clon chico de **"Utilidad - Limpiar Pin de Prueba"**.

Lo usa el buscador **"Enviar info de kit"** del panel `/admin/chatwoot/chats-vivo`
(`forzarEnvioKitChatVivo` en `app/actions/chats-vivo.ts`).

## Por qué existe

Cuando desde el panel se fuerza el envío de un kit a una conversación, la app:

1. prende el bot en esa charla (`/bot on` como nota privada),
2. manda el mensaje predefinido del kit con identidad del Bot,
3. manda la foto del kit,
4. **pinea el kit en Redis** para que el bot siga la conversación tratándolo como
   "kit confiado" — igual que si el cliente hubiera entrado por publicidad.

El paso 4 necesita escribir `kit_pineado:{telefono}` en el Redis del bot, y la app
**no puede hablarle a ese Redis directo** (firewall de IP — ver
`project-redis-app-conectividad` en memoria). Este workflow hace la escritura en
nombre de la app. Si se cae, los pasos 1-3 siguen andando y el pin queda como
aviso silencioso en consola.

## Estructura

`Webhook (POST pinear-kit-manual)` → `Token OK?` (IF `$json.query.token` ==
`$env.CHATWOOT_WEBHOOK_TOKEN`, si no → `Responder No Autorizado` 401) →
`Preparar Pin` (Code) → `Pinear Kit` (Redis) → `Responder Resultado` (Code) →
`Responder OK`.

- **Body que manda la app:**
  ```json
  {
    "telefono": "+5493513784909",   // o "conv-2411" si el contacto no tiene teléfono
    "conversationId": 2411,
    "kit_id": 1,
    "kit_nombre": "Kit 120 para 110"
  }
  ```
  `telefono` ya viene con `+` o con prefijo `conv-`: es el sufijo exacto de la
  clave (mismo criterio que el nodo `Marcar Kit Pineado` de "Respuestas chatwoot
  2.0": `sender.phone_number || ('conv-' + conversation_id)`).

- **`Preparar Pin`** arma `key = kit_pineado:{telefono}` y
  `value = JSON.stringify({ kit_id, kit_nombre })`.

- **`Pinear Kit`** (Redis, credencial `ZUlkjSz8R2bmmO2f` "Redis account 2"):
  operation `set`, `expire: true`, `ttl: 345600` (4 días — mismo TTL que el pin
  automático). `retryOnFail`, `maxTries: 2`.

- **`Responder OK`**: `{ "success": true, "key": "kit_pineado:..." }`.

## Probado 2026-08-28

- `?token=WRONG` → `401 {"error":"No autorizado"}` ✓
- token válido → setea la clave, `{"success":true,"key":"kit_pineado:conv-prueba-pin-tmp"}` ✓
- ejecución en n8n: nodo Redis `set` OK, sin error ✓
- End-to-end contra la conversación de prueba (conv `2411`, `+5493513784909`,
  Kit 1): mensaje + foto llegaron a Chatwoot, pin `kit_pineado:+5493513784909`
  seteado. Pin de prueba limpiado después con `limpiar-pin-prueba`. ✓
  (El paso `/bot on` usa `CHATWOOT_ADMIN_API_TOKEN`, que no está en el `.env`
  local — no se pudo probar desde acá, pero es el mismo `enviarNotaPrivadaChatwoot`
  que ya usa el switch del bot en producción.)
