# Botón ON/OFF del bot + cola de respuestas

Estado al 2026-08-06. Implementado, **falta probar en producción** (ver "Cómo probarlo").

## La idea

El bot no se apaga: se difiere. Con el local cerrado el workflow sigue haciendo todo el trabajo
pesado en el momento en que llega el mensaje —transcribir el audio, clasificar la intención,
extraer los datos, buscar en la base de conocimiento, generar el texto con el LLM y guardar el
turno en `conversaciones_historial`—. Lo único que se difiere es el mensaje que ve el cliente.

Al prender, no se reprocesa nada: se despacha una cola de respuestas que ya están escritas.

## Cómo funciona

```
Chatwoot ──► n8n (workflow_mateo, igual que siempre)
                └─► POST https://revolucionmotos.tech/api/chatwoot/enviar
                        │
                        ├── bot_estado.encendido = true  ──► POST a Chatwoot (pasamanos)
                        └── bot_estado.encendido = false ──► INSERT respuestas_pendientes
                                                                  │
                        /admin/chatwoot  [Prender el bot] ────────┘
                                └─► despacha la cola escalonada
```

- **Estado del bot**: tabla `bot_estado` (una fila, id = 1). Se prende y apaga desde
  `/admin/chatwoot`.
- **Cola**: tabla `respuestas_pendientes`. Se mira, se edita y se descarta desde
  `/admin/chatwoot/cola`.
- **Despacho escalonado**: 2 s entre las partes de una misma respuesta (igual que el `Wait2` del
  workflow) y 6 s entre conversaciones distintas. Treinta WhatsApps en el mismo segundo se leen
  como un bot. Se ajusta con `BOT_COLA_ESPERA_PARTE_MS` y `BOT_COLA_ESPERA_CONVERSACION_MS`.
- **Los escalados al equipo salen igual** con el bot apagado (nota privada + etiqueta): son
  internos, el cliente no los ve, y así al abrir el local ya están las conversaciones marcadas.

## Qué se tocó en el workflow

Seis nodos httpRequest —los únicos que le hablan al cliente— pasaron de pegarle a Chatwoot a
pegarle a `{app_url}/api/chatwoot/enviar`:

`1ª Parte Respuesta1`, `Responder Cliente - Aprendizaje Tecnico`, `... Negocio`, `... Precio`,
`Enviar Saludo Kit`, `Enviar Pregunta Ambigua`.

No se agregó ni se reconectó ningún nodo del flujo: solo cambió la URL, el header de auth y el
body de esos seis. En `Config Chatwoot` se sumó el campo `app_url`, y hay una nota nueva
(`Nota - Boton ON/OFF`) al lado del loop de respuesta.

`Escalar - Nota Privada` y `Escalar - Agregar Label` quedaron intactos, apuntando a Chatwoot.

## Dos cosas que ya estaban resueltas en el workflow

Vale saberlas porque son las que hacen que diferir el envío sea seguro:

1. **El historial se guarda al generar, no al enviar.** `Guardar Turno Conversacion` corre justo
   después de `AI Agent2`. Si el cliente escribe de nuevo a las 3 am, el LLM que arma la segunda
   respuesta ya ve la primera como parte de la conversación aunque todavía no haya salido.
2. **El eco del propio bot no lo pausa, sin importar cuánto tarde en salir.**
   `¿Es respuesta de mi equipo?` compara `sender.id` contra `chatwoot_bot_user_id` (2), no contra
   una marca en Redis con TTL. Por eso **la cola tiene que salir con el token del usuario Bot**:
   si se despacha con el token de otro agente, el propio workflow lo lee como "contestó un humano"
   y se pausa 30 días en esa conversación.

## Antes de importar el workflow

1. Correr **`bot-onoff.sql`** en el Postgres del bot (crea `bot_estado` y `respuestas_pendientes`).
   Si se importa el workflow sin correr el SQL, el bot no puede responder: la app falla al leer el
   estado y devuelve 500.
