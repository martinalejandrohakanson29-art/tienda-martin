-- Horario partido (mañana + tarde) para el horario comercial automático.
-- Ver n8n-workflows/bot-horario.sql (tabla original, un solo rango por día).
--
-- abre_minutos/cierra_minutos siguen siendo el bloque de la mañana (no se
-- renombran, para no tener que migrar filas ya cargadas). El bloque de la
-- tarde es opcional por día (activo_tarde en false = ese día no tiene
-- segundo bloque, se cierra después de la mañana).

ALTER TABLE bot_horario
    ADD COLUMN IF NOT EXISTS activo_tarde boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS abre_minutos_tarde integer,
    ADD COLUMN IF NOT EXISTS cierra_minutos_tarde integer;

ALTER TABLE bot_horario DROP CONSTRAINT IF EXISTS bot_horario_rango_tarde_valido;
ALTER TABLE bot_horario
    ADD CONSTRAINT bot_horario_rango_tarde_valido
    CHECK (
        NOT activo_tarde
        OR (abre_minutos_tarde IS NOT NULL AND cierra_minutos_tarde IS NOT NULL
            AND cierra_minutos_tarde > abre_minutos_tarde)
    );

-- Defaults pedidos (2026-08-13): lunes a viernes 9 a 13:30 y 16 a 19hs;
-- sábados 9 a 13hs (sin tarde); domingo cerrado.
-- 540=09:00, 780=13:00, 810=13:30, 960=16:00, 1140=19:00.
UPDATE bot_horario SET activo = false
    WHERE dia_semana = 0; -- domingo

UPDATE bot_horario SET
    activo = true, abre_minutos = 540, cierra_minutos = 810,
    activo_tarde = true, abre_minutos_tarde = 960, cierra_minutos_tarde = 1140
    WHERE dia_semana BETWEEN 1 AND 5; -- lunes a viernes

UPDATE bot_horario SET
    activo = true, abre_minutos = 540, cierra_minutos = 780,
    activo_tarde = false, abre_minutos_tarde = NULL, cierra_minutos_tarde = NULL
    WHERE dia_semana = 6; -- sábado
