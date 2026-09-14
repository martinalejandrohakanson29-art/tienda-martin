-- ============================================================================
-- Situaciones: el cliente que NO CONFIA todavia.
--
-- Conv 4154 (14/09). El cliente ya habia aceptado el precio ("El precio seria
-- 99 mil") y lo unico que faltaba era la moto. Escribio "Lo traen a domicilio y
-- pago aca" y el bot le contesto un "no" correcto y seco: "no trabajamos con
-- pago al recibir, el pago va siempre antes de despachar". El cliente contesto
-- "No gracias paso" y se fue.
--
-- Las dos cosas que fallaron:
--   1. Pedir pago contra entrega NO es una consulta de logistica: es la forma
--      criolla de decir "no te conozco, no te voy a transferir primero". La
--      situacion `duda_confianza` no se activo porque sus disparadores son
--      todos explicitos ("es estafa", "como confio"), palabras que este
--      cliente nunca uso.
--   2. Tenemos el bloque de confianza cargado y sin usar en `info_negocio`
--      (fila `garantia`): local fisico con direccion y Maps, Instagram con
--      +70.000 seguidores, TikTok, comisionista, y sobre todo MERCADO LIBRE
--      con compra protegida, que es exactamente la respuesta al que no se
--      anima a transferir por adelantado.
--
-- Correr:  node scratch/correr-sql.js n8n-workflows/chat-situaciones-confianza-pago.sql
-- ============================================================================
INSERT INTO chat_situaciones (clave, titulo, disparadores, instruccion, activo, orden)
VALUES
  ('pago_contra_entrega',
   'Pide pagar al recibir (contra entrega / contra reembolso)',
   ARRAY['contra entrega','contraentrega','contra reembolso','contrareembolso','pago al recibir','pagar al recibir','pago cuando lo reciba','pago cuando reciba','pago cuando llegue','pago cuando llega','pago cuando me llegue','se paga al recibir','abono al recibir','pago al recibirlo','pago contra','y pago aca','y pago alla','lo traen y pago','me lo traen y pago','pago en el momento de la entrega','pago al momento de recibir','pagar cuando llegue','pagar cuando me llegue'],
   'El cliente esta proponiendo pagar recien cuando recibe la mercaderia. Eso NO es una consulta de logistica: es que todavia no nos conoce y no se anima a transferirle por adelantado a alguien de internet. Contesta las DOS cosas en el mismo turno y en este orden:
1) El dato, derecho y sin pedir disculpas: el pago va siempre antes de despachar, no trabajamos con pago contra entrega ni contra reembolso. Si te falta el detalle de los medios, llama consultar_info_negocio(tema: "pagos").
2) La razon para confiar, en dos o tres renglones: llama consultar_info_negocio(tema: "confianza") y apoyate UNICAMENTE en lo que devuelva. Nombrale el local fisico con su direccion y el link de Google Maps, el Instagram, y sobre todo la salida concreta para el que no quiere pagar primero: puede comprarnos por MERCADO LIBRE con compra protegida desde nuestra pagina oficial (aclarale de paso que por ahi sale un poco mas caro que directo por aca). Si el cliente es de Cordoba, ofrecele ademas pasar por el local o mandar un comisionista a buscarlo.
PROHIBIDO dejar el "no" solo y seco. PROHIBIDO ponerte a la defensiva, justificarte de mas o dar a entender que sospechas de el. PROHIBIDO escribir un link de memoria: se copian caracter por caracter de lo que devuelve la herramienta.',
   true, 12),

  ('rechazo_se_baja',
   'El cliente se baja de la compra ("no gracias paso")',
   ARRAY['no gracias','no me interesa','mejor no','dejalo asi','dejalo ahi','lo dejo','lo dejo ahi','paso por ahora','por ahora paso','ahora no','otra vez sera','sera en otro momento','no era lo que buscaba','me arrepenti','ya no lo quiero','gracias igual','igual gracias','no por ahora','asi no','no va','dejame pensarlo','lo voy a pensar','me lo voy a pensar','despues veo','ya veo mas adelante'],
   'El cliente se esta bajando. Antes de despedirte fijate POR QUE se baja, mirando los mensajes anteriores:
- Si lo ultimo que se hablo fue el pago por adelantado, la seguridad de la compra o la confianza: no es que no quiera el producto, es que no se anima. UN SOLO intento de rescate, corto y sin presion: llama consultar_info_negocio(tema: "confianza") y ofrecele la alternativa concreta que si lo deja tranquilo — comprarlo por Mercado Libre con compra protegida desde nuestra pagina oficial, o pasar por el local / mandar un comisionista si es de Cordoba. Cerra en un renglon, sin presion y SIN repetir dos veces la misma formula ("si te quedas mas tranquilo" va una sola vez en todo el mensaje).
- Si se baja por cualquier otra razon, O si en un mensaje anterior YA le ofreciste esa alternativa: despedida corta y natural, sin reabrir la venta: "Dale, ningun problema! Cualquier cosa nos escribis y coordinamos.".
PROHIBIDO insistir dos veces. PROHIBIDO preguntarle por que se baja. PROHIBIDO inventar descuentos o regalos para retenerlo. PROHIBIDO usar jerga nuestra de oficina: al cliente no se le dice "seguimos a mano", "te sigue un humano" ni "te atiende un agente" — eso no significa nada del otro lado.',
   true, 13)
ON CONFLICT (clave) DO UPDATE
  SET titulo = EXCLUDED.titulo, disparadores = EXCLUDED.disparadores,
      instruccion = EXCLUDED.instruccion, activo = true, actualizado_en = now();
