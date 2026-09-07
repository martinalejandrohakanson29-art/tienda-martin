-- Estado persistente del bot-agente: recordar que un PACK SUELTO (kit sin
-- grupo de variantes, ej. "Kit 170 varillero + leva" ID 11) ya se le presentó
-- al cliente con su ficha y su foto, para no repetir la bienvenida ni reenviar
-- la imagen en los turnos siguientes.
--
-- Correr con: node scratch/correr-sql.js n8n-workflows/chat-estado-pack-presentado.sql

ALTER TABLE chat_conversacion_estado
    ADD COLUMN IF NOT EXISTS pack_presentado_id integer,
    ADD COLUMN IF NOT EXISTS pack_presentado_nombre text,
    ADD COLUMN IF NOT EXISTS pack_presentado_precio numeric;
