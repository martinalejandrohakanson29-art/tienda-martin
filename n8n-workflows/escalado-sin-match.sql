-- Escalado silencioso de la categoría "sin_match" — Fase 5 de "Respuestas
-- chatwoot 2.0" (split de ráfagas en precio/envío/negocio/sin_match).
--
-- Correr UNA VEZ en el Postgres de producción ANTES de aplicar
-- apply-fase6-split-sin-match.mjs. Sin riesgo: tabla nueva, no toca nada
-- existente. El orden inverso también sería seguro (el workflow actual no la
-- usa hasta que se aplique la Fase 6).
--
-- A diferencia de preguntas_tecnicas_pendientes, acá no hay kit_id ni
-- modelo_moto para atar la pregunta: el split con IA no identificó ningún
-- kit ni tema de negocio con la confianza suficiente, así que solo queda el
-- texto crudo de la sub-pregunta. Ver preguntas_precio_pendientes /
-- preguntas_negocio_pendientes (mismo criterio, ya en producción desde el
-- workflow viejo) para el precedente de tabla "genérica" sin FK.

CREATE TABLE IF NOT EXISTS preguntas_sin_match_pendientes (
    id                serial PRIMARY KEY,
    conversation_id   bigint NOT NULL,
    pregunta_original text NOT NULL,
    estado            text NOT NULL DEFAULT 'pendiente',
    creado_en         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS preguntas_sin_match_pendientes_estado_idx
    ON preguntas_sin_match_pendientes (estado, creado_en);

CREATE INDEX IF NOT EXISTS preguntas_sin_match_pendientes_conv_idx
    ON preguntas_sin_match_pendientes (conversation_id, estado);
