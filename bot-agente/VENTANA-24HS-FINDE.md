# Ventana de 24hs de Meta los fines de semana

> Estado: **análisis y plan, sin implementar**. Conversación del 11/09/2026.
> Este documento es autocontenido a propósito: la memoria de Claude vive en la
> máquina de Martín (`~/.claude/projects/...`) y **no viaja** a otra compu. Lo
> único que viaja es esto, versionado en el repo.

---

## 1. El problema

El local atiende **sábado hasta las 13hs** y vuelve a abrir el **lunes**. A esa hora
el bot se apaga (horario automático) porque no hay nadie controlando la charla.

Durante ese silencio, a varios mensajes se les cumplen las **24hs de la ventana de
servicio de WhatsApp**. El lunes, cuando el bot se prende, WhatsApp ya rechaza el
texto libre y **perdemos la posibilidad de responder**.

## 2. Cómo está hoy el código

Ya existe la detección, con margen de 23hs:

* `lib/bot-agente-tiempo-real.ts` → `VENTANA_24HS_MARGEN_MS = 23 * 60 * 60 * 1000`
  * Fuera de horario el motor **no manda nada**: deja la fila en
    `bot_agente_entrantes_pendientes` con el detalle
    `"Local cerrado: se responde consolidado al abrir"`.
  * En el barrido, si la ventana venció, registra el turno con
    `resultadoEnvio: "salteado"` y detalle
    `"Barrido: ventana de 24hs de WhatsApp cerrada, requiere plantilla o que el cliente vuelva a escribir"`.
* `lib/chatwoot-cola.ts` → mismo margen; descarta la fila con motivo
  `"Ventana de 24hs de WhatsApp cerrada..."`.
  * Hallado el 06/09 reprocesando la cola vieja: **14 de 18 mensajes fallaron por esto**.

O sea: el finde hoy es **silencio total** hasta el lunes.

## 3. El dato que define todo

**La ventana solo la reabre un mensaje ENTRANTE del cliente.** Nada que mandemos
nosotros la extiende.

→ El bot callado el finde es, literalmente, la causa de que la ventana muera.
→ Cada ida y vuelta con el cliente **renueva 24hs**.

### La cuenta con el horario real

| Cuándo escribe el cliente | Vence | ¿Llegamos el lunes 9hs? |
|---|---|---|
| Sáb 13:05 | Dom 13:05 | **No** |
| Sáb 20:00 | Dom 20:00 | **No** |
| Dom 08:00 | Lun 08:00 | **No, por poco** |
| Dom 14:00 | Lun 14:00 | Sí |
| Dom 21:00 | Lun 21:00 | Sí |

**La franja que se pierde es sábado 13hs → domingo ~9hs**, que es justo el pico del
finde. Lo del domingo a la tarde se salva solo.

---

## 4. Las opciones sobre la mesa

### Opción 1 — "Último llamado" antes de que venza  *(costo cero, código que ya existe)*

Un barrido que mire `bot_agente_entrantes_pendientes` (ya tiene `ultimo_mensaje_en`)
y, cuando a una conversación le faltan ~2-3hs para las 24hs, **conteste mientras
todavía es gratis**, en vez de esperar al lunes.

Es el mismo `atenderEntrantesPendientes()` de `lib/bot-agente-tiempo-real.ts` con
**otro gate de horario**: hoy se auto-protege y no hace nada fuera de horario (salvo
`forzar`); habría que dejar pasar el caso "ventana por vencer".

El mensaje del sábado a la tarde se atiende el domingo al mediodía y no se pierde.

**Es la de mejor relación recuperación/riesgo.**

### Opción 2 — El bot atiende el finde en "modo guardia"  *(costo cero)*

El miedo es "no hay nadie controlando", pero el bot **ya escala solo** lo que no sabe.
Se puede acotar más: el finde contesta **solo lo determinístico** (precio, envío,
ficha del kit, compatibilidad con fila exacta en BD) y para todo lo demás manda un
*"esto te lo confirmo el lunes a primera hora"* + escalado.

Beneficio extra: cada ida y vuelta **renueva las 24hs**, así que la mayoría llega
viva al lunes sin hacer nada más.

Complemento: **push al celular** por cada escalado (ya hay app Android), así
"nadie controlando" pasa a ser "mirás 2 minutos".

### Opción 3 — Acuse de recibo fuera de horario  *(lo más chico)*

Un solo mensaje fuera de horario: *"te leímos, abrimos el lunes 9hs"*.

No renueva la ventana por sí mismo, pero **casi siempre dispara un "dale, gracias"
del cliente — y ese sí la renueva 24hs**. Es la palanca más barata que hay.

### Opción 4 — Plantilla de reapertura el lunes  *(red de seguridad, cuesta centavos)*

Para lo que igual venció: plantilla aprobada por Meta tipo
*"Hola, nos escribiste el finde por {{kit}}. Ya estamos abiertos, seguimos?"*.
El cliente responde → ventana abierta → el bot sigue normal. Chatwoot soporta enviar
templates.

**Advertencias honestas:**
* La aprobación y la **categoría** las decide Meta.
* Si la clasifica como *marketing* (y no *utility*), cuesta más y puede requerir opt-in.
* Hay que darla de alta y probar; no está verificado en nuestra cuenta.

---

## 5. Recomendación acordada

1. **Medir primero.** Los turnos con `resultadoEnvio: "salteado"` por ventana cerrada
   ya quedan registrados en `bot_agente_turnos_reales`. Sacar cuántas conversaciones
   por finde se están perdiendo realmente, y decidir con el número sobre la mesa.
2. Después **Opción 1 + 3** (y eventualmente 2): todo código nuestro, cero costo de
   Meta. Con eso la mayoría de los mensajes del finde ni llegan a vencer.
3. La **Opción 4 (plantilla)** queda como red para el resto, que ya debería ser poco.

## 6. Próximo paso concreto

Correr la medición sobre `bot_agente_turnos_reales` filtrando por el detalle de
ventana cerrada, agrupado por fin de semana. **Nada de esto está implementado
todavía.**

## 7. Archivos que hay que tocar

* `lib/bot-agente-tiempo-real.ts` — `atenderEntrantesPendientes()`, gate de horario,
  `VENTANA_24HS_MARGEN_MS`.
* `lib/chatwoot-cola.ts` — mismo margen de 23hs.
* `app/admin/chatwoot/horario/` — panel de horario automático, por si el "modo guardia"
  necesita configuración propia.
* `scripts/atender-pendientes.ts` — válvula manual, sirve para probar sin esperar al finde.
