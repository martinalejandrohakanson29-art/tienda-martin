-- Costo por turno del bot-agente.
--
-- Hasta ahora `bot_agente_turnos_reales` guardaba latencia y herramientas pero
-- NO los tokens: el motor ya los calculaba y se descartaban al registrar el
-- turno. Consecuencia: el gasto diario solo se veia en la factura de OpenAI,
-- sin poder atribuirlo a una conversacion, un modelo ni un tipo de consulta.
--
-- El jsonb guarda: prompt, completion, total, cacheados (tramo servido desde el
-- cache del proveedor, 90% mas barato), razonamiento (tokens invisibles de
-- gpt-5, cobrados a precio de salida), pasos (iteraciones del loop ReAct) y
-- modelo.
ALTER TABLE bot_agente_turnos_reales ADD COLUMN IF NOT EXISTS tokens jsonb;

-- Para las consultas de costo por dia, que siempre filtran por fecha.
CREATE INDEX IF NOT EXISTS idx_turnos_reales_creado_en ON bot_agente_turnos_reales (creado_en);
