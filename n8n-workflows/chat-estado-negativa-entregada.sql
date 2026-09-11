-- Estado persistente del bot-agente: recordar que a ESTA charla ya se le dio la
-- negativa de compatibilidad de una moto para un kit.
--
-- Sin esto la herramienta es sin memoria: mira "moto + kit", devuelve el
-- veredicto de la fila y la guia le ordena al modelo copiar la linea tal cual.
-- El cliente podia contestar cualquier cosa ("ya lo tengo modificado", "no
-- importa, lo compro igual") y se le servia la MISMA negativa palabra por
-- palabra (conv 3874, 10-11/09, Wave NF: "Si ya se ya lo tengo a agrandado los
-- carter todo" -> misma negativa al dia siguiente).
--
-- Correr con: node scratch/correr-sql.js n8n-workflows/chat-estado-negativa-entregada.sql

ALTER TABLE chat_conversacion_estado
    ADD COLUMN IF NOT EXISTS negativa_moto text,
    ADD COLUMN IF NOT EXISTS negativa_kit text,
    ADD COLUMN IF NOT EXISTS negativa_detalle text,
    ADD COLUMN IF NOT EXISTS negativa_en timestamptz;
