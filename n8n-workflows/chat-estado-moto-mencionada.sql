-- Estado persistente del bot-agente: recordar la moto que el cliente NOMBRÓ,
-- aunque nunca haya pasado por consultar_compatibilidad.
--
-- `moto_confirmada` guarda la moto que YA se validó contra una fila de compat.
-- No alcanza: en la conv 4206 (15/09) el cliente dijo "Una 110 DLX" en un turno
-- y preguntó otra cosa en el siguiente. Los dos controles que impiden afirmar
-- sobre la moto del cliente miran solo el mensaje del turno actual (el aviso de
-- `catalogo-precios.ts` y el BACKSTOP DE LA MOTO de `motor.ts`), así que
-- ninguno vio nada y el bot contestó "Para la 110 DLX tenemos estas opciones",
-- ofreciéndole el kit dakar 200 y el 220.
--
-- A diferencia de `moto_confirmada`, esta columna NO se revierte cuando un
-- turno se descarta: es un dato que puso el cliente, no una afirmación nuestra
-- de "esto ya se lo dijiste".
--
-- Correr con: node scratch/correr-sql.js n8n-workflows/chat-estado-moto-mencionada.sql

ALTER TABLE chat_conversacion_estado
    ADD COLUMN IF NOT EXISTS moto_mencionada text;
