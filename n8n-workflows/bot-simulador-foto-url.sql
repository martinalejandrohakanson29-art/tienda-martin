-- ============================================================================
-- bot_simulador_conversaciones.foto_url
-- ============================================================================
-- El motor ahora puede devolver `fotoUrl` en el mensaje de bienvenida de un kit
-- (match exacto de plantilla o descubierto por el LLM vía consultar_catalogo_y_precios),
-- igual que el chatwoot 2.0 (lib/chatwoot-bot.ts -> enviarImagenChatwoot). Se
-- persiste también en el log del simulador para poder ver la foto en el historial.
--
-- Correr UNA VEZ en el Postgres. Aditivo, sin romper nada.
-- ============================================================================

ALTER TABLE bot_simulador_conversaciones ADD COLUMN IF NOT EXISTS foto_url TEXT;
