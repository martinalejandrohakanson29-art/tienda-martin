# Auditoría completa — escenarios a probar (workflow_mateo + app)

Lista de todo lo que habría que probar para confiar en el sistema de punta a punta:
desde que llega un mensaje de WhatsApp hasta que el cliente recibe (o no recibe,
correctamente) una respuesta, pasando por el aprendizaje del equipo y la cola de
la app. Pensada para ejecutarse por API, sin depender de que alguien mande
mensajes reales a mano.

## Cómo se ejecutaría (para cuando pasemos de lista a ejecución)

- **Disparo de cada escenario:** `POST` directo a
  `https://n8n.revolucionmotos.tech/webhook/chatwoot-mensaje?token=...` con un
  payload con la forma que manda Chatwoot (`message_type`, `content`, `sender`,
  `conversation`, `account`), variando el contenido según el escenario. No hace
  falta pasar por Chatwoot real para generar el estímulo.
- **Conversación de prueba:** usar una dedicada (ya existen `1`, `195` y `1719`
  usadas en pruebas previas) para no tocar clientes reales — los envíos de
  respuesta sí pegan contra Chatwoot real vía `/api/chatwoot/enviar`.
- **Verificación:** `GET /api/v1/executions/:id?includeData=true` de n8n
  (nodo por nodo: qué rama tomó, qué tardó, qué mandó) + leer los mensajes
  reales de esa conversación por la API de Chatwoot + para la sección D (cola
  de la app) hace falta ver `bot_estado` / `respuestas_pendientes`, que hoy
  solo soy capaz de inspeccionar si hay acceso a Postgres o si nos apoyamos en
  `/admin/chatwoot/cola` de la app.
- **Pendiente a resolver antes de ejecutar:** decidir si me das acceso directo
  a Postgres (para leer `preguntas_*_pendientes`, `compatibilidades`,
  `precios_stock`, `info_negocio`, `conocimiento_libre`, `respuestas_pendientes`,
  `bot_estado` y confirmar contra la base, no solo contra lo que contesta el
  bot) o si armamos endpoints de solo lectura para eso.

---

## A. Guardrails de entrada al webhook

1. Token correcto en la query → pasa.
2. Token ausente o incorrecto → falla cerrado, no procesa nada.
3. Evento distinto de `message_created` (ej. `conversation_created`) → se
   ignora, no dispara nada río abajo.
4. Nota privada del equipo → no debe convertirse en un envío al cliente en
   ningún punto del flujo.

## B. Ingesta y agrupado de mensajes entrantes

5. Ráfaga de 3-4 mensajes de texto seguidos del mismo cliente en pocos
   segundos → una sola respuesta que contempla todo el contenido, no una por
   mensaje.
6. Dos clientes distintos (números distintos) escribiendo en paralelo → cada
   conversación se procesa independiente, sin mezclar buffers.
7. Cliente/canal sin `phone_number` → cae al fallback `conv-<id>` y no
   comparte buffer con otro contacto sin teléfono (regresión del bug de
   buffers compartidos).
8. Nota de voz sola → transcribe bien y sigue el flujo normal.
9. Nota de voz + texto mezclados en la misma ráfaga → se combinan
   correctamente en `datos_finales2`.
10. Nota de voz con URL de audio caída (404) → reintentos en
    `HTTP Request2`/`Transcribe a recording1`, y si se agotan, `Stop and Error`
    dispara la alerta push (no se pierde en silencio).
11. Imagen, sticker o ubicación → cae en la rama "Otro" del switch
    `Tipo de Mensaje`, etiqueta y avisa a un humano (no se pierde en silencio,
    era el bug original que motivó ese fix).

> **Bug encontrado y arreglado el 2026-08-07:** el aviso al equipo salía
> bien, pero la ejecución terminaba en error igual: `Guardar Turno Cliente
> (Escalado)` siempre buscaba `$('datos_finales2')`, y esa rama es la única
> que nunca pasa por ahí. Cada imagen/sticker/ubicación disparaba una
> ejecución fallida (ruido para el workflow de errores). Arreglado dándole a
> `Preparar Escalado - Contenido` su propio `key`/`texto`, con fallback a
> `datos_finales2` solo si no vienen seteados. Verificado en producción real
> + regresión contra la rama técnica normal.
12. Verificar que `Wait3` (15s) y `Wait2` (2s) sigan resolviendo como segundos
    después del reimport de hoy (el `unit: seconds` explícito que se agregó).

## C. Pausado/reactivación del bot por conversación (Redis, `bot_pausado`)

