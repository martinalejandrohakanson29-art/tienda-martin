-- Tabla espejo de conversaciones de Chatwoot para /admin/chatwoot/chats-vivo.
-- Permite que la interfaz cargue de forma instantánea (< 20ms) desde PostgreSQL
-- sin tener que scrapear la API externa de Chatwoot en cada vista.
--
-- No interfiere con n8n ni con los workflows existentes.

CREATE TABLE IF NOT EXISTS chatwoot_conversaciones_espejo (
    id                  bigint PRIMARY KEY, -- Chatwoot conversation_id
    account_id          bigint NOT NULL DEFAULT 1,
    inbox_id            bigint,
    nombre              text NOT NULL,
    telefono            text NOT NULL DEFAULT '',
    status              text NOT NULL DEFAULT 'open',
    ultimo_mensaje      text NOT NULL DEFAULT '',
    ultimo_mensaje_propio boolean NOT NULL DEFAULT false,
    no_leidos           integer NOT NULL DEFAULT 0,
    ultima_actividad    timestamptz NOT NULL DEFAULT now(),
    creado_en           timestamptz NOT NULL DEFAULT now(),
    actualizado_en      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chatwoot_espejo_actividad
    ON chatwoot_conversaciones_espejo (ultima_actividad DESC);

CREATE INDEX IF NOT EXISTS idx_chatwoot_espejo_telefono
    ON chatwoot_conversaciones_espejo (telefono);

CREATE INDEX IF NOT EXISTS idx_chatwoot_espejo_status
    ON chatwoot_conversaciones_espejo (status);
