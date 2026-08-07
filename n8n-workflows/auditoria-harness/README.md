# Harness de la auditoría del bot

Herramientas usadas para correr `AUDITORIA-ESCENARIOS-COMPLETO.md` contra
producción real, sin depender de que alguien mande mensajes a mano.

## Setup

```
cd n8n-workflows/auditoria-harness
npm install pg
```

## Uso

```
export WEBHOOK_TOKEN='...'   # CHATWOOT_WEBHOOK_TOKEN de n8n
export N8N_KEY='...'         # API key de n8n (Settings → API)
export DB_URL='postgres://user:pass@host:puerto/db'

# 1. Mandar un mensaje sintético con forma de Chatwoot
node send.js '{"content":"hola, el kit X anda en la Y?","senderType":"contact","msgId":123456}'

# 2. Esperar la ejecución resultante y ver el resumen (nodo por nodo, clasificación, respuesta)
node wait_exec.js 123456 "<sentAt de la respuesta anterior>" 60000

# 3. Verificar/limpiar contra la base real
node query.js "SELECT * FROM compatibilidades WHERE fuente='auditoria-test';"
```

`senderType` puede ser `contact` (cliente real), `team` (alguien del
equipo respondiendo, `sender.id=1`) o `bot` (el bot mismo, `sender.id=2`).
Ver el comentario arriba de cada archivo para el resto de los overrides
(`private`, `event`, `convId`, `phone`, `attachments`, etc.).

## Reglas de higiene (aprendidas a los golpes)

- **Marcar todo lo sintético** con un prefijo tipo `[auditoria-XX]` en el
  contenido, o con `fuente='auditoria-test'` en las tablas de conocimiento
  (`compatibilidades`, `precios_stock`, `info_negocio`) — para poder
  encontrarlo y borrarlo después sin tocar datos reales.
- **Limpiar por `id` exacto, no por patrón de texto amplio.** Un `DELETE
  ... WHERE content ILIKE '%algo%'` puede borrar una punta de un
  intercambio (la pregunta del cliente o la respuesta del bot) y dejar la
  otra huérfana en `conversaciones_historial` — eso genera exactamente el
  mismo síntoma que el bug real que arreglamos el 2026-08-07 (el agente
  genérico ve una pregunta sin respuesta y asume que sigue sin resolver).
  Buscar primero las dos puntas del intercambio, confirmar los `id`, recién
  ahí borrar.
- **Reusar una conversación de prueba real** (hoy: conv `1`,
  `+5493513784909`) en vez de inventar IDs nuevos — un conversation_id que
  no existe en Chatwoot hace fallar el envío real cuando el workflow le
  pega a `/api/chatwoot/enviar`.
- Después de un tramo largo de pruebas, la conversación acumula su propio
  historial y el LLM puede arrastrar contexto de pruebas anteriores (un
  modelo de moto mencionado hace 10 mensajes, por ejemplo). Si un resultado
  se ve raro, primero revisar `Formatear Historial (...)` de esa ejecución
  antes de asumir que es un bug nuevo.