13. El propio eco del bot (mismo texto que mandó) → no debe pausar el bot
    (`¿Es Auto-Eco?`).
14. Humano responde algo que **no** corresponde a ninguna pregunta pendiente
    → pausa 30 días (comportamiento esperado, es la señal de que alguien tomó
    la conversación a mano).
15. Humano responde una pregunta técnica/negocio/precio **pendiente** →
    **no** debe pausar el bot (es el bug que encontramos y arreglamos hoy —
    ejecutar este caso es la regresión más importante de toda la lista).
16. Lo mismo que 15 pero contestado como **nota privada** en vez de mensaje
    público → sigue sin pausar, y además el cliente no debe recibir nada de
    esa nota.
17. `/bot on` reactiva al instante y borra la key de Redis.
18. Mensaje del cliente mientras está pausado → silencio total del bot, sin
    error ni traza rara.
19. El cooldown de escalado (5 min) no debe interferir con el pausado real:
    son dos mecanismos distintos y no se deberían pisar.

> **Bug nuevo encontrado el 2026-08-07 probando el punto 14:** si existe
> **cualquier** pregunta pendiente (de cualquier categoría) en la
> conversación y el equipo responde algo que **no** la contesta con
> confianza, `¿Extraccion Confiable (Tecnica|Negocio|Precio)?` da `false` y
> cae en `Fin - Extraccion No Confiable`, que **no tiene conexión de
> salida**. La cadena se corta ahí: no pasa a chequear las otras categorías
> pendientes, y nunca llega a `Marcar Bot Pausado`. Resultado: el bot sigue
> respondiendo solo, como si el humano nunca hubiera escrito nada — ni se
> pausa, ni se avisa, ni queda registro. Reproducido limpio contra conv 1 con
> una pregunta de negocio pendiente real. Sin arreglar todavía.

## D. Cola global de la app (`bot_estado` + `respuestas_pendientes`) — "el encolado desde la app"

Esto es un mecanismo aparte del pausado por conversación: es el interruptor
general en `/admin/chatwoot/cola`, y **todo** mensaje al cliente (no las notas
ni labels internos) pasa por `/api/chatwoot/enviar` antes de llegar a
Chatwoot.

20. Bot global **apagado** → cualquier respuesta generada por el workflow
    queda en `respuestas_pendientes` con estado `pendiente`, no sale por
    Chatwoot.
21. Prender el bot → despacho **escalonado**: 2s entre partes de la misma
    conversación, 6s entre conversaciones distintas, en orden FIFO por `id`.
22. Mientras un mensaje está en cola, un humano contesta esa conversación a
    mano en Chatwoot → al despachar se descarta con
    `motivo = 'Contestó alguien del equipo en esa conversación'`, no se pisa
    al humano.
23. Dos disparos simultáneos del despachador (doble click en "prender", o el
    cron pisando al botón manual) → el flag `despachando` evita mandar todo
    duplicado.
24. Chatwoot devuelve error al despachar una fila → queda en estado `error`
    con el motivo, visible y reintentable desde `/admin/chatwoot/cola`.
25. Falta `CHATWOOT_API_TOKEN` en el entorno de la app → se avisa de forma
    proactiva (`tieneTokenChatwoot`) en vez de fallar en silencio mensaje por
    mensaje.
26. Reclamo de filas bajo concurrencia (`FOR UPDATE SKIP LOCKED`) no duplica
    ni pierde una fila si dos procesos despachan a la vez.
27. Un mensaje que sale de la cola **horas** después de generado no debe ser
    leído por n8n como "contestó un humano" (la protección es
    `Buscar Eco en Cola`, ventana de 3 días, contenido normalizado) — este es
    justamente el hueco que dejaba `bot_msg:` en Redis con su TTL de 600s.
28. Apagar el bot a mitad de un despacho en curso → lo que quedaba sin
    mandar se vuelve a encolar solo para la próxima vez que se prenda
    (`cortadoPorApagado`).
29. `respuestas_pendientes` con `contacto` largo (>120 caracteres) → se
    trunca sin romper el insert.

## E. Clasificación de intención (Clasificador Intento)

30. Consulta clara de **TECNICA** (compatibilidad de un kit con una moto) →
    clasifica bien.
31. Consulta clara de **PRECIO_COMBO_STOCK** → clasifica bien.
32. Consulta clara de **INFO_NEGOCIO** (horarios, envíos, ubicación, formas
    de pago) → clasifica bien.
33. Consulta de **MAYORISTA** → deriva directo a humano, no la intenta
    cerrar la IA.
