-- =============================================================================
-- VERIFICADOR DE GROUNDING (Jev) — sexto eslabón del sanitizado del bot-agente.
--
-- Corre una vez. Es aditivo y NO prende nada: `verificador_grounding_modo`
-- arranca en 'off', así que se puede mergear sin efecto y prender cuando Martín
-- quiera, sin deploy.
--
-- Plan, medición y criterios de matar: bot-agente/PLAN-VERIFICADOR-GROUNDING.md
-- =============================================================================

CREATE TABLE IF NOT EXISTS bot_agente_verificador_grounding (
    id               SERIAL PRIMARY KEY,
    creado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
    conversation_id  INTEGER,
    turno_id         INTEGER,
    borrador         TEXT NOT NULL,
    estado_tools     JSONB,          -- el `state` que se le mandó a Jev, para re-probar el caso
    noul             NUMERIC(4,3),   -- la probabilidad devuelta (0-1)
    umbral           NUMERIC(4,3),
    marcado          BOOLEAN NOT NULL,
    accion           TEXT NOT NULL,  -- 'sombra' | 'vetado_reintento' | 'vetado_escalado'
    ms               INTEGER,
    costo_usd        NUMERIC(12,9),
    veredicto_humano TEXT            -- 'acertado' | 'falso_positivo' | NULL, lo carga Martín
);

CREATE INDEX IF NOT EXISTS idx_verif_grounding_marcado
    ON bot_agente_verificador_grounding (marcado, creado_en DESC);

-- Umbral 0.80 y no 0.85: medido el 19/09 sobre el estado REAL serializado, el
-- caso de la conv 3707 ("el pistón no viene incluido") vive en 0.82-0.85 y con
-- 0.85 se escapa. En 0.80 el tráfico real marca 0,3% (1 de 300 turnos).
INSERT INTO chat_config (clave, valor) VALUES
    ('verificador_grounding_modo',       'off'),   -- off | sombra | veto
    ('verificador_grounding_umbral',     '0.80'),
    ('verificador_grounding_modelo',     'typesafe/jev-1.13'),
    ('verificador_grounding_timeout_ms', '1500')
ON CONFLICT (clave) DO NOTHING;
