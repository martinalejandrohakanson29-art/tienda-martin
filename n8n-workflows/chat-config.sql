-- Config editable del bot de WhatsApp (clave/valor).
--
-- Correr UNA VEZ en el Postgres del bot (el mismo que usa la app).
-- Idempotente: se puede correr de nuevo sin romper nada.
--
-- Idea: textos y ajustes del bot que hoy estan escritos a mano dentro del
-- workflow de n8n y que queremos poder editar desde /admin/chatwoot/catalogo
-- (pestana "Mensajes del bot") sin tocar n8n.
--
-- Primer uso: el mensaje de incompatibilidad. Los 4 nodos del workflow que hoy
-- arman "No, este kit no es compatible con tu {moto}..." pasan a leer
-- chat_config.mensaje_incompatibilidad. Es un texto fijo, sin la moto ni el
-- motivo tecnico (se decidio asi con Martin el 2026-09-02).

CREATE TABLE IF NOT EXISTS chat_config (
    clave           text PRIMARY KEY,
    valor           text NOT NULL,
    actualizado_en  timestamptz NOT NULL DEFAULT now(),
    actualizado_por text
);

INSERT INTO chat_config (clave, valor, actualizado_por)
VALUES ('mensaje_incompatibilidad', 'Lamentablemente este kit no es compatible.', 'instalacion')
ON CONFLICT (clave) DO NOTHING;