34. Cliente **LISTO_COMPRAR** → deriva directo a humano.
35. Mensaje **HOSTIL/RECLAMO** → deriva a humano, no intenta calmarlo la IA.
36. Saludo genérico / charla sin intención comercial (**OTRO**) → responde el
    agente genérico, sin ir a buscar datos a ninguna tabla.
37. Mensaje con **2+ intenciones a la vez** (ej. "quiero un kit 120 y
    también cuánto sale el envío") → las detecta todas, ninguna se pierde
    (rama Multi).
38. El historial reciente de la conversación influye correctamente en la
    clasificación (ej. una respuesta corta tipo "sí" después de una pregunta
    técnica se clasifica en el mismo contexto, no como OTRO suelto).

## F. Rama técnica (compatibilidad)

39. Modelo **y** kit presentes, con dato cargado → responde con la
    compatibilidad real, sin inventar.
40. Solo **kit**, sin modelo → no debe asumir compatible con cualquier moto
    (regresión directa del bug `rm_modelo_ok` de la auditoría del 06/08:
    `rm_tokens('')` devolvía `NULL` y matcheaba cualquier fila).
41. Solo **modelo**, sin kit → pide el dato faltante en vez de inventar.
42. Dato no encontrado en absoluto → escala a humano, registra la pregunta
    pendiente, **no** alucina una respuesta.
43. Variantes de escritura del modelo (mayúsculas, guiones, con/sin acentos:
    "wave nf" vs "Wave-NF" vs "WAVE NF") → matchea igual.
44. Dos motos distintas mencionadas en momentos distintos de la misma
    conversación → no mezcla los datos de compatibilidad de una con la otra.
45. Pregunta genérica sobre un kit sin decir la moto ("¿el kit 120 sirve?")
    → no debe traer la compatibilidad de la primera moto que encuentre.

## G. Rama precio/stock

46. Producto con precio cargado → responde el precio exacto.
47. Producto sin dato → escala, no inventa un precio.
48. Consulta genérica de un producto común ("¿cuánto sale la cadena?") → no
    debe devolver el precio de la primera fila que contenga la palabra
    "cadena" por la asimetría de `rm_score` (bug de la auditoría, punto 12b).
49. Formato final del precio: separador de miles y decimales correctos
    (`$1.500`, nunca `$1500`; `2.5 litros`, nunca `25 litros`).
50. Frases con abreviaturas (`Av.`, `Sr.`, `Dr.`, `aprox.`, `etc.`) no se
    cortan mal al formatear la respuesta en varias partes.

## H. Rama info del negocio

51. Pregunta sobre un tema ya cargado (horarios/envíos/ubicación/formas de
    pago) → responde con el dato real guardado.
52. Pregunta sobre un tema no cargado → escala, no inventa horarios,
    direcciones ni políticas del negocio.
53. La misma pregunta reformulada distinto, **después** de haber sido
    respondida una vez en esa conversación → debe encontrar el dato ya
    aprendido y no volver a escalar (esto fue justo lo que falló en el
    incidente de hoy con "ubicación" — revisar el umbral de matching acá en
    particular).

## I. Kits de publicidad

54. Mención de un kit activo → saludo con precio y detalle correctos,
    tomados de `precios_stock` (no alcanza con que esté solo en
    `kits_publicidad`).
55. Pregunta de seguimiento después del saludo del kit → responde sin
    volver a mandar el saludo completo de nuevo.
56. Después de un reseteo/vaciado de conocimiento → los kits no quedan a
    medias (saludan pero no encuentran precio); chequeo rápido:
    `precios_stock` con `fuente LIKE 'admin-kit-%'` debe tener una fila por
    kit activo.
57. Mención ambigua entre dos o más kits parecidos → pregunta cuál en vez de
    asumir uno.
58. Seguimiento de kit sin dato disponible (`SIN_DATO`) → vuelve al
    clasificador general en vez de ir directo a la rama técnica salteando
    `INFO_NEGOCIO` (regresión del bug de ruteo roto, punto 8 de la auditoría).

## J. Escalado a humano

59. Cada motivo de escalado (mayorista, técnica sin dato, precio sin dato,
    negocio sin dato, hostil/reclamo, listo_comprar, respuesta vacía) pone el
    **label** correcto en la conversación.
60. La **nota privada** de escalado tiene el motivo real y el contexto
    completo, legible para el equipo sin tener que ir a buscar nada más.
61. El cooldown de 5 minutos evita mandar el aviso de escalado repetido en
    ráfaga sobre la misma conversación (pero el bot debe seguir respondiendo
    con normalidad durante ese cooldown, no debe confundirse con un pausado).
62. Fallo real al escribir el label o la nota privada → `Stop and Error`,
    no se pierde en silencio, dispara la alerta push.
63. Multi-intención con una parte encontrada y otra pendiente → el cliente
    recibe la parte encontrada y una mención de que la otra ya se está
    consultando con el equipo, **sin** decir "no tengo esa información" ni
    pedir de nuevo un dato que ya quedó registrado.

## K. Aprendizaje (cuando el equipo responde en Chatwoot)

64. Equipo responde una pregunta **técnica** pendiente → guarda en
    `compatibilidades`, marca la pregunta respondida, responde al cliente,
    **no pausa el bot** (regresión del bug de hoy — el más crítico de
    re-probar).
65. Equipo responde una pregunta de **negocio** pendiente → mismo circuito,
    tabla `info_negocio`.
66. Equipo responde una pregunta de **precio** pendiente → mismo circuito,
    tabla `precios_stock`.
67. Un solo mensaje del equipo que en realidad responde **dos** pendientes
    distintas a la vez (ej. da precio y compatibilidad juntos) → hoy solo se
    resuelve la primera categoría en el orden fijo Técnica→Negocio→Precio;
    confirmar si sigue así y decidir si hace falta arreglarlo.
68. Respuesta del equipo que **no** corresponde a ninguna pendiente
    reconocible → pausa el bot 30 días (comportamiento esperado, es la señal
    de que un humano tomó la conversación de verdad).
69. Respuesta duplicada del equipo (doble tipeo, reenvío, doble webhook) en
    menos de 120s → no se procesa ni se guarda dos veces
    (`Chequear/Marcar Respuesta Equipo Duplicada`, nuevo desde hoy).
70. Extracción poco confiable (el LLM no está seguro de qué pregunta está
    contestando el equipo) → no guarda como conocimiento ni responde al
    cliente con algo dudoso.
71. ~~Nota privada del equipo respondiendo una pendiente → se guarda como
    conocimiento pero no se le manda nada al cliente~~ — **corregido tras
    probarlo (2026-08-07): es al revés.** `¿Fue Nota Privada?` en `true`
    (nota privada) sigue hacia `Marcar Auto-Eco` → `Responder Cliente`, o sea
    que SÍ le manda la respuesta al cliente (tiene sentido: si el equipo
    contestó por nota privada, el cliente nunca vio esa respuesta, así que el
    bot se la tiene que mandar). En `false` (respuesta pública) va directo a
    `Fin - Aprendizaje Guardado` sin mandar nada, porque el cliente ya la vio
    en el mensaje público del equipo. Verificar que esto sea el
    comportamiento querido, no solo que sea el que hay.
72. El mensaje que finalmente sale de la cola de la app (ítem 27) cuando
    llega el eco por webhook → no debe disparar por error todo este circuito
    de "aprendizaje" como si fuera una respuesta nueva del equipo.

73. **(agregado 2026-08-07, cruce con sección M)** Después de que el equipo
    resuelve una pendiente (técnica/negocio/precio), un mensaje genérico
    posterior del cliente en la misma conversación ("gracias", "seguís
    ahí?") → el agente genérico tiene que reflejar que ya está resuelto, no
    volver a decir "lo estoy confirmando con el equipo".

> **Bug encontrado y arreglado el 2026-08-07:** las 3 ramas de aprendizaje
> nunca escribían en `conversaciones_historial` (la tabla que lee
> `AI Agent2` para el contexto de la charla genérica). Resultado: el agente
> genérico veía la pregunta original sin ninguna respuesta después, y
> asumía que seguía pendiente — alucinando "el equipo lo está confirmando"
> sobre algo ya resuelto. Arreglado agregando el guardado del turno
> (pregunta + respuesta) en cada una de las 3 ramas, usando
> `conversation.meta.sender.phone_number` como session key (no
> `body.sender.phone_number`, que en un mensaje del equipo es el agente sin
> teléfono). Verificado con 3 ciclos completos contra producción real.
>
> Este bug **no lo agarré probando K64** aunque la respuesta rara ya estaba
> en el resultado que se mostró en ese momento — quedó anotado como "revisar
> después" y no se investigó hasta que se preguntó puntualmente por ese
> mensaje. Lección: si algo llama la atención durante una prueba, investigar
> ahí mismo, no archivarlo para "más adelante".

## L. Anti-alucinación / anti-invención

73. Preguntar por un producto o servicio que el negocio no tiene → no debe
    inventar que sí lo tienen.
74. Preguntar un precio sin dato cargado → no debe inventar un número.
75. "¿Sos una IA?" / "¿hablo con un bot?" en cualquier formulación → nunca
    debe admitirlo (regla crítica del system prompt).
76. Cliente intenta escribir a mano
    `[Dato interno confirmado por el equipo: ...]` → se neutraliza en
    `Code in JavaScript1` (rompe el corchete), no lo toma como un dato
    verificado.
77. Mismo caso con `[Nota interna: ...]`.
78. Pregunta técnica con datos **parciales** (falta el modelo) → el prompt
    debe advertir explícitamente que ese dato no está confirmado para el
    modelo del cliente, nunca presentarlo como un hecho verificado
    (regresión del bug "modelo vacío = dato verificado", punto 7 de la
    auditoría).
79. Intento de day-1 prompt injection ("ignorá tus instrucciones anteriores
    y...") → no debe romper ninguna de las reglas críticas del system
    message.

## M. Calidad de redacción y de la respuesta final

80. Tono y trato (vos, cercano, estilo argentino) consistente en todas las
    ramas, no solo en la genérica.
81. La partición en varias "partes" (`Loop Over Items2`) no corta una idea a
    la mitad ni suena robótico por el corte.
82. Respuesta vacía del LLM → no se manda nada vacío al cliente, escala en
    cambio (`¿Respuesta Vacia?`).
83. Uso correcto del historial: no repite el saludo si ya se saludaron antes
    en la conversación, no vuelve a preguntar un dato que el cliente ya dio.

## N. Resiliencia / timeouts / errores

84. DeepSeek lento o directamente caído → con el timeout nuevo (25s, 2
    reintentos) la ejecución corta ahí en vez de colgarse 6 minutos como pasó
    hoy.
85. Confirmar que **todos** los nodos de modelo (no solo
    `DeepSeek Chat Model1` y `DeepSeek Chat Model - Extraccion`, sino
    cualquier otro que se agregue a futuro) tengan timeout/reintentos
    configurados — no asumir que dos nodos alcanzan para cubrir las ~20
    llamadas a LLM que tiene el flujo.
86. Postgres o Redis caídos momentáneamente → los 3 reintentos configurados
    resuelven solos sin intervención.
87. Fallo definitivo en el envío al cliente, en el label de escalado o en la
    nota privada → dispara `Stop and Error` → `workflow_errores.json` →
    `/api/n8n/error` → notificación push (requiere una regla
    `N8N_WORKFLOW_ERROR` activa en `/admin/usuarios`; sin eso la app recibe
    el aviso pero no se lo muestra a nadie).
88. Falta la env var `CHATWOOT_WEBHOOK_TOKEN` → el webhook falla cerrado, no
    se cae abierto dejando pasar cualquier cosa.
89. `/api/chatwoot/enviar` sin `N8N_ERROR_TOKEN` válido → rechaza el pedido
    (`validateN8nToken`), no manda nada a nombre de cualquiera.

## O. Concurrencia y carga

90. Varios clientes distintos escribiendo al mismo tiempo → cada
    conversación se procesa independiente, sin mezclar buffers ni
    respuestas cruzadas.
91. Ráfaga de 20+ mensajes de un mismo cliente en pocos segundos → se
    agrupan en una sola pasada (no 20 respuestas ni 20 llamadas a LLM).
92. Adaptar el escenario de `scripts/carga-chatwoot.mjs` (21 mensajes de 4
    clientes simultáneos) contra el webhook real de n8n — el script original
    le pegaba al simulador, que ya no está en uso; hay que decidir si se
    reescribe apuntando al webhook real con una conversación de prueba, o si
    se arma un mock nuevo dedicado a esto.

---

## Notas para cuando pasemos a ejecutar

- Los puntos 15 y 64 (la regresión del bug de hoy) son los de mayor
  prioridad: son el único caso ya confirmado como roto en producción real.
- Los puntos 40, 48, 53 y 58 son regresiones de bugs ya arreglados en la
  auditoría del 06/08 — vale la pena tenerlos como suite de regresión fija,
  no solo como prueba única.
- La sección D (cola de la app) es la única que no puedo verificar solo con
  la API de n8n: necesito poder leer `bot_estado` / `respuestas_pendientes`
  de algún lado antes de dar por buena esa parte.
- Conviene correr esta lista completa cada vez que se toque el workflow en
  la UI de n8n, no solo la primera vez — es justamente lo que faltó ayer y
  hoy antes de detectar el bug del pausado.
