-- Números de teléfono que siguen recibiendo respuesta en vivo aunque el bot
-- esté apagado (manual u horario automático) — para poder seguir probando en
-- Chatwoot real sin esperar a que abra el local ni prender el bot para todo
-- el mundo.
--
-- Correr UNA VEZ en el Postgres del bot. Usado por /api/chatwoot/enviar (ver
-- lib/chatwoot-bot.ts, numeroExceptuado): con el bot apagado, antes de
-- encolar la respuesta consulta el teléfono real de la conversación en
-- Chatwoot y, si está acá, la manda derecho en vez de encolarla.
--
-- Formato de telefono: igual al que devuelve Chatwoot en
-- meta.sender.phone_number, con "+" y código de país (ej. "+5493513784909").

CREATE TABLE IF NOT EXISTS bot_numeros_exceptuados (
    telefono   text PRIMARY KEY,
    motivo     text,
    creado_en  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO bot_numeros_exceptuados (telefono, motivo) VALUES
    ('+5493513784909', 'Número de pruebas (conversación de prueba del panel /admin/chatwoot/prueba)'),
    ('+5493512039656', 'Número de pruebas de Martín')
ON CONFLICT (telefono) DO NOTHING;
