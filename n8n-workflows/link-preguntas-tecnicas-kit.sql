-- Enlazar preguntas_tecnicas_pendientes a su kit real — 2026-08-13
-- Fase 3 de "Respuestas chatwoot 2.0" (escalado silencioso al equipo). Mismo
-- criterio que link-compatibilidades-kit.sql en Fase 1: la pregunta pendiente
-- queda atada al kit pineado real (kit_id), no a texto suelto.
--
-- Aditivo y sin riesgo: columna nullable. No hace falta backfill de las 29
-- filas historicas (son del workflow viejo, ya resueltas en su mayoria); las
-- filas nuevas que cree la Fase 3 nacen con kit_id desde el vamos.

ALTER TABLE preguntas_tecnicas_pendientes
    ADD COLUMN IF NOT EXISTS kit_id integer REFERENCES kits_publicidad(id);

CREATE INDEX IF NOT EXISTS preguntas_tecnicas_pendientes_kit_id_idx
    ON preguntas_tecnicas_pendientes (kit_id);
