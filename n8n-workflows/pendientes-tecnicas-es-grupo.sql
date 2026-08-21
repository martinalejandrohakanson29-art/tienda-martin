-- 2026-08-21: distingue si una fila de preguntas_tecnicas_pendientes vino de
-- una escalada de GRUPO (Kit 120, Escape+Leva, Tapa CDI -- kit_id guarda el id
-- del grupo) o de un pack final puntual (kit_id guarda el id del pack). Antes
-- no habia forma de saberlo, y el guardado de aprendizaje asumia siempre que
-- kit_id era un pack -- para las de grupo, el INSERT no encontraba ningun pack
-- con ese id y no guardaba nada, en silencio.
ALTER TABLE preguntas_tecnicas_pendientes
  ADD COLUMN IF NOT EXISTS es_grupo boolean NOT NULL DEFAULT false;
