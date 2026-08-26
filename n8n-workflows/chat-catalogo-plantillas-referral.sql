-- ============================================================================
-- Correr UNA VEZ en produccion. Agrega el campo para identificar un kit por
-- la metadata "referral" que Meta Ads manda pegada al primer mensaje cuando
-- el cliente hace clic en un anuncio con boton generico de WhatsApp (texto
-- "¡Hola! Quiero mas informacion", sin la plantilla fija de siempre).
--
-- Ese referral trae headline/body del anuncio real -- confirmado 2026-08-26
-- que son estables por campana (mismo texto en cada clic, ver
-- n8n-workflows/CHATWOOT-BOT-CONTEXTO.md, entrada del mismo dia). Mismo
-- patron que plantillas_bienvenida (texto exacto, una entrada por linea,
-- matcheo literal sin IA) pero comparado contra el headline/body del
-- referral en vez del texto que escribe el cliente.
-- ============================================================================

ALTER TABLE chat_packs ADD COLUMN IF NOT EXISTS plantillas_referral text;
ALTER TABLE chat_pack_grupos ADD COLUMN IF NOT EXISTS plantillas_referral text;
