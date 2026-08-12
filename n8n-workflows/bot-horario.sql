-- Horario comercial automático del botón ON/OFF del bot.
-- Ver también n8n-workflows/bot-onoff.sql (tabla bot_estado, ya existente).
--
-- dia_semana usa la misma convención que Date.getUTCDay(): 0=domingo ... 6=sábado.
-- abre_minutos / cierra_minutos son minutos desde medianoche, hora Argentina
-- (siempre UTC-3, sin horario de verano). Ej: 540 = 09:00, 1080 = 18:00.

ALTER TABLE bot_estado ADD COLUMN IF NOT EXISTS horario_automatico boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS bot_horario (
    dia_semana integer PRIMARY KEY CHECK (dia_semana BETWEEN 0 AND 6),
    activo boolean NOT NULL DEFAULT true,
    abre_minutos integer NOT NULL DEFAULT 540,
    cierra_minutos integer NOT NULL DEFAULT 1080,
    CONSTRAINT bot_horario_rango_valido CHECK (cierra_minutos > abre_minutos)
);

INSERT INTO bot_horario (dia_semana, activo, abre_minutos, cierra_minutos) VALUES
    (0, false, 540, 1080), -- domingo: cerrado por defecto
    (1, true, 540, 1080),
    (2, true, 540, 1080),
    (3, true, 540, 1080),
    (4, true, 540, 1080),
    (5, true, 540, 1080),
    (6, true, 540, 780)   -- sabado: 09:00 a 13:00 por defecto
ON CONFLICT (dia_semana) DO NOTHING;
