-- ============================================================================
-- Situacion `duda_confianza`: el que pide REFERENCIAS.
--
-- Conv 4337 (16/09, +5493813387901). El cliente venia de preguntar "Se lo paga
-- cuando recien llega?" (pago contra entrega, o sea: todavia no nos conoce). El
-- bot le contesto bien el "no" y en el mensaje siguiente el cliente escribio
-- una sola palabra: "Referencia?". Estaba pidiendo pruebas de que existimos
-- —reseñas, clientes, redes— y el bot no lo entendio: contesto "Referencia de
-- que, bro? Del repuesto o para hacer el pago?" y le devolvio la pelota justo
-- en el momento en que habia que darle confianza. Cero herramientas ejecutadas
-- en ese turno.
--
-- El dato ya estaba cargado (info_negocio fila `garantia`: local, Maps,
-- Instagram, TikTok, Mercado Libre) y `SINONIMOS_CONFIANZA` ya mapea
-- "referencia" a esa fila. Lo que faltaba era el disparador: sin el, la
-- situacion no se inyecta y el modelo nunca llama a la herramienta.
--
-- Correr:  node scratch/correr-sql.js n8n-workflows/chat-situaciones-referencias.sql
-- ============================================================================
UPDATE chat_situaciones
SET disparadores = ARRAY[
      'es estafa','no es estafa','como se que es seguro','como confio','es seguro comprar',
      'me da desconfianza','como se que no me estafan','tienen instagram','instagram','tiktok',
      'tik tok','mercado libre','mercadolibre','google maps','pasame el link','sus redes',
      'tienen redes','pagina oficial',
      -- Pide pruebas de que existimos, en criollo (conv 4337)
      'referencia','resena','opinion','recomendacion','testimonio',
      'tienen comentarios','algun comentario','comentarios de clientes',
      'alguien que haya comprado','alguien que te haya comprado','alguien que compro',
      'clientes que compraron','le vendiste a alguien','a quien le vendiste',
      'son confiables','sos confiable','son de fiar','sos de fiar','son serios',
      'como se que existen','prueba de que','me da cosa'
    ],
    instruccion = 'Consulta consultar_info_negocio(tema: "confianza") y responde apoyandote UNICAMENTE en lo que devuelva esa herramienta (ahi estan los pilares reales y los links oficiales). Tono de mostrador, seguro y cercano, sin ponerte a la defensiva. Si el cliente pidio una red o plataforma puntual (instagram, tiktok, maps, mercado libre), pasale SOLO esa; si la duda es general, podes dar los pilares con sus links. Los links se copian caracter por caracter del dato oficial: PROHIBIDO escribir uno de memoria o acortarlo.
PEDIDO DE REFERENCIAS: "referencias?", "tenes reseñas?", "alguien que te haya comprado?", "son confiables?" es esto mismo, aunque no diga la palabra estafa: te esta pidiendo pruebas de que existimos. Contestale con lo que devuelve la herramienta —el local fisico con el Maps (ahi estan las reseñas), el Instagram, el TikTok y nuestra pagina de Mercado Libre con la reputacion y la compra protegida— y no con una pregunta. PROHIBIDO repreguntar "referencia de que?": el que duda y ademas tiene que explicarse, se va. Esto vale doble si en los mensajes anteriores se hablo del pago por adelantado o del envio.
UNICA EXCEPCION: si por el contexto queda claro que habla del numero/referencia de UN PAGO que ya hizo o de un codigo de pieza, no es esta situacion.'
WHERE clave = 'duda_confianza';
