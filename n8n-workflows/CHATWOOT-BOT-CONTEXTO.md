# Bot de WhatsApp (Chatwoot + n8n) — contexto completo

> Este documento reemplaza toda la documentación dispersa anterior (auditorías de
> `workflow_mateo`, notas de migración, etc.). Están en el historial de git si hace falta
> desenterrar algo puntual, pero para entender el estado actual **alcanza con este archivo**.
> Actualizalo cuando cambie algo importante — la idea es que una conversación nueva pueda
> arrancar leyendo esto, sin tener que repetir toda la explicación de cero.
>
> Para una vista visual del árbol de decisión completo (qué pasa con cada mensaje entrante,
> según lo que dice), ver `rutas-bot-chatwoot.html` en esta misma carpeta — se puede abrir tal
> cual en el navegador. Igual que este `.md`, tiene que actualizarse en el mismo commit que
> cualquier cambio real al workflow (nodo nuevo, rewire, nodo eliminado); si el diagrama y el
> workflow real se desincronizan, dejó de servir.

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
   (`kit_pineado:{teléfono}`, TTL 96hs) para que las siguientes preguntas de esa conversación
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
- **Fase 9** (2026-08-13, `apply-fase9-fix-pausa-falsa-y-aviso.mjs`), disparada por un caso real
  (contacto +5493492569184, conv 1887: el cliente escribió "Me interesa" y el bot no hizo nada):
  1. **Fix de pausa falsa.** `¿Es Respuesta de Mi Equipo?` hace fan-out en paralelo a dos
     chequeos de pendientes — Fase 3 (`Buscar Preguntas Pendientes`, solo mira
     `preguntas_tecnicas_pendientes`) y Fase 7 (`Buscar Pendiente Sin Match`, solo mira
     `preguntas_sin_match_pendientes`). Si la nota privada del equipo respondía una pendiente
     `sin_match` (precio/envío/negocio/otro), la rama técnica no encontraba nada en SU tabla y lo
     interpretaba como "el equipo está chateando espontáneamente" → disparaba `Marcar Bot Pausado`
     (30 días) aunque la otra rama sí la había resuelto. Se agregó `Chequear Sin Match Antes de
     Pausar` + `¿Hay Sin Match Pendiente Tambien?` entre `¿Hay Pregunta Pendiente?` (rama FALSE) y
     `Marcar Bot Pausado`: si hay algo pendiente en la tabla sin_match, no pausa. Verificado con la
     conversación de prueba: contestar una pendiente sin_match ya no pausa, y el caso legítimo
     (nota que no responde nada en ninguna tabla) sigue pausando igual que antes.
  2. **Aviso de mensaje durante pausa.** Cuando la conversación SÍ está pausada (Redis
     `bot_pausado:{conv}`, ver Fase 4) y el cliente escribe, antes no quedaba ningún rastro más
     allá del mensaje sin leer en Chatwoot. Ahora, en la rama `Fin - Bot Pausado`, se agregaron
     `Armar Nota Bot Pausado` + `Enviar Nota Bot Pausado`: dejan una nota privada citando el
     mensaje del cliente y recordando el comando `/bot on`. El bot sigue sin responderle al
     cliente — la pausa no cambia — solo avisa.
  - Este bug es un caso concreto de la limitación ya anotada en Fase 7 ("duplica el camino de
    'el equipo respondió' en vez de unificarlo") — quedó ahí como riesgo aceptado y terminó
    generando pausas involuntarias en producción. Si en el futuro se agrega una tercera categoría
    de pendientes con su propia tabla, revisar si necesita el mismo parche antes de asumir que no
    pausa por error.
- **Fase 10** (2026-08-13, `apply-fase10-continuidad-plantilla-con-resto.mjs`), disparada por el
  caso real del contacto +5492954875916 (conv 1900): escribió la plantilla exacta del Kit 8
  ("¡Hola! Quiero más información SOBRE EL COMBO TAPA CDI 125 + CILINDRO 120!") y 4 segundos
  después "que valen" en un segundo mensaje. El matching comparaba la plantilla contra el
  **texto completo agrupado de la ráfaga**, no contra el primer mensaje solo — al sumarle "que
  valen" el texto agrupado ya no era idéntico a ninguna plantilla, así que el kit nunca se
  reconoció y todo cayó en `sin_match` sin necesidad.
  - `Unir Mensajes` ahora expone `primer_mensaje` y `resto_mensaje` además de `texto_completo`.
    `Clasificar Mensaje (sin IA)` compara la plantilla exacta **solo contra el primer mensaje**.
  - Si matchea y no hay resto: cero cambios de comportamiento (el 99% de los casos).
  - Si matchea y SÍ hay resto: antes de confirmar el kit, un paso de IA acotada nuevo
    (`Validar Continuidad de Tema`, mismo patrón que la Fase 6 — nunca redacta, solo clasifica)
    mira el resto y decide si sigue siendo sobre el mismo kit (precio/envío/stock/forma de
    pago/algo genérico) o si el cliente menciona un producto/tema distinto. **Ante la duda,
    responde que es tema distinto** (el camino seguro que escala en vez de asumir — coherente con
    [[feedback-bot-aliviador-mensajes]]).
    - Mismo tema: se manda el saludo del kit y se pinea igual que siempre, y el resto ("que
      valen") se resuelve en el mismo intercambio reutilizando el pipeline que ya existe para
      "kit pineado + pregunta nueva" (se re-entra por `Leer Kit Pineado` justo después de pinear,
      así que relee el pin recién escrito en Redis). No hace falta que el cliente vuelva a
      preguntar.
    - Tema distinto: no se manda el saludo de ese kit (aunque la primera frase haya matcheado
      letra por letra) y no se pinea nada. Todo el mensaje se trata como si no hubiera matcheado
      ninguna plantilla — mismo camino `sin_match` de siempre, sin mecanismo nuevo para este caso.
  - `Dividir y Etiquetar Sub-preguntas` y `Extraer Pregunta Compatibilidad` (Fase 6) ahora
    prefieren `resto_mensaje` sobre `texto_completo` cuando existe, para no reprocesar la frase de
    la plantilla ya resuelta por el saludo.
  - Validado con la conversación de prueba (conv 1): rafagas de dos mensajes plantilla+"que
    valen" → saludo del kit + precio contestado en el mismo turno; plantilla+"en realidad vengo
    por una cámara de aire" → sin saludo, sin pin, escalado en silencio como `otro` (ni siquiera
    con un kit pineado de una prueba anterior en Redis se lo atribuyó mal).

- **Fix precio-sin-detalle** (2026-08-14, `apply-fix-precio-sin-detalle.mjs`), encontrado
  revisando la charla real con +5493547624346 (contacto 1946, conv 1946): escribió la plantilla
  exacta del Kit 8 y 5 segundos después "Buen di el precio". La respuesta de precio (Fase 6, rama
  `precio` de `Consolidar Dato Resuelto`) le pegaba el campo `detalle` completo del kit atrás del
  precio (`'Precio: ' + r.precio + '. Detalle: ' + r.detalle`), aunque el cliente solo pidió el
  precio. `detalle` es la ficha técnica/compatibilidad, pensada para otro tipo de pregunta — no
  para "cuánto sale". En el caso del Kit 8 el `detalle` además tenía escrito "indicá al cliente
  que confirme si su 110 es de recorrido corto o largo", así que el redactor de IA (que solo puede
  usar el texto que le pasan, nunca inventar) terminó preguntándole al cliente — rompiendo la
  regla de "nunca re-preguntar, escalar en su lugar" ([[feedback-bot-aliviador-mensajes]]).
  - Fix acotado: la rama `precio` ahora usa únicamente `r.precio`, igual que las otras tres ramas
    (`envio`/`negocio`/`otro`), que ya tomaban un solo campo cada una y no tenían este problema.
  - Validado contra la conversación de prueba (conv 1): plantilla del Kit 8 + "cuanto sale?" en
    ráfagas separadas → saludo del kit, y la respuesta de precio salió corta ("¡Hola! El precio
    depende del recorrido: el corto está $175.000 y el largo $189.000. Cualquier cosa me
    avisás."), sin el párrafo técnico y sin pedirle al cliente que confirme nada.
  - El Kit 8 sigue siendo el único de los 8 kits activos con dos precios en el mismo campo
    `precio` ("recorrido corto $175.000 — recorrido largo $189.000"). Con el fix ya no arrastra la
    instrucción de "preguntale al cliente", pero el precio en sí sigue siendo ambiguo — si en
    algún momento se quiere resolver de raíz (separar en dos kits, o escalar cuando el precio
    tiene más de un valor en vez de mandar los dos), es una decisión de datos/negocio pendiente,
    no un bug de workflow — todavía no se charló con el usuario, queda para una próxima sesión si
    se quiere retomar.

- **Fix primera persona al redactar respuesta del equipo** (2026-08-14,
  `apply-fix-primera-persona-equipo.mjs`), encontrado revisando la charla real con
  +5493875911890 (contacto 1940, conv 1940): cuando el equipo contesta una pendiente en privado
  (compatibilidad o sin_match) y el bot le traslada la respuesta al cliente, salía con frases como
  *"Nos confirmaron que le beneficia mucho a la moto..."* — delata que hay un humano respondiendo
  atrás, rompiendo la regla de que el bot siempre habla en primera persona como el dueño del
  negocio (ver arriba, "Cómo hablar de esto con el usuario" y "El bot nunca debe demostrar que es
  IA").
  - Causa: los dos nodos que redactan esa respuesta (`Interpretar Respuesta Equipo`, rama
    compatibilidad/Fase 3, e `Interpretar Respuesta Sin Match`, rama Fase 7) le pedían a la IA un
    `mensaje_cliente` "contando lo que contestó el equipo" — literalmente en tercera persona. El
    nodo `Redactar Respuesta desde Dato` (Fase 6, camino directo sin escalado) ya tenía la
    instrucción correcta ("primera persona, nunca reveles que hay un equipo atrás") y nunca tuvo
    este problema.
  - Fix acotado: mismo texto de instrucción copiado a los otros dos prompts. Solo cambio de
    prompt, no toca lógica ni conexiones del workflow.
  - Validado con la conversación de prueba (conv 1): pregunta sin_match ("¿el motor viene con
    precinto de fábrica?") escalada → equipo contesta en privado → el cliente recibe *"Sí, el
    motor viene con precinto de fábrica original de la marca."* (sin mencionar al equipo). Mismo
    resultado en el camino de compatibilidad: pregunta con un modelo inventado (Yamaha Fazer FZ16
    2021) escalada → equipo contesta → el cliente recibe *"Sí, entra perfecto, solo hay que
    cambiar el carburador."*

- **Fix compatibilidad desde el `detalle` del kit** (2026-08-14,
  `apply-fix-compatibilidad-detalle-kit.mjs`), segundo fix de la ronda disparada por la conv 1940
  (+5493875911890): la rama de compatibilidad (`Buscar Compatibilidad del Kit`) solo miraba la
  tabla `compatibilidades` (respuestas previas confirmadas por el equipo) y nunca el campo
  `detalle` de `kits_publicidad`, que en varios kits ya trae la lista de modelos
  compatibles/no compatibles escrita a mano. En el caso real, el Kit 8 ya tenía "Smash" listado en
  su `detalle` y aun así escaló a un humano.
  - Nodos nuevos, insertados en la rama `false` de `¿Hay Dato de Compatibilidad?` (antes iba
    directo a escalar): `Buscar Detalle Kit Pineado` (postgres, trae el `detalle` del kit
    pineado) → `Evaluar Compatibilidad desde Detalle` (IA acotada, DeepSeek — lee SOLO ese texto y
    dice compatible/no compatible/no está claro, nunca inventa) → `Parsear Compatibilidad desde
    Detalle` → `¿Detalle Resuelve Compatibilidad?`. Si resuelve (true/false), va a `Preparar
    Respuesta Compatibilidad` (mismo nodo de siempre, deterministic) y contesta directo. Si no
    resuelve (null), sigue al camino de escalado de siempre (`¿Ya Hay Pregunta Pendiente?`).
  - Prioridad: `compatibilidades` (dato ya confirmado por una persona) sigue ganando si existe;
    el `detalle` del kit es el segundo intento, antes de molestar al equipo.
  - Validado con la conversación de prueba (conv 1, Kit 8 pineado):
    - "¿anda en una Gilera Nevada?" (está listada en el `detalle` como compatible, recorrido
      corto) → contestó directo, sin escalar: *"Sí, el combo de TAPA CDI + CILINDRO 120 + corona
      de distribucion de regalo es compatible con tu Gilera Nevada. El kit es para 110 chinos de
      recorrido corto e incluye a Gilera Nevada en esa categoría, por lo que es compatible; solo
      confirmar si el recorrido es corto o largo."* Nada quedó en
      `preguntas_tecnicas_pendientes` ni en `compatibilidades`.
    - "¿anda en una Kawasaki Ninja 300 2019?" (moto de otro segmento, no cubierta por el
      `detalle`) → siguió escalando a un humano como antes (`Registrar Pregunta Pendiente`,
      `Enviar Nota Escalado`) — confirma que el camino de respaldo sigue intacto.

- **Fix ráfaga con compatibilidad + otra pregunta mezclada** (2026-08-14,
  `apply-fix-rafaga-compatibilidad-resto.mjs`), tercer y último fix de la ronda disparada por la
  conv 1940 (+5493875911890): con un kit pineado, si la ráfaga tenía una pregunta de
  compatibilidad Y algo más (precio/envío/negocio/otra pregunta), el bot resolvía/escalaba SOLO
  la parte de compatibilidad — el resto quedaba enterrado en el texto crudo de la nota de
  escalado, sin resolverse ni escalarse aparte. Caso real: "Le va. Ala Gilera smash / 2017 / Y
  leva para calle no tiene??" — la pregunta "para calle" nunca se procesó.
  - `Extraer Pregunta Compatibilidad` ahora también devuelve `resto_mensaje` (el mensaje del
    cliente sin la frase de compatibilidad, palabra por palabra — vacío si no queda nada). Cuando
    hay resto con contenido real (nodo nuevo `¿Hay Resto Adicional en la Rafaga?`), se reusa el
    mismo partidor de sub-preguntas de la Fase 6 (`Dividir y Etiquetar Sub-preguntas` y todo su
    pipeline de resolver/escalar) **en paralelo** a la resolución/escalado de la compatibilidad —
    no se duplicó lógica nueva, se re-conectó el pipeline existente.
  - `Preparar Contexto Sub-preguntas` (nodo compartido por los tres caminos que llegan al
    partidor: sin kit pineado, kit pineado sin pregunta de compatibilidad, y este nuevo camino)
    ahora decide qué texto pasarle al partidor: usa el `resto_mensaje` de la compatibilidad
    cuando vino de ahí (con `try/catch` igual que ya hacía para `kit_id`, por si ese nodo no
    corrió en la ejecución), o el texto completo de siempre en cualquier otro caso — así los
    otros dos caminos quedan sin cambios de comportamiento.
  - Validado con la conversación de prueba (conv 1, Kit 8 pineado):
    - "¿Le va a la Gilera Nevada? Y hacen envíos a Chubut?" → dos mensajes separados: la
      compatibilidad (resuelta por el fix del `detalle`) y el envío (resuelto por Fase 6) — antes
      la pregunta de envío se hubiera perdido.
    - "¿Le va a una Suzuki GSXR 750? Y hacen delivery en moto propia el mismo día?" →
      compatibilidad desconocida escaló en privado (sin mensaje visible al cliente) mientras que
      la pregunta de envío se resolvió y se mandó sola — confirma que ambos caminos funcionan
      independientemente cuando uno escala y el otro no.
    - Sin kit pineado (número de prueba distinto, sin pin en Redis), pregunta suelta de
      garantía → siguió yendo directo al partidor de siempre, sin tocar el camino de
      compatibilidad para nada — confirma que no se rompió el caso más común (sin kit pineado).

- **Fix falso positivo de compatibilidad por palabra genérica compartida** (2026-08-14,
  `n8n-workflows/fix-modelo-ok-overlap-minimo.sql`), encontrado revisando la charla real con
  +5493856217036 (contacto 1910, conv 1910): con el Kit 8 pineado, preguntó *"A una hyamaja
  criton 110 amo 2015"* (typeo de Yamaha Crypton 110, 2015). El bot contestó *"Sí, es
  compatible... Para recorrido corto"* — pero nunca hubo una fila de compatibilidad para esa
  moto. El texto "Para recorrido corto" es el `detalle` de una fila totalmente distinta, ya
  confirmada por el equipo: **Zanella ZB 110**. Peor aún: el propio `detalle` del Kit 8 dice
  explícitamente "No compatible con... Crypton" — la respuesta real correcta era que NO andaba.
  - Causa: `Buscar Compatibilidad del Kit` usa `rm_modelo_ok(modelo_guardado, modelo_consulta)`,
    que matchea por palabras compartidas en cualquier dirección con umbral 50%.
    `rm_tokens('Zanella ZB 110')` da solo 2 palabras (`zanella`, `110` — "ZB" se descarta por
    tener menos de 3 letras). La única palabra en común con "hyamaja criton 110 amo 2015" es
    "110"; en la dirección inversa eso ya es 1 de 2 palabras = 50%, alcanzaba el umbral. Como el
    negocio es específicamente de motos "110cc", casi cualquier consulta de un cliente contiene
    "110" — cualquier fila guardada con nombre corto (2 palabras, una de ellas "110") podía
    prestarle su compatibilidad a una moto completamente distinta.
  - Fix acotado: además del 50%, `rm_modelo_ok` ahora exige un mínimo de 2 palabras en común
    (función nueva `rm_match_count`). Una sola palabra genérica compartida ya no alcanza.
    `rm_score()` no se toca — se usa en otros lados con su calibración propia
    (`conocimiento_libre`, `link-compatibilidades-kit.sql`) y `rm_modelo_ok` solo se usa en
    `Buscar Compatibilidad del Kit`, así que el fix queda contenido a esa rama.
  - Validado con la conversación de prueba (conv 1, Kit 8 pineado):
    - "Anda en una yamaha crypton 110 del 2015?" (repite el caso real, sin el typeo) → ya no
      matchea contra Zanella ZB 110; cae al fallback del `detalle` del kit (fix anterior) que sí
      tiene a Crypton listada como incompatible → contestó *"No, el combo... no es compatible
      con tu yamaha crypton 110 del 2015. El detalle indica explícitamente que no es compatible
      con Crypton."* — la respuesta correcta, en vez de la falsa confirmación de antes.
    - "Le va a una zanella zb 110 del 2019?" (el modelo real que sí está confirmado) → siguió
      matcheando directo contra `compatibilidades` sin pasar por el fallback: *"Sí, el combo...
      es compatible con tu zanella zb 110 del 2019. Para recorrido corto"* — confirma que los
      matches legítimos no se rompieron.
  - **Pendiente:** el cliente real (+5493856217036, conv 1910) ya recibió la respuesta
    incorrecta ("Sí, es compatible") el 2026-08-14 a las 12:17. Habría que entrar a Chatwoot y
    corregirlo a mano — el kit no anda en su Crypton según el propio `detalle` del Kit 8.

- **Fix respuesta de compatibilidad muy larga** (2026-08-14,
  `apply-fix-simplificar-respuesta-compatibilidad.mjs` +
  `apply-fix-puntuacion-respuesta-compatibilidad.mjs`), encontrado revisando la charla real con
  +5493794779342 (contacto/conv 1957): preguntó si el kit andaba en su Guerrero Trip 110 y el bot
  contestó *"Sí, el combo de TAPA CDI + CILINDRO 120 + corona de distribucion de regalo es
  compatible con tu Guerrero trip 110 modelo 2021. El modelo Trip aparece en la lista de 110
  chinos de recorrido corto compatibles."* — correcto, pero innecesariamente largo: usaba el
  nombre técnico completo del kit y la IA justificaba el motivo en vez de solo confirmar.
  - `Preparar Respuesta Compatibilidad` ya no arma el mensaje con el nombre completo del kit
    (`kit_nombre`, ej. "combo de TAPA CDI + CILINDRO 120..."), ahora dice simplemente "el kit".
  - El prompt de `Evaluar Compatibilidad desde Detalle` (el camino que lee el campo `detalle` del
    kit cuando no hay fila confirmada en `compatibilidades`) ahora pide que su aclaración sea muy
    corta y práctica (ej. "para recorrido corto") cuando haga falta, y prohíbe explícitamente
    frases de justificación tipo "aparece en la lista de..." o "pertenece al grupo de...".
  - Segunda pasada: la plantilla original dejaba doble puntuación cuando había aclaración
    (`"...modelo 2021., confirmar..."`); se corrigió para que el punto final vaya una sola vez.
  - Validado con la conversación de prueba (conv 1, Kit 8 pineado): "¿Anda en una Guerrero Trip
    110 modelo 2021?" → *"Sí, el kit es compatible con tu Guerrero Trip 110 modelo 2021, para
    recorrido corto."*; "¿Anda en una Honda Wave NF?" → *"No, el kit no es compatible con tu Honda
    Wave NF."* (sin aclaración porque no hacía falta).

- **Fix saludo a mitad de charla** (2026-08-14,
  `apply-fix-saludo-mitad-charla.mjs`), encontrado revisando la charla real con +5492604824863
  (2026-08-14): el cliente confirmó "SII si es recorrido corto" y el bot le contestó sobre envíos
  arrancando con *"¡Hola! Sí, tenemos envío gratis..."*; más tarde escaló "Yo soy de san Rafael
  Mendoza", el equipo contestó, y el bot le mandó al cliente *"¡Hola! Te contamos que realizamos
  envíos a todo el país..."* — la info era correcta, pero saludar de nuevo en medio de una charla
  ya arrancada suena robótico y rompe la regla de que el bot nunca debe demostrar que es IA (ver
  arriba).
  - Causa: tres nodos de IA que redactan respuestas — todos disparados siempre a mitad de
    conversación, nunca en el primer mensaje — no tenían ninguna instrucción sobre saludar o no:
    `Redactar Respuesta desde Dato` (Fase 6, camino directo), `Interpretar Respuesta Sin Match`
    (Fase 7) e `Interpretar Respuesta Equipo` (Fase 3, compatibilidad). DeepSeek agregaba el
    "¡Hola!" por costumbre propia del modelo, no porque el prompt se lo pidiera.
  - Fix acotado: se agregó la misma instrucción a los tres `systemMessage` ("No saludes... esta
    charla ya está en curso, arrancá directo con la respuesta"). Solo texto de prompt, no toca
    lógica ni conexiones.
  - Validado con la conversación de prueba (conv 1, Kit 8 pineado):
    - "hacen envios a todo el pais?" (camino directo, Fase 6) → *"Sí, hacemos envíos a todo el
      país. Envío gratis por Andreani..."*, sin saludo.
    - Pregunta escalada como `sin_match`, equipo contesta "Si, tenemos stock disponible..." →
      *"Sí, tenemos stock disponible de ese kit, con entrega inmediata."*, sin saludo.
    - Pregunta de compatibilidad con moto inventada (Yamaha Fazer FZ16 2021) escalada, equipo
      contesta "Si, entra perfecto, solo hay que cambiar el carburador" → *"Sí, entra perfecto,
      solo hay que cambiar el carburador."*, sin saludo.

- **Refuerzo fix primera persona (con ejemplo concreto)** (2026-08-14,
  `apply-fix-ejemplo-primera-persona.mjs`), encontrado revisando otra vez la charla real con
  +5493875911890 (contacto/conv 1940): el fix de primera persona (arriba) ya estaba aplicado y
  activo en producción, pero la misma conversación volvió a filtrar la frase prohibida más tarde
  el mismo día (ejecución 74880, 13:04) — el equipo contestó en privado "mejora mucho el
  rendimiento, la potencia, el torque, la velocidad final" y la IA le mandó al cliente *"Nos
  confirmaron que le beneficia mucho a la moto: mejora el rendimiento..."*. La prohibición sola
  ("nunca digas nos confirmaron...") no le alcanzó a DeepSeek para evitar su propia frase
  habitual, incluso con `temperature: 0`.
  - Fix acotado: se agregó un ejemplo concreto (mal → bien, usando ese mismo caso real) a los
    prompts de `Interpretar Respuesta Equipo` e `Interpretar Respuesta Sin Match`, además de la
    prohibición que ya tenían. Solo texto de prompt. A pedido explícito de Martín, no se agregó
    ninguna red de seguridad determinística aparte — si esto vuelve a pasar, ahí sí conviene
    reconsiderarlo.
  - Validado con la conversación de prueba (conv 1): mismo texto real del equipo ("mejora mucho
    el rendimiento, la potencia, el torque, la velocidad final") → *"Sí, le mejora mucho el
    rendimiento: potencia, torque y velocidad final."*, sin mencionar al equipo.

- **Fix dato de ubicación con "Sí, somos de Argentina" de más** (2026-08-14, dato en BD, sin
  script `.mjs` — no toca el workflow), encontrado revisando la charla real con +5493543615139
  (contacto/conv 1959): preguntó "De donde son" y el bot contestó *"Sí, somos de Argentina.
  Estamos en Revolución de Mayo 1605, barrio Crisol, Córdoba capital."* — no es un bug de lógica:
  `Redactar Respuesta desde Dato` solo redacta el texto que ya está guardado
  (`info_negocio.tema = 'ubicacion'`), y ese texto tenía literalmente el "Sí, somos de Argentina."
  escrito adelante — de ahí el "Sí" sin pregunta de sí/no que lo justifique y la mención al país
  de más (solo debería salir si preguntan puntualmente por el país).
  - Fix: `UPDATE info_negocio SET respuesta = 'Estamos en Revolución de Mayo 1605, barrio Crisol,
    Córdoba capital.' WHERE id = 7` (tema `ubicacion`). Dato editable en
    `/admin/chatwoot/conocimiento`, no hace falta tocar el workflow para este tipo de ajuste.
  - Validado con la conversación de prueba (conv 1): "de donde son" → *"Estamos en Revolución de
    Mayo 1605, barrio Crisol, Córdoba capital."*, sin "Sí" y sin mención al país.

- **Fix respuesta con solo el modelo de moto, sin forma de pregunta** (2026-08-14,
  `apply-fix-respuesta-modelo-sin-pregunta.mjs`), encontrado revisando la charla real con
  +5493815116333 (contacto/conv 1965): escribió la plantilla exacta del Kit 1, el bot mandó el
  saludo (que termina preguntando "¿Para qué moto lo estás buscando?"), y el cliente contestó en
  dos mensajes: "Tengo una Zanella due 110" y "2025". El bot no respondió nada, y no quedó ningún
  rastro en ninguna tabla de pendientes — el mensaje se perdió por completo.
  - Causa: `Extraer Pregunta Compatibilidad` solo marcaba `es_compatibilidad: true` cuando el
    mensaje venía fraseado como pregunta explícita ("¿anda en...?"). Como el cliente respondió
    afirmando el modelo sin signos de pregunta, salió `false` — pero el nodo ya extraía bien el
    modelo (`modelo_moto: "Zanella due 110 2025"`) igual, el dato estaba ahí, solo la etiqueta
    estaba mal. Al ser `false`, el mensaje caía en el partidor de sub-preguntas de la Fase 6
    (`Dividir y Etiquetar Sub-preguntas`), que busca "preguntas o pedidos" — una simple afirmación
    no es ninguna de las dos cosas, así que devolvía `partes: []`. Con la lista vacía, `Separar
    Pedazos` no tiene nada que iterar, y **nada de lo que sigue corre** — ni la respuesta, ni el
    escalado a `preguntas_sin_match_pendientes`. El mensaje desaparece sin dejar rastro.
  - Como todos los mensajes de bienvenida de los kits terminan preguntando "¿para qué moto lo
    estás buscando?", la respuesta más común y esperada del cliente NO viene en forma de pregunta
    — es simplemente el modelo de la moto. No es un caso raro, es el camino principal.
  - Fix acotado: se amplió la instrucción de `Extraer Pregunta Compatibilidad` para que
    `es_compatibilidad` sea `true` también cuando el cliente simplemente menciona/afirma un
    modelo de moto puntual como respuesta, sin necesidad de fraseo de pregunta. Solo texto de
    prompt, no toca lógica ni conexiones — reutiliza el mismo camino que ya existe
    (`compatibilidades` → `detalle` del kit → escalado silencioso a `preguntas_tecnicas_pendientes`
    si no hay dato).
  - Validado con la conversación de prueba (conv 1, Kit 1 pineado): "Tengo una Zanella due 110" +
    "2025" en ráfaga → `es_compatibilidad: true`, `modelo_moto: "Zanella due 110"` → no hay dato
    de compatibilidad para Kit 1 con esa moto → escaló en silencio a
    `preguntas_tecnicas_pendientes` con nota privada al equipo, en vez de no hacer nada.
  - **Pendiente:** el cliente real (+5493815116333, conv 1965) sigue sin respuesta desde
    2026-08-14 15:47. Hay que entrar a Chatwoot y contestarle a mano si todavía no se hizo — el
    fix no reprocesa conversaciones viejas.

- **Fix preguntas técnicas sueltas ("otro") sin mirar el `detalle` del kit** (2026-08-14,
  `apply-fix-otro-detalle-kit.mjs`), encontrado revisando la charla real con +5493491508217
  (contacto/conv 1977): con el Kit 8 pineado, mandó una ráfaga con *"Y cuanto sale la tapa cdi
  sola?" / "Que diámetro tiene el cilindro" / "Es recorrido corto?"*. Las tres cayeron en la
  categoría **"otro"** del partidor de sub-preguntas (Fase 6), que solo busca en
  `conocimiento_libre` (lo que el equipo ya enseñó antes) — nunca mira el campo `detalle` del kit
  pineado. El `detalle` del Kit 8 ya decía textual "para 110 chinos de recorrido corto... si es de
  recorrido largo existe la opción de cilindro largo", así que "¿Es recorrido corto?" se podría
  haber contestado sola. Terminó escalando las tres juntas al equipo (que las contestó a mano
  ~4 minutos después, así que el cliente real no quedó sin respuesta, pero la carga innecesaria en
  el equipo sí pasó).
  - Mismo patrón que el fix de compatibilidad-detalle-kit, aplicado ahora a la rama "otro": antes
    de buscar en `conocimiento_libre`, un paso nuevo de IA acotada (`Responder Otro desde Detalle
    Kit`, DeepSeek — lee SOLO el `detalle` del kit pineado, nunca inventa) dice si ese texto
    contesta la pregunta puntual. Si resuelve, se usa ese dato; si no (detalle vacío, no
    relacionado, o no alcanza), sigue el camino de siempre: `conocimiento_libre` y después
    escalado silencioso si tampoco hay nada ahí.
  - Nodos nuevos: `Buscar Detalle Kit Pineado (Sub-pregunta)` (postgres) → `Responder Otro desde
    Detalle Kit` (agent) + `DeepSeek Chat Model - Detalle Otro` → `Parsear Respuesta Otro desde
    Detalle` (code), insertados entre `Buscar Info Negocio (Negocio)` y `Buscar en Conocimiento
    Libre (Sin Match)`. `Consolidar Dato Resuelto` ahora prioriza el dato del detalle sobre
    `conocimiento_libre` en la rama "otro".
  - **Gotcha repetido** (ya documentado abajo, pero se volvió a pisar armando este fix): el nodo
    Code `Parsear Respuesta Otro desde Detalle` corre una vez por cada sub-pregunta de la ráfaga
    (varios ítems de entrada), así que necesita `"mode": "runOnceForEachItem"` — sin eso solo
    procesaba la primera sub-pregunta y perdía el resto. Además, en ese modo el `return` tiene que
    ser un objeto `{ json: {...} }` suelto, no un array `[{ json: {...} }]` — con el array tiraba
    error `"A 'json' property isn't an object"`. Los dos detalles ya quedaron corregidos en el
    script antes de dejarlo commiteado.
  - Validado con la conversación de prueba (conv 1, Kit 8 pineado), repitiendo la ráfaga real:
    *"Y cuanto sale la tapa cdi sola?" / "Que diámetro tiene el cilindro" / "Es recorrido corto?"*
    → dos mensajes al cliente ("La tapa sola cuesta $129.999." desde `conocimiento_libre`, y "Es
    para 110 chinos de recorrido corto." desde el `detalle` del kit) + la pregunta del diámetro
    (que el `detalle` no cubre) escaló sola al equipo, sin bloquear las otras dos.

- **Fix precio duplicado y desordenado al confirmar kit** (2026-08-14,
  `apply-fix-precio-redundante-y-orden.mjs` + fix directo del nodo `Marcar Kit Pineado` + dato en
  BD), encontrado revisando la charla real con +5493812408182 (contacto/conv 1983): escribió la
  plantilla exacta del Kit 8 y 0 segundos después "Que precio está ?" en la misma ráfaga. El bot
  mandó DOS mensajes de precio — el saludo del kit (que en ese momento solo traía el precio corto,
  $175.000) y una respuesta de precio aparte ("El recorrido corto está $175.000 y el largo
  $189.000."). Además, por una carrera entre las dos ramas paralelas que se disparan al confirmar
  el kit (mandar el saludo vs. resolver el resto de la ráfaga), la respuesta de precio —sin
  mención de ningún kit— **llegó antes** que el saludo con el nombre del kit (confirmado con
  timestamps en ms de esa ejecución real: el precio terminó de enviarse a los .522s, el saludo
  recién arrancó a los .593s). Al cliente le llegó primero un precio suelto sin contexto, y recién
  después el nombre del kit — leía como si el bot hubiera contestado sobre otra cosa.
  - **Parte 1 (dato en BD, sin script):** se reescribió `mensaje_bienvenida` del Kit 8 —el único
    de los 8 kits activos con precio ambiguo en dos partes— para que mencione los dos precios
    ("recorrido corto $175.000 y recorrido largo $189.000"). Con esto, los 8 kits activos ya
    tienen el precio completo adentro del saludo, así que la regla siguiente queda simple y sin
    excepciones por kit.
  - **Parte 2 (workflow, sin IA):** `Preparar Contexto Sub-preguntas` ahora expone
    `kit_recien_confirmado` (detecta si `Marcar Kit Pineado` corrió en esta misma ejecución, mismo
    patrón try/catch que ya se usaba para `kit_id`). `Parsear Sub-preguntas` descarta en silencio
    cualquier parte categoría "precio" cuando el kit se acaba de confirmar en esta ráfaga — no se
    manda nada aparte, no se escala, porque ya está contestado por el saludo que se manda en la
    misma ráfaga. Si el kit ya estaba pineado de antes (pregunta de precio en un mensaje
    posterior, no pegada a la plantilla), la respuesta de precio se sigue mandando normal.
  - **Parte 3 (workflow, orden):** `Enviar Saludo Kit` pasó a ser un paso obligatorio *antes* de
    que arranque `Marcar Kit Pineado` (y por lo tanto todo el pipeline de sub-preguntas que cuelga
    de ahí), en vez de dispararse en paralelo — así cualquier otra respuesta que quede en la
    ráfaga (envío/negocio/otro) siempre llega después de que el cliente sepa de qué kit se está
    hablando.
  - **Gotcha encontrado aplicando la parte 3** (para no repetirlo): insertar un nodo en el medio de
    una cadena rompe cualquier nodo más adelante que use el atajo `$json` (sin especificar de qué
    nodo) para leer datos de "más atrás" — `$json` siempre apunta al nodo inmediatamente anterior,
    no al que tenía el dato antes de reordenar. Acá rompió a `Marcar Kit Pineado`: antes leía
    `$json.kit_id`/`$json.kit_nombre` asumiendo que su entrada directa era la clasificación del
    kit, pero al insertar `Enviar Saludo Kit` (HTTP Request) en el medio, `$json` pasó a ser la
    respuesta de Chatwoot en vez de los datos del kit — pineaba un kit vacío (`{}`) sin tirar
    ningún error visible, y recién se notaba río abajo cuando todo lo que dependía del kit pineado
    empezaba a fallar en silencio. Se corrigió apuntando explícito al nodo de origen
    (`$('Clasificar Mensaje (sin IA)').item.json.kit_id`) en vez del atajo `$json`. Antes de
    reordenar nodos en el futuro, revisar todo lo que quede río abajo del nuevo punto de inserción
    buscando usos de `$json` sin nombre de nodo.
  - Validado con la conversación de prueba (conv 1), repitiendo el caso real y tres variantes:
    - Plantilla Kit 8 + "Que precio está ?" en la misma ráfaga → un solo mensaje, el saludo con
      los dos precios, sin respuesta de precio aparte.
    - Plantilla Kit 1 sola, sin resto → sin cambios de comportamiento (un solo saludo).
    - Plantilla Kit 8 + "Hacen envios a Chubut?" en la misma ráfaga → dos mensajes, en orden
      correcto (saludo primero, respuesta de envío 11 segundos después, sin carrera).
    - Kit ya pineado de antes + "Me confirmas el precio de nuevo?" en un mensaje posterior (sin
      plantilla) → siguió respondiendo el precio normal, sin suprimir nada (`kit_recien_confirmado:
      false`).

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
   de texto amplio; reusar la conversación de prueba en vez de inventar IDs. **Ojo con la
   conversación de prueba (`+5493513784909`)**: hasta el 2026-08-18 "resetearla" desde
   `/admin/chatwoot/prueba` NO limpiaba Redis (`kit_pineado:{telefono}`, TTL 96hs;
   `bot_pausado:{conversation_id}`, TTL 30 días) — un pin viejo de una sesión anterior podía
   arrastrar una prueba nueva por un camino distinto sin que se notara. Ya está resuelto (ver
   [[project-redis-app-conectividad]] en memoria) — el botón "Borrar historial de un número" ahora
   también llama a un workflow n8n nuevo, **"Utilidad - Limpiar Pin de Prueba"** (activo, separado
   de "Respuestas chatwoot 2.0", webhook `POST /webhook/limpiar-pin-prueba`), que borra esas dos
   claves. La app no puede hablar con ese Redis directo (firewall de IP, solo deja pasar al
   servidor de n8n) — de ahí el workflow intermediario en vez de un cliente Redis en la app.
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
   - **Insertar un nodo en el medio de una cadena rompe cualquier nodo más adelante que use el
     atajo `$json` (sin nombre de nodo) para leer datos de "más atrás"** — `$json` siempre apunta
     al nodo inmediatamente anterior en ESE momento, no al que tenía el dato antes de reordenar.
     Encontrado en el fix precio-redundante-y-orden (ver abajo): al insertar `Enviar Saludo Kit`
     entre `¿Es Mismo Tema?` y `Marcar Kit Pineado`, este último rompió en silencio (pineaba un
     kit vacío `{}`, sin tirar error) porque leía `$json.kit_id` asumiendo que su entrada directa
     era la clasificación del kit. Antes de reordenar nodos, revisar todo lo que quede río abajo
     del nuevo punto de inserción buscando usos de `$json` sin nombre de nodo, y cambiarlos a
     `$('Nodo De Origen').item.json...` explícito.

- **Fix "interés genérico sin producto" perdido en sin_match** (2026-08-17,
  `apply-fix-saludo-generico-enlace-ia.mjs`), encontrado revisando dos conversaciones reales:
  1. Conv 2021 (+): el cliente entró por un anuncio que le agrega `"Enlace:\n\n\n"` adelante del
     mensaje real (`"Enlace:\n\n\n¡Hola! Quiero más información"`) — metadata que mete
     Meta/Instagram, no algo que el cliente haya escrito. `"enlace"` no estaba en `STOPWORDS` de
     `Clasificar Mensaje (sin IA)`, así que contaba como palabra de contenido real y rompía la
     detección de "saludo sin pedido específico" (exige CERO palabras de contenido). El mensaje
     escaló una nota al equipo por algo que el bot ya sabe manejar solo (rama `Enviar Saludo
     Generico`: manda "Hola bro! En qué te podemos ayudar?"). Fix: agregar `"enlace"` a
     `STOPWORDS`. Un solo string, sin tocar lógica.
  2. El problema de fondo no era solo `"enlace"` — cualquier variante de "quiero más información"
     sin ninguna de las `GREETING_WORDS` literales ("hola", "buenas", etc.) tampoco entraba por la
     rama saludo, porque esa detección es 100% por lista de palabras (ya había pasado algo
     parecido en la Fase 9 con "Me interesa"). En vez de perseguir cada frase nueva a mano, se
     agregó un paso de IA chico y acotado (mismo patrón que `Validar Continuidad de Tema`: nunca
     redacta, solo clasifica, DeepSeek, `temperature: 0`, "ante la duda: false") insertado en la
     salida "Sin Match" de `Ruteo Clasificacion`, ANTES de `Leer Kit Pineado`: `Detectar Interes
     Generico` (agent) → `DeepSeek Chat Model - Interes Generico` → `Parsear Interes Generico`
     (code) → `¿Es Interes Generico?` (if) — `true` va a `Enviar Saludo Generico` (nodo ya
     existente, sin cambios), `false` sigue a `Leer Kit Pineado` (mismo camino de siempre).
  - Validado con la conversación de prueba (conv 1): `"Enlace:\n\n\n¡Hola! Quiero más
    información"` → clasificó directo como saludo sin pasar por IA (`Clasificar Mensaje (sin IA)`
    → `Ruteo Clasificacion` → `Enviar Saludo Generico`); `"Quiero más información"` (sin "hola") →
    cayó en Sin Match, pasó por `Detectar Interes Generico` (`generico: true`) → mismo saludo
    automático; control con una pregunta real sin kit pineado relacionado (`"Che tenes el kit de
    arrastre reforzado para una zanella rx 150?"`) → `Detectar Interes Generico` devolvió
    `generico: false` y siguió el camino normal completo (compatibilidad → sin dato → escaló al
    equipo), confirmando que el paso nuevo no traga preguntas reales.
  - **Gotcha de esta sesión**: la API de ejecuciones de n8n (`/executions`) tardó varios minutos
    (no segundos) en reflejar la primera ejecución disparada justo después de un `PUT` de
    workflow — ver [[n8n_executions_listado_con_atraso]]. Reenviar el mismo mensaje de prueba con
    un `msgId` nuevo destrabó la validación; no asumir que el fix no anda solo porque
    `/executions` no muestra nada todavía.

- **Feat "Identificar Necesidad" — pin de kit desde lenguaje natural** (2026-08-17,
  `apply-feat-identificar-necesidad-sin-match.mjs`). Diagnosticado revisando `/admin/chatwoot/pendientes`:
  de 33 pendientes activas, ~20 eran seguimientos de una charla donde el cliente ya había nombrado
  el kit en lenguaje natural ("Y precio", "Precio?", "Osea que me sale todo?") pero nunca se
  pineaba nada, porque la ÚNICA forma de pinear un kit era el match letra por letra con una
  plantilla de Instagram/Meta Ads (`Clasificar Mensaje (sin IA)` → `Marcar Kit Pineado`). Cualquier
  conversación que arrancaba distinto (la gran mayoría fuera de clicks de anuncio) nunca pineaba
  nada, y cada mensaje siguiente de esa charla se evaluaba de cero sin memoria.
  - Cambio de wiring: la salida "Sin Match" de `Ruteo Clasificacion` pasa por `Leer Kit Pineado` /
    `¿Hay Kit Pineado?` PRIMERO (antes de decidir si es genérico). Si hay pin, cero cambios (sigue
    el camino de siempre). Si no hay pin, se eliminó `Detectar Interes Generico` (su única salida
    pasó a ser un tipo más del agente nuevo) y entra `Identificar Necesidad` (agent, DeepSeek,
    mismo patrón que los demás pasos de IA acotada del workflow): ve el mensaje actual +
    últimos ~8 mensajes reales de la conversación (nodo nuevo `Traer Historial Conversacion`,
    `GET /conversations/{id}/messages` de Chatwoot) + la lista CERRADA de kits activos (ya
    disponible en `Buscar Kits Activos`, sin inventar productos). Responde un JSON con 4 tipos:
    `saludo` (interés genérico → mismo camino de siempre), `kit_confiado` (pinea + manda una
    confirmación corta redactada por el propio agente, SIN repetir precio para no pisar el filtro
    `kit_recien_confirmado` de `Parsear Sub-preguntas`), `candidatos` (2-3 kits posibles → repregunta
    nombrando las opciones, no pinea nada), `ninguno` (no es ninguno de los kits → mismo camino de
    siempre, sin pin). El parser (`Parsear Identificar Necesidad`) revalida cualquier `kit_id`/
    `candidatos` contra la lista real de kits activos — nunca confía un id que el modelo haya
    podido inventar.
  - El pin en sí NO usa un nodo Redis nuevo: `kit_confiado` arma un input sintético
    (`{ kit_pineado_raw: JSON.stringify({kit_id, kit_nombre}) }`) y lo conecta como una SEGUNDA
    entrada al nodo `Parsear Kit Pineado` ya existente (mismo patrón que ya usa `Enviar Saludo Kit`
    con 2 orígenes) — así todo lo que hay río abajo (`Refrescar Kit Pineado` hace el SET real en
    Redis, `Extraer Pregunta Compatibilidad`, `Preparar Contexto Sub-preguntas`, etc.) se reusa
    sin duplicar lógica ni tocar ningún `$('Nodo').item` existente.
  - Validado contra producción real (conv 1, `send.js` con distintos teléfonos sintéticos para
    garantizar pin limpio por caso, ver `respuestas_pendientes` para el resultado en vez de
    `/executions`): `"Cuanto vale el kit 220 varillero?"` → `kit_confiado` (Kit 3, KIT POTENCIADO
    220cc) → `"Dale, el kit potenciado 220cc varillero, ¿no?"` + a los 17s el precio real
    (`$199.000`) por el camino de siempre; `"Quiero potenciar mi 110, tenes algo?"` → también
    `kit_confiado` (Kit 1, resolvió con confianza en vez de repreguntar — válido, el nombre del kit
    coincide); `"Tenes cadena para una 200cc?"` → `ninguno`, siguió el camino normal de
    sub-preguntas sin pin, no encontró dato en conocimiento libre, y no volvió a escalar porque la
    conversación de prueba YA tenía una pendiente sin_match vieja sin resolver (comportamiento
    de dedupe existente, no tocado por este fix); saludo puro sigue igual.
  - **Gotcha nuevo de esta sesión**: además del atraso de `/executions` ya conocido, un `PUT` de
    workflow durante horario NO comercial (`bot_estado.encendido = false`) hace que las respuestas
    se encolen en `respuestas_pendientes` en vez de salir al instante — verificar SIEMPRE
    `bot_estado`/`bot_horario` antes de asumir que un cambio rompió el envío. En esta sesión eso
    generó una falsa alarma que llevó a un rollback innecesario (revertido y reaplicado sin
    problema, ver backup + script) — antes de revertir por "no contesta", confirmar contra
    `respuestas_pendientes`/`preguntas_sin_match_pendientes`, no solo contra Chatwoot en vivo.

- **Feat "Repreguntar Modelo" — no perder al cliente que contesta solo la cilindrada** (2026-08-18,
  `apply-feat-repregunta-modelo.mjs`). Diagnosticado en la conversación real 2109 (+5493725464840):
  el saludo de cualquier kit siempre termina preguntando "¿para qué moto lo estás buscando?", y muy
  seguido el cliente contesta solo la cilindrada ("110", "125") sin marca ni modelo puntual.
  `Extraer Pregunta Compatibilidad` ya detectaba bien esto (`es_compatibilidad: true`,
  `modelo_moto: ""` a propósito, sin inventar), pero `¿Es Compatibilidad Con Modelo?` exige un
  modelo real para entrar a la rama que sabe leer el `detalle` del kit — sin eso, el mensaje caía en
  el balde genérico "otro" del partidor de sub-preguntas (Fase 6), que no supo qué hacer con una
  respuesta de una sola palabra y terminaba escalando a un humano en vano.
  - `Extraer Pregunta Compatibilidad` (agente existente) se amplió: ahora separa `cilindrada`
    (genérico, ej. "110") de `modelo_moto` (marca + modelo puntual), y se simplificó la regla de
    `resto_mensaje` — ya no deja pegado el mensaje completo cuando no hay modelo, siempre saca
    únicamente la frase de compatibilidad/cilindrada (antes tenía una excepción para eso que
    complicaba mezclar esta pregunta con otras en la misma ráfaga).
  - Nodo nuevo `¿Compatibilidad Sin Marca/Modelo?` (IF, determinístico) intercepta ANTES del gate
    existente: `es_compatibilidad=true` Y `modelo_moto` vacío. Si hay modelo, o si no es pregunta de
    compatibilidad, sigue el camino de siempre sin ningún cambio.
  - Si aplica, agente nuevo y chico `Redactar Repregunta Modelo` (DeepSeek, mismo patrón de "IA
    acotada" del resto del workflow) arma UNA pregunta corta pidiendo marca+modelo (usa la
    cilindrada si la hay, ej. "Para una 110, marca y modelo es?"), nunca confirma ni descarta
    compatibilidad, nunca inventa una marca, no saluda. Estilo pedido por el usuario: signo de
    cierre "?" únicamente, nunca el de apertura "¿" (ver [[feedback-bot-preguntas-sin-apertura]] en
    memoria — pendiente aplicar este mismo estilo al resto de los prompts que redactan preguntas).
  - El resto de la ráfaga (envío, ubicación, precio, lo que sea) se resuelve reusando
    `¿Hay Resto Adicional en la Rafaga?` — el mismo nodo que ya cumple esa función en la rama de
    compatibilidad normal, con una segunda entrada (mismo patrón que ya usan `Parsear Kit Pineado` o
    `Enviar Saludo Kit`). No se duplicó lógica nueva para esto.
  - Validado contra producción real (conv 1, `send.js`, tres casos): cilindrada sola ("110") → una
    sola repregunta limpia, sin resto; modelo real ("Zanella ZB 110") → camino de compatibilidad de
    siempre, sin cambios (escaló en silencio porque no hay dato, igual que antes); cilindrada +
    pregunta pegada ("110, hacen envío a Chubut?") → repregunta de modelo enviada Y la pregunta de
    envío resuelta aparte en paralelo, ninguna de las dos se pisó ni se perdió.
  - Diagrama de esta rama puntual (para pensar el diseño antes de aplicar) en
    `n8n-workflows/propuesta-repregunta-modelo.html` — queda como referencia histórica de la
    propuesta, ya implementada.

- **Fix "saludo" repetido a mitad de charla en Identificar Necesidad** (2026-08-18,
  `apply-fix-saludo-identificar-necesidad.mjs`), encontrado auditando en vivo dos conversaciones
  reales (+5493513792356 conv 2104, +5493516222737 conv 2108) y reproduciendo variantes en la
  conversación de prueba: `Identificar Necesidad` (Fase del 17/8) define `"saludo"` como "interés
  genérico sin pedido concreto" sin distinguir si es el primer mensaje de la charla o no. Una
  reacción corta del cliente a mitad de conversación (probado con "genial", después de que el bot
  ya le había contestado una pregunta) también encaja en esa definición, y dispara `Enviar Saludo
  Generico` — el cliente recibe de nuevo "Hola bro! En qué te podemos ayudar?" como si el bot se
  hubiera olvidado de toda la charla. Rompe la regla ya arreglada el 2026-08-14 ("Fix saludo a
  mitad de charla") en los otros 3 nodos de IA del workflow — `Identificar Necesidad` se creó
  después y nunca la heredó.
  - Fix acotado: se agregó al bullet `"saludo"` del prompt la aclaración de que solo aplica si es
    el primer mensaje real de la charla (historial vacío o sin ningún "Nosotros:" todavía) — con
    charla ya en curso, una reacción corta sin pedido nuevo pasa a `"ninguno"`. Solo texto de
    prompt, no toca lógica ni conexiones.
  - Validado contra producción real (conv 1, teléfono sintético +5493500011122, reproduciendo la
    secuencia real: pregunta de cubierta contestada → "genial"): antes del fix, `Identificar
    Necesidad` devolvía `tipo: "saludo"` y el bot reenviaba el saludo genérico al cliente; después
    del fix, devuelve `tipo: "ninguno"`, entra al partidor de sub-preguntas (Fase 6) que devuelve
    `partes: []` (no hay nada que resolver ni preguntar), y la ejecución termina ahí sin mandarle
    nada al cliente ni generar ruido al equipo.
  - El mismo par de conversaciones reales destapó un segundo bug, distinto y ya resuelto más abajo
    ("Feat categoría cierre"): cuando SÍ hay contenido pero no es una pregunta (ej. "A la tarde me
    llegó", "tengo que dejarte una seña"), el partidor de sub-preguntas escalaba con una nota
    engañosa. Ver esa entrada para el detalle.

- **Feat categoría "cierre" en el partidor de sub-preguntas** (2026-08-18,
  `apply-feat-categoria-cierre.mjs` + `apply-fix-categoria-cierre-whitelist.mjs`), pedido explícito
  de Martín sobre el bug de arriba: cuando el cliente escribe un comentario afirmativo que no pide
  nada (ej. "A la tarde me llegó", "la semana que viene les aviso", "más tarde veo", "gracias",
  "dale"), en vez de escalar al equipo con una nota engañosa (`"El cliente preguntó algo que
  todavía no supimos ubicar..."` — pero no hubo ninguna pregunta), el bot contesta directo con un
  cierre corto fijo y no molesta a nadie.
  - Se agregó `"cierre"` como quinta categoría (junto a `precio`/`envio`/`negocio`/`otro`) en el
    prompt de `Dividir y Etiquetar Sub-preguntas` (Fase 6), con una exclusión explícita a pedido de
    Martín: cualquier cosa que suene a intención de pago/reserva/retiro (ej. "te dejo una seña",
    "quiero reservarlo", "paso a buscarlo mañana") NO es `"cierre"` — sigue como `"otro"` y escala
    normal, porque ahí sí puede hacer falta una acción nuestra. Límite confirmado con Martín antes
    de aplicar.
  - `Consolidar Dato Resuelto` (Code node que decide qué dato usar según la categoría) suma una
    rama nueva: si `categoria === 'cierre'`, usa directo el texto fijo `"Dale, cualquier cosa nos
    escribís."` sin buscar nada — sigue el mismo camino de redacción/envío de siempre (resuelto en
    el momento, nunca escala). No se tocaron conexiones ni se agregaron nodos.
  - **Gotcha encontrado validando** (para no repetirlo): el primer intento pareció no funcionar —
    ni siquiera el ejemplo más obvio (`"Gracias!"`, mensaje aislado, sin nada más en la charla)
    salía clasificado como `"cierre"`, siempre `"otro"`. La causa no era el prompt de IA (que
    estaba bien) sino un nodo intermedio pasado por alto: `Parsear Sub-preguntas` (el Code node que
    interpreta el JSON de la IA) tiene su **propia lista blanca hardcodeada** de categorías válidas
    (`['precio', 'envio', 'negocio', 'otro']`) — cualquier categoría fuera de esa lista se pisa en
    silencio a `'otro'` antes de llegar a `Consolidar Dato Resuelto`. Faltaba agregar `'cierre'`
    ahí también. Lección: al sumar una categoría nueva a un prompt de clasificación de este
    workflow, revisar también el/los Code node(s) que parsean esa salida por si tienen su propia
    validación de valores permitidos — no alcanza con tocar solo el prompt.
  - Validado contra producción real (conv 1, teléfonos sintéticos distintos por caso): `"Gracias!"`
    aislado → `categoria: "cierre"` → `"Dale, cualquier cosa nos escribís."` enviado, sin escalar;
    `"A la tarde me llego"` (repitiendo el caso real de la conv 2104) → mismo resultado; `"Bueno
    hermano tengo que dejarte una sena para que melo guardes"` (repitiendo el caso real de la conv
    2108) → siguió clasificando `"otro"` y escalando como antes, confirmando que el límite de
    pago/reserva se respeta.

- **Fix "confirmación antes de tiempo" en Identificar Necesidad** (2026-08-18,
  `apply-fix-confirmacion-antes-de-tiempo.mjs`), encontrado auditando en vivo la conv 2119
  (+5493813657644, contacto Mauricio Villa): primeros mensajes de la charla, sin kit pineado
  todavía: *"Que kit me recomendas para ponerle a una honda stomr"* + *"Yo la tengo echa 150 pero
  quiero agrandarla mas"*. `Identificar Necesidad` cruzó "150"+"agrandar" con el alias "potenciar
  150" del Kit 3 (KIT POTENCIADO 220cc) y confió el kit -- pero el propio mensaje también nombraba
  una moto puntual ("honda stomr") de la que no hay NINGÚN dato (ni compatible ni incompatible, ni
  en `compatibilidades` ni en el `detalle` del kit). El cliente terminó recibiendo DOS mensajes
  dando el kit por bueno mientras la única pregunta que de verdad importaba (¿anda en esa moto?)
  escalaba en silencio y quedaba sin responder:
  1. `Enviar Confirmacion Kit (Propuesta)`: *"Dale, para agrandar la 150 te conviene el kit
     potenciado 220cc, ¿no?"* -- se manda apenas se identifica el kit, sin esperar a que corra el
     chequeo de compatibilidad (rama paralela, sin conexión entre ambas).
  2. La categoría "otro" del partidor de sub-preguntas (Fase 6) también contestó usando el
     `detalle` del kit (*"Para agrandarla más... Ese es el que te sirve"*), en paralelo, sin saber
     que la pregunta de compatibilidad de al lado seguía sin resolver.
  - Regla acordada con Martín: cuando el mensaje nombra una moto puntual (no solo la cilindrada) Y
    no hay NINGÚN dato de esa moto, el bot no debe asumir ningún kit -- se frena ahí (no manda ni
    la confirmación, ni ninguna respuesta que asuma que el kit sirve; solo queda la escalada
    privada, que ya funcionaba bien). En cualquier otro caso -- no nombra moto, o SÍ hay dato
    (compatible o no) -- sigue exactamente igual que antes.
  - **Cambio 1 (confirmación):** se sacó la conexión directa e inmediata `¿Qué Identificó?` →
    `Enviar Confirmacion Kit (Propuesta)`. Nodo nuevo `Chequear Confirmacion Pendiente` (mismo
    patrón try/catch que ya usa `kit_recien_confirmado`, para distinguir esta ejecución -- que
    viene de "Identificar Necesidad" -- del camino viejo de "kit ya pineado de antes", que reusa
    los mismos nodos de compatibilidad pero nunca tuvo este paso) conectado desde los 4 puntos de
    salida del chequeo de compatibilidad donde SÍ corresponde confirmar (no es pregunta de
    compatibilidad / cilindrada sola sin marca / ya hay dato confirmado / el `detalle` resuelve) →
    `¿Debe Confirmar Kit?` (IF) → confirma o no. El quinto punto de salida (`¿Detalle Resuelve
    Compatibilidad?` en `false`, osea `compatible: null`, sin dato) queda sin conectar a
    propósito -- ese es exactamente el caso a frenar.
  - **Cambio 2 (respuesta "otro"):** `Preparar Contexto Sub-preguntas` ahora expone
    `compat_modelo_pendiente` (true si el mensaje nombra una moto puntual -- esto se sabe de
    inmediato, sin esperar a que se resuelva, así que no hay condición de carrera). `Consolidar
    Dato Resuelto` ya no usa el `detalle` del kit para la categoría "otro" cuando esa bandera está
    prendida -- sigue probando `conocimiento_libre` como siempre, y si tampoco hay nada ahí escala
    en silencio a `preguntas_sin_match_pendientes` (mismo camino de siempre, nada se pierde). Esto
    aplica en cualquier caso con una moto puntual mencionada (se resuelva o no la compatibilidad),
    no solo cuando el kit se acaba de identificar -- evita que la respuesta genérica compita con la
    respuesta específica de compatibilidad en cualquier escenario, incluyendo el camino viejo de
    "kit ya pineado de antes".
  - Nada más se toca: sin moto puntual, o con dato (compatible o no), la confirmación sigue
    mandándose igual que antes -- solo un poco más tarde (espera al chequeo de compatibilidad, que
    de todos modos ya corría siempre en esa rama), sin cambio de contenido.
  - **Pendiente relacionado, no resuelto en este fix:** cuando la compatibilidad se resuelve como
    `false` (confirmado incompatible), la confirmación del kit igual se manda -- puede leerse
    contradictorio ("te conviene X" seguido de "no, X no es compatible"). Ya pasaba antes de este
    fix (la carrera lo tapaba a veces); no se tocó porque Martín pidió específicamente el caso "sin
    dato", no el caso "incompatible confirmado" -- queda para charlar si también hace falta
    ajustarlo.
  - Validado contra producción real (conv 1, `send.js`, tres casos, limpiando después los IDs
    sintéticos de `preguntas_tecnicas_pendientes`): repitiendo el caso real (moto puntual sin
    dato, sin resto) → sin confirmación, sin respuesta "otro", escalada privada correcta, kit
    sigue pineado para el resto de la charla; mismo caso + pregunta "otro" pegada en la misma
    ráfaga (*"contame bien que trae el combo"*) → sin confirmación, la "otro" cayó a `SIN_DATO` en
    vez de usar el `detalle` del kit y escaló en silencio a `preguntas_sin_match_pendientes` (nada
    se perdió); control sin pregunta de compatibilidad (*"Cuanto vale el kit 220 varillero?"*) →
    confirmación enviada normal, sin cambios (*"Dale, el kit potenciado 220cc varillero, ¿no?"*).

- **Fix "no confirmar si se confirma incompatible"** (2026-08-18,
  `apply-fix-no-confirmar-si-incompatible.mjs`), segunda parte del fix anterior, a pedido explícito
  de Martín: el fix de arriba solo frenaba la confirmación cuando NO había ningún dato de la moto
  (`compatible: null`). Pero cuando la compatibilidad se resuelve como NO compatible
  (`compatible: false`), la confirmación ("te conviene el kit X, ¿no?") igual se mandaba -- quedaba
  contradictoria con la respuesta real ("No, el kit no es compatible con tu [moto]") que sale por
  el mismo camino.
  - **Cambio 1:** nodo nuevo `¿Es Realmente Compatible?` (IF, `compatible === true`) insertado
    entre los dos puntos que antes alimentaban `Chequear Confirmacion Pendiente` con solo "¿hay
    dato?" (`¿Hay Dato de Compatibilidad?` y `¿Detalle Resuelve Compatibilidad?`, ambos en su salida
    `true` -- que dispara con dato sea `true` o `false`) y el nodo de confirmación. Solo si el valor
    real es `true` sigue a `Chequear Confirmacion Pendiente`; si es `false` (confirmado
    incompatible) termina en `Fin - Incompatible, No Confirma Kit` sin confirmar nada.
    `Preparar Respuesta Compatibilidad` no se toca -- sigue mandando la respuesta real por el mismo
    camino de siempre en ambos casos.
  - **Cambio 2 (texto):** `Preparar Respuesta Compatibilidad` cambió la rama "no compatible" de
    *"No, el kit no es compatible con tu X"* a *"No, este kit no es compatible con tu X. Cualquier
    otra consulta nos escribís."* -- a propósito dice "este kit" y no "no tenemos nada para tu
    moto": el bot solo chequea el kit pineado, nunca compara contra el resto del catálogo, así que
    no puede prometer que no hay ninguna opción sin arriesgarse a estar equivocado (podría haber
    otro kit que sí ande). Decidido así con Martín tras comentarlo antes de aplicar.
  - Validado contra producción real (conv 1, tres casos con el Kit 3 pineado, usando su propio
    `detalle` que lista "brezza 150" como incompatible y "skua 150" como compatible): *"...mi moto
    que es una brezza 150?"* → *"No, este kit no es compatible con tu brezza 150. Cualquier otra
    consulta nos escribís."*, sin ninguna confirmación de kit; *"...mi moto que es una skua 150?"*
    → *"Sí, el kit es compatible con tu skua 150."* + confirmación normal (*"Dale, el kit
    potenciado 220cc..."*), sin cambios; el caso "sin dato ninguno" (fix anterior) sigue igual,
    revalidado de paso.

- **Fix "plantilla repetida manda el mismo saludo varias veces"** (2026-08-18,
  `lib/chatwoot-bot.ts`, función `encolarRespuesta` — cambio de app, no de workflow),
  encontrado revisando en vivo la conv 2017 (+5493873509571): el cliente mandó la plantilla
  exacta del Kit 8 (o el saludo genérico) **5 veces en 4 días distintos**, siempre fuera de
  horario. Cada vez que llega, el workflow manda la respuesta a `/api/chatwoot/enviar`, que con
  el bot apagado la encola en `respuestas_pendientes` — pero `encolarRespuesta` insertaba una
  fila nueva sin chequear si ya había una idéntica esperando. Quedaron 4-5 filas con el mismo
  texto ("Hola como va! el combo de TAPA CDI...") pendientes en simultáneo. Al prender el bot,
  el despachador (`despacharCola`, FIFO por toda la cola, no por conversación) las fue mandando
  una por una — intercaladas con mensajes de otras conversaciones, así que llegaron separadas
  por varios minutos en vez de todas juntas, pero el cliente terminó recibiendo el mismo saludo
  4 veces seguidas entre las 12:22 y las 12:35.
  - Causa: nada relacionado con el matching de plantillas ni con el pin de kit en Redis (que
    sigue sin tocarse) — el bug vive enteramente en la cola de la app, no en el workflow de
    n8n. Por eso el fix no toca `s7EpPTjNFy6iCclg`.
  - Fix acotado: `encolarRespuesta` ahora busca primero si ya existe una fila `pendiente` o
    `enviando` para la misma `conversation_id` con el mismo `contenido` exacto; si la hay,
    devuelve ese `id` sin insertar una nueva. No mira lo que ya se mandó (`estado = 'enviado'`)
    a propósito — alcanza con no duplicar lo que todavía está esperando salir, y así no hace
    falta decidir una ventana de tiempo arbitraria para "ya lo saludé hace poco".
  - Validado con un caso sintético contra la base real: fila de prueba `pendiente` con
    `conversation_id`/`contenido` fijos, misma consulta de deduplicación repetida → encuentra el
    `id` existente en vez de crear uno nuevo. Fila de prueba borrada después.

- **Fix "recorrido" del motor confundido con "envío"** (2026-08-18,
  `apply-fix-recorrido-no-es-envio.mjs`), encontrado auditando en vivo la conv 2120
  (+5492302395815): justo después de decirle al cliente que el kit no es compatible con su
  Yamaha Crypton Classic, escribió *"La verdad con el recorrido / Me mataste"* — un comentario
  sin pedir nada concreto, probablemente sobre lo confuso del precio corto/largo. `Dividir y
  Etiquetar Sub-preguntas` lo clasificó como categoría `"envio"` (asociación semántica con
  "recorrido/ruta de entrega") y el bot le contestó la política de envíos — una respuesta
  totalmente fuera de tema, justo después de la mala noticia de la compatibilidad.
  - Fix acotado: el bullet de `"envio"` en el prompt ahora exige mención explícita a
    entrega/mandar/llegar a algún lado, y aclara que "recorrido" en este negocio es casi
    siempre el recorrido del pistón del motor (dato técnico del kit, corto/largo) — nunca
    cuenta como pregunta de envío. Solo texto de prompt, no toca lógica ni conexiones.
  - Esta conversación (2120) es del mismo día que los fixes "confirmación antes de tiempo" y
    "no confirmar si incompatible" de más arriba, pero ocurrió *antes* de que esos dos se
    publicaran (13:27-13:37 UTC vs. 15:25 y 16:02 UTC) — los otros dos problemas que se vieron
    en esa charla (confirmar el kit sin saber si compatibiliza, y el texto viejo de "no
    compatible" sin el cierre) ya estaban cubiertos por esos fixes y no hizo falta tocar nada
    más para ellos.
  - Validado contra producción real (conv 1, `send.js`): plantilla del Kit 8 (pin) + *"La
    verdad con el recorrido, me mataste"* → antes de este fix hubiera salido `categoria:
    "envio"`; con el fix salió `categoria: "otro"`, y como el `detalle` del Kit 8 ya menciona
    el tema recorrido corto/largo, hasta encontró una respuesta relevante ("el kit es para 110
    chinos de recorrido corto; si la moto es de recorrido largo, existe la opción de cilindro
    largo...") en vez de la respuesta de envíos fuera de tema.

- **Fix orden confirmación vs. respuesta directa** (2026-08-18,
  `apply-fix-orden-confirmacion-directa.mjs`), encontrado auditando en vivo la conv 2129
  (+5493549539614, contacto Agus Lb): escribió *"Hola bueno día amigo una pregunta que sale el
  kit ese 120 con tapa cdi"* — nombra el kit y pregunta precio en el mismo mensaje, sin plantilla
  exacta ni kit pineado de antes. `Identificar Necesidad` (feat del 17/8) lo resolvió como
  `kit_confiado` (Kit 8) y armó su confirmación corta *"Dale, el combo de tapa CDI + cilindro 120
  con la corona de regalo, ¿no?"* (a propósito sin precio, ver nota de la Feat original más
  arriba). En paralelo, el partidor de sub-preguntas (Fase 6) categorizó la pregunta como
  `"precio"` y redactó la respuesta real. Sin ningún orden garantizado entre las dos ramas
  paralelas, el precio (sin mención de ningún kit) le llegó al cliente ANTES que la confirmación
  del nombre del kit — mismo patrón de bug que "precio redundante y orden" (14/8), pero
  `Identificar Necesidad` nunca heredó esa protección de orden.
  - Por qué no se reusó directamente el tronco `Chequear Confirmacion Pendiente` → `¿Debe
    Confirmar Kit?` → `Enviar Confirmacion Kit (Propuesta)`: ese tronco es compartido por otros
    dos orígenes (`¿Compatibilidad Sin Marca/Modelo?` — cilindrada sola — y `¿Es Realmente
    Compatible?` — compatibilidad ya resuelta). Encadenar `Preparar Contexto Sub-preguntas` a la
    salida de ese tronco compartido lo habría disparado una segunda vez en el camino de `¿Es
    Realmente Compatible?` (que ya lo dispara aparte, vía `¿Hay Resto Adicional en la Rafaga?`,
    para el resto de la ráfaga) — duplicando la respuesta en ese caso.
  - Fix: se clonaron los 3 nodos (`Chequear Confirmacion Antes de Sub-pregunta`, `¿Debe Confirmar
    Antes de Sub-pregunta?`, `Enviar Confirmacion Antes de Sub-pregunta`) como tronco **privado**,
    usado solo por la rama `¿Es Compatibilidad Con Modelo?` (false) — la única de las tres
    involucrada en el caso real. Esa rama ahora pasa primero por el chequeo/envío de confirmación
    y recién después sigue a `Preparar Contexto Sub-preguntas`, en las dos salidas (se confirmó o
    no hacía falta). Las otras dos ramas (cilindrada sola, compatibilidad resuelta) siguen usando
    el tronco original sin ningún cambio.
  - Validado contra producción real (conv 1, teléfono sintético +5493500099901 para garantizar
    pin limpio): repitiendo el caso real (*"...pregunta que sale el kit ese 120 con tapa cdi"*)
    → confirmación (*"Dale, el combo de tapa CDI + cilindro 120, ¿no?"*, msg 13602) enviada 11
    segundos antes que el precio (msg 13603) — orden correcto; caso de regresión con el mismo Kit
    8 ya pineado y una pregunta sin compatibilidad (*"Y hacen envíos a Córdoba capital?"*) → pasó
    por el chequeo privado, `debe_confirmar: false`, sin confirmación espuria, respuesta de envío
    normal — confirma que el camino más común (kit ya pineado de antes) no cambió de
    comportamiento.
  - **Pendiente relacionado, no resuelto en este fix:** la rama `¿Compatibilidad Sin
    Marca/Modelo?` (cilindrada sola, feature "Repreguntar Modelo" del 18/8) tiene la misma carrera
    de 3 vías en paralelo — repregunta de modelo, resto de la ráfaga, y confirmación de kit — sin
    reproducirse todavía en una conversación real. Si aparece un caso concreto, aplicar el mismo
    patrón (tronco privado) ahí también.
  - **Superado el mismo día** por la feat "Bienvenida con foto en vez de confirmación" (más
    abajo): los 3 nodos privados de este fix (`Chequear Confirmacion Antes de Sub-pregunta`, `¿Debe
    Confirmar Antes de Sub-pregunta?`, `Enviar Confirmacion Antes de Sub-pregunta`) y el tronco
    compartido original (`Chequear Confirmacion Pendiente`, `¿Debe Confirmar Kit?`, `Enviar
    Confirmacion Kit (Propuesta)`) se borraron por completo — ya no hace falta "confirmar" con un
    texto aparte, la bienvenida con foto que se manda ahora cumple ese rol. Se deja esta entrada
    como historial de por qué se llegó al diseño nuevo, no como estado vigente.

- **Feat "Bienvenida con foto en vez de confirmación" en Identificar Necesidad** (2026-08-18,
  `apply-feat-bienvenida-identificar-necesidad.mjs`), pedido explícito de Martín charlado antes de
  aplicar, a partir del mismo caso de la conv 2129: cuando `Identificar Necesidad` confirma un kit
  detectado por lenguaje natural (sin plantilla exacta), en vez de un texto corto redactado por IA
  (*"Dale, el combo de tapa CDI..., ¿no?"*) ahora manda la MISMA bienvenida con foto que ya usan
  las plantillas exactas (`mensaje_bienvenida` + `foto_url` de `kits_publicidad`) — un solo mensaje
  rico en vez de confirmación + respuesta aparte, para cualquier kit.
  - **Alcance confirmado con Martín:** aplica a las 3 ramas donde `Identificar Necesidad` confirma
    un kit — pregunta directa, cilindrada sola, y compatibilidad ya resuelta con una moto nombrada.
  - **Precio:** como la bienvenida ya trae el precio completo, la categoría `"precio"` del partidor
    de sub-preguntas (Fase 6) se suprime cuando la bienvenida se acaba de mandar en esta misma
    ejecución — mismo criterio que ya usan las plantillas exactas (`kit_recien_confirmado`), ahora
    extendido para reconocer también este nuevo origen.
  - **Repregunta de modelo:** como la bienvenida ya termina preguntando "¿para qué moto lo estás
    buscando?", la repregunta puntual de marca/modelo (feat del 18/8, "Repreguntar Modelo") se
    suprime cuando la bienvenida se acaba de mandar en esta misma ejecución. Si el kit ya estaba
    pineado de una conversación más vieja (sin bienvenida recién mandada), la repregunta sigue
    funcionando igual que antes — ahí sí hace falta preguntar.
  - **Por qué se clona `Enviar Saludo Kit` en vez de reusarlo directo:** ese nodo es compartido por
    los 2 orígenes de plantilla exacta (sin resto / con resto del mismo tema) y sus salidas fijas
    (`Fin - Saludo Kit Enviado`, `Marcar Kit Pineado`) asumen esos orígenes — agregarle una tercera
    salida hacia `Extraer Pregunta Compatibilidad` habría roto el camino de plantilla exacta "sin
    resto" (99% de los casos), que hoy termina justo después del saludo. Se creó un HTTP Request
    clonado (`Enviar Saludo Kit (Identificar Necesidad)`) con salida propia, encadenado ANTES de
    `Extraer Pregunta Compatibilidad` para garantizar orden determinista (mismo principio que la
    Fase 10: "el saludo siempre sale antes que cualquier otra respuesta").
  - **Nodos nuevos:** `¿Es Kit Recien Identificado?` (code, chequea si `Preparar Pin desde
    Identificacion` corrió en esta ejecución) → `¿Viene de Identificar Necesidad?` (if) → si sí:
    `Buscar Bienvenida Kit Identificado` (code, busca `mensaje_bienvenida`/`foto_url` del kit
    identificado dentro de la lista que ya trajo `Buscar Kits Activos`, sin query nueva) → `Enviar
    Saludo Kit (Identificar Necesidad)` → `Extraer Pregunta Compatibilidad` (mismo nodo de
    siempre). Si no (kit ya pineado de antes): directo a `Extraer Pregunta Compatibilidad`, cero
    cambios. Mismo patrón de chequeo (`¿Es Kit Recien Identificado (Modelo)?` → `¿Repregunta Modelo
    Necesaria?`) insertado antes de `Redactar Repregunta Modelo` para la rama de cilindrada sola.
  - **Gotcha aplicado de una:** `Extraer Pregunta Compatibilidad` leía `{{ $json.kit_nombre }}`
    (atajo sin nombre de nodo) en su prompt, asumiendo que su entrada directa siempre traía ese
    campo — cierto para el camino viejo (`Parsear Kit Pineado` directo), pero no para el nuevo
    (`Enviar Saludo Kit (Identificar Necesidad)` devuelve la respuesta HTTP de Chatwoot, sin
    `kit_nombre`). Se cambió a `{{ $('Parsear Kit Pineado').item.json.kit_nombre }}` explícito,
    válido para cualquiera de los dos orígenes — mismo error ya documentado en el gotcha de
    "precio redundante y orden" (14/8), atajado esta vez antes de publicar en vez de después.
  - **Nodos borrados** (huérfanos tras este cambio, ya no hace falta "confirmar" aparte): `Chequear
    Confirmacion Pendiente`, `¿Debe Confirmar Kit?`, `Enviar Confirmacion Kit (Propuesta)`, `Fin -
    Sin Confirmar Kit`, `Fin - Confirmacion Kit Enviada`, y los 3 nodos privados del fix de orden
    de más arriba.
  - Validado contra producción real (conv 1, `send.js`, teléfonos sintéticos frescos por caso):
    - Rama directa (repitiendo el caso real, *"...pregunta que sale el kit ese 120 con tapa
      cdi"*) → un solo mensaje: bienvenida con foto y los dos precios, `kit_recien_confirmado:
      true`, `partes: []` (precio suprimido, no se mandó nada aparte).
    - Rama cilindrada sola (*"tenes el kit de tapa cdi 120? Es para una 110"*) → bienvenida con
      foto, sin repregunta de modelo duplicada; el resto de la ráfaga (la mención al kit, ya
      contestada por la bienvenida) escaló solo en silencio como `otro` sin dato — comportamiento
      esperado, no relacionado con este fix.
    - Rama compatibilidad ya resuelta (*"tenes el kit de tapa cdi 120? Ando en una Gilera
      Nevada"*) → bienvenida con foto primero (msg 13623), respuesta de compatibilidad después
      (msg 13625, *"Sí, el kit es compatible con tu Gilera Nevada, para recorrido corto."*) — orden
      correcto, sin confirmación de por medio.
    - Regresión (kit ya pineado de una conversación vieja + pregunta de compatibilidad con un
      modelo confirmado, *"Y una Zanella zb 110 del 2019 le entra?"*) → camino de siempre sin
      ningún cambio: sin bienvenida repetida, respuesta de compatibilidad directa desde
      `compatibilidades`.

## Qué falta / pendiente (al 2026-08-14, revisar si sigue vigente)

- **Cargar el tema `garantia`** en `/admin/chatwoot/conocimiento` — hoy no tiene datos, así que
  cualquier pregunta de garantía escala en vez de contestarse sola.
- **Kit 8 (combo TAPA CDI + CILINDRO 120) sigue con precio ambiguo.** Su campo `precio` tiene dos
  valores en el mismo texto ("recorrido corto $175.000 — recorrido largo $189.000"). El fix
  precio-sin-detalle (arriba) sacó la instrucción de "preguntale al cliente" que arrastraba, pero
  el precio en sí sigue siendo doble — no se charló todavía con el usuario si conviene separarlo
  en dos kits, dejar un solo precio "desde", o escalar cuando el precio tiene más de un valor.
- **Caso real sin resolver: contacto +5492954875916 (conv 1900 en Chatwoot), 2026-08-13.**
  Escribió la plantilla exacta del Kit 8 + "que valen" ANTES de que se aplicara la Fase 10 (el fix
  no reprocesa conversaciones viejas), así que quedó una nota privada sin contestar en esa
  conversación (mensaje 12184, "El cliente preguntó algo que todavía no supimos ubicar..."). Hay
  que entrar a Chatwoot y responderla a mano — el ciclo de aprendizaje de Fase 7 recién se activa
  cuando alguien contesta esa nota.
- **Caso real sin responder: contacto +5493815116333 (conv 1965 en Chatwoot), 2026-08-14.**
  Preguntó por el Kit 1 y contestó "Tengo una Zanella due 110" / "2025" a la pregunta del bot, y
  se quedó sin respuesta (ver fix arriba). Hay que entrar a Chatwoot y contestarle a mano.
- **Caso real sin corregir: contacto +5493856217036 (conv 1910 en Chatwoot), 2026-08-13/14.**
  Por el bug de `rm_modelo_ok` (ver fix arriba), recibió "Sí, es compatible" para su Yamaha
  Crypton 110 cuando en realidad el Kit 8 NO es compatible (el propio `detalle` del kit lo dice
  explícito). Hay que entrar a Chatwoot y corregirlo a mano.
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
