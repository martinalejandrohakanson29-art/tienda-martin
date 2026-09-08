-- Estado persistente del bot-agente: recordar que una consulta de esta charla
-- YA se derivó al equipo y sigue esperando respuesta humana.
--
-- Sin esto, el turno siguiente arrancaba como si nada hubiera pasado: el bot
-- volvía a hablar por encima de una consulta que ya había escalado (conv 3637,
-- 08/09: escaló "escape paolucci para varillero s2", el cliente mandó "??" y
-- el bot contestó sobre otro kit).
--
-- Correr con: node scratch/correr-sql.js n8n-workflows/chat-estado-escalado-pendiente.sql

ALTER TABLE chat_conversacion_estado
    ADD COLUMN IF NOT EXISTS escalado_pendiente_motivo text,
    ADD COLUMN IF NOT EXISTS escalado_pendiente_resumen text,
    ADD COLUMN IF NOT EXISTS escalado_pendiente_en timestamptz;
