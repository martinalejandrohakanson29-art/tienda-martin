-- ============================================================================
-- bot_cola_historico: registro persistente de la cantidad de mensajes y
-- conversaciones que se acumulan en cola cada vez que el bot está apagado,
-- desglosado tanto para el bloque de la mañana como para el de la tarde.
-- ============================================================================

CREATE TABLE IF NOT EXISTS bot_cola_historico (
    id                      serial PRIMARY KEY,
    fecha                   date NOT NULL,                   -- Fecha operativa en Argentina (YYYY-MM-DD)
    bloque                  text NOT NULL,                  -- 'manana' | 'tarde'
    mensajes_encolados      integer NOT NULL DEFAULT 0,
    conversaciones_encoladas integer NOT NULL DEFAULT 0,
    conversaciones_ids      bigint[] NOT NULL DEFAULT '{}',
    estado                  text NOT NULL DEFAULT 'acumulando', -- 'acumulando' | 'abierto' | 'despachado'
    primero_en              timestamptz,
    ultimo_en               timestamptz,
    despachado_en           timestamptz,
    creado_en               timestamptz NOT NULL DEFAULT now(),
    actualizado_en          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_bot_cola_historico_fecha_bloque UNIQUE (fecha, bloque)
);

CREATE INDEX IF NOT EXISTS idx_bot_cola_historico_fecha
    ON bot_cola_historico (fecha DESC);

CREATE INDEX IF NOT EXISTS idx_bot_cola_historico_estado
    ON bot_cola_historico (estado);
