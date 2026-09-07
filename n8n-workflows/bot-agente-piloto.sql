-- ============================================================================
-- bot_agente_piloto: conversaciones de Chatwoot donde el motor NUEVO
-- (bot-agente) responde en vivo en vez del workflow viejo de n8n.
-- ============================================================================
-- Mecanismo de corte sin tocar el workflow de n8n: activar el piloto en una
-- conversacion manda "/bot off" como nota privada (mismo mecanismo que ya usa
-- /admin/chatwoot/chats-vivo) -- n8n lee bot_pausado:{conv} de Redis y se
-- calla para esa conversacion puntual. El webhook de Chatwoot que ya recibe
-- esta app (app/api/chatwoot/webhook/route.ts) detecta que la conversacion
-- esta en esta tabla y le pasa el mensaje al motor bot-agente en su lugar.
--
-- Desactivar el piloto manda "/bot on": n8n vuelve a hacerse cargo.
--
-- Correr UNA VEZ en el Postgres. Aditivo, sin romper nada.
-- ============================================================================

CREATE TABLE IF NOT EXISTS bot_agente_piloto (
    conversation_id bigint PRIMARY KEY,
    account_id      bigint NOT NULL DEFAULT 1,
    activo          boolean NOT NULL DEFAULT true,
    activado_por    text,
    creado_en       timestamptz NOT NULL DEFAULT now(),
    actualizado_en  timestamptz NOT NULL DEFAULT now()
);

-- Turnos reales respondidos por bot-agente (auditoria, mismo espiritu que
-- bot_simulador_conversaciones pero para trafico real de clientes).
CREATE TABLE IF NOT EXISTS bot_agente_turnos_reales (
    id              serial PRIMARY KEY,
    conversation_id bigint NOT NULL,
    account_id      bigint NOT NULL DEFAULT 1,
    mensaje_cliente text NOT NULL,
    respuesta_bot   text,
    foto_url        text,
    escalado_humano boolean NOT NULL DEFAULT false,
    motivo_escalado text,
    herramientas    jsonb,
    latencia_ms     integer,
    resultado_envio text, -- 'enviado' | 'encolado' | 'error'
    detalle_envio   text,
    creado_en       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_agente_turnos_reales_conv
    ON bot_agente_turnos_reales (conversation_id, creado_en);
