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
   (`kit_pineado:{teléfono}`, TTL 12hs) para que las siguientes preguntas de esa conversación
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
   de texto amplio; reusar la conversación de prueba en vez de inventar IDs.
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
