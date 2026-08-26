-- Tabla para almacenar métricas históricas diarias consolidadas de Chatwoot.
CREATE TABLE IF NOT EXISTS chatwoot_metricas_diarias (
    fecha DATE PRIMARY KEY,
    total_conversaciones INTEGER NOT NULL DEFAULT 0,
    total_mensajes_entrantes INTEGER NOT NULL DEFAULT 0,
    total_mensajes_salientes INTEGER NOT NULL DEFAULT 0,
    por_hora JSONB NOT NULL DEFAULT '[]'::jsonb,
    conversaciones_con_respuesta INTEGER NOT NULL DEFAULT 0,
    conversaciones_con_continuacion INTEGER NOT NULL DEFAULT 0,
    mensajes_fuera_horario INTEGER NOT NULL DEFAULT 0,
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chatwoot_metricas_diarias_fecha_idx ON chatwoot_metricas_diarias (fecha DESC);