2. En **n8n** (Easypanel → servicio n8n → Environment): `N8N_SECRET_TOKEN`, con el mismo valor que
   tiene la app. Si falta, `/api/chatwoot/enviar` devuelve 401 y el bot queda mudo.
3. En **la app** (Easypanel → servicio de la web → Environment):
   - `CHATWOOT_API_URL` = `https://chat.revolucionmotos.tech/api/v1` (si no está, la app usa ese
     valor igual por defecto)
   - `CHATWOOT_API_TOKEN` = el mismo token del usuario **Bot** que ya usa n8n
   - `CHATWOOT_BOT_USER_ID` = `2` (por defecto ya vale 2)

## Cómo probarlo

**1. Que la app responda a n8n** (seguro: con el bot apagado no le llega nada a ningún cliente).
Apagar el bot desde `/admin/chatwoot` y desde una terminal:

```bash
curl -X POST https://revolucionmotos.tech/api/chatwoot/enviar \
  -H "Authorization: Bearer $N8N_SECRET_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"conversation_id": 999999, "content": "prueba de cola", "origen": "respuesta"}'
```

Tiene que devolver `{"enviado":false,"encolado":true,"id":...}` y aparecer en
`/admin/chatwoot/cola`. Descartarla desde ahí (si se despacha, Chatwoot va a rechazar la
conversación 999999 y la fila queda en "Falló", que también sirve como prueba).

**2. De punta a punta.** Con el bot apagado, mandarse un WhatsApp al número del local. No tiene
que contestar nada, pero la respuesta tiene que aparecer en la cola en menos de un minuto. Prender
el bot y verificar que llegue el mensaje.

**3. El descarte por respuesta humana.** Con el bot apagado, mandar un mensaje, contestarle a mano
desde Chatwoot, y después prender el bot: la respuesta pre-generada tiene que quedar
**Descartada**, no salir.

## Horario automático (agregado 2026-08-12)

`/admin/chatwoot/horario` agrega un modo automático que prende y apaga el bot solo según un
horario semanal (7 días, incluyendo sábado y domingo por separado). Schema en `bot-horario.sql`:
`bot_estado.horario_automatico` (bandera) + tabla `bot_horario` (`dia_semana` 0=domingo..6=sábado,
`activo`, `abre_minutos`/`cierra_minutos` en hora Argentina fija UTC-3).

**Con el automático activo, el horario manda solo**: el botón manual de `/admin/chatwoot` queda
deshabilitado y `alternarBot` tira error si se lo llama igual. Para tomar control manual hay que
apagar el automático primero desde `/admin/chatwoot/horario`.

**No hay cron aparte.** `sincronizarEstadoBot()` (`lib/chatwoot-cola.ts`) se llama desde los mismos
dos puntos que ya leían `bot_estado` —cada mensaje entrante por `/api/chatwoot/enviar` y cada carga
de `/admin/chatwoot`— y corrige `bot_estado.encendido` ahí mismo si el horario dice algo distinto,
disparando el despacho de la cola si pasó a encendido. Sin mensajes ni nadie mirando la pantalla no
se reconcilia solo, pero tampoco hay a quién atender hasta que llegue el primer evento real.

## Qué mirar el primer día

- **Respuestas viejas con precio viejo.** Una respuesta generada a las 2 am sale a las 9 con el
  precio de las 2 am. Por eso la cola se puede editar antes de prender. Si esto pasa seguido, el
  paso siguiente es guardar junto a la respuesta los datos que usó y re-chequearlos al despachar.
- **Filas trabadas en "Saliendo".** Si el servidor de la web se reinicia justo mientras despacha,
  la fila que estaba en curso queda en `enviando` y **no se manda sola de nuevo** (preferimos que
  el cliente no reciba dos veces lo mismo). Se ve en la cola con el botón "Volver a encolar".
- **El despacho corre en el proceso de la web.** Si el contenedor se reinicia en el medio, lo que
  quedó pendiente sale con el siguiente "Prender el bot" o con "Enviar ahora".
