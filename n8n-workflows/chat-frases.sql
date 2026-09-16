-- ============================================================================
-- chat_frases : la letra de la casa, editable por momento del embudo
-- ============================================================================
-- Motivo: el bot redactaba bien pero con tics propios ("el kit te va bien"),
-- y corregir eso desde el prompt del sistema significaba volver a hacerlo
-- crecer — justo lo que `prompts/sistema.ts` prohibe. Tampoco alcanzaba la
-- pauta de estilo global (`chat_config.tono_estilo_vendedor`): eso fija el
-- tono, no como se dice UN momento puntual de la venta.
--
-- Cada fila es una forma de decir algo, atada a un `momento` del embudo. El
-- motor inyecta SOLO las frases del momento que la herramienta acaba de
-- resolver, pegadas a su guia, y el modelo elige una y la adapta. Si un
-- momento no tiene frases activas, el turno sale exactamente como antes: la
-- tabla vacia no cambia nada.
--
-- Los momentos validos NO son texto libre: viven en bot-agente/frases/momentos.ts
-- y el panel solo ofrece esos. Un `momento` que no este en esa lista se ignora.
--
-- Placeholders que se reemplazan solos cuando el dato existe en el turno:
--   {moto}    modelo que dijo el cliente ("Gilera Smash")
--   {kit}     nombre del combo o la variante resuelta
--   {precio}  precio ya formateado ("$99.990")
-- Si el dato no esta en ese turno, el placeholder se saca y el modelo redacta.
--
-- Se edita por SQL o desde /admin/chatwoot/frases.
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_frases (
    id              SERIAL PRIMARY KEY,
    momento         TEXT NOT NULL,                 -- compat_confirmada, variante_resuelta, ... (ver momentos.ts)
    frase           TEXT NOT NULL,                 -- como lo decimos nosotros
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    orden           INTEGER NOT NULL DEFAULT 100,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_por TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_frases_momento ON chat_frases (momento, activo);

-- ============================================================================
-- Semilla del momento que motivo la tabla: la confirmacion de compatibilidad.
--
-- Van VARIAS a proposito. El sanitizador borra las oraciones de 4+ palabras
-- que el bot ya dijo en la misma charla (`quitarOracionesYaDichas`), asi que
-- una sola frase fija se autoborraria en su segundo uso. Con tres, el modelo
-- rota y cada confirmacion suena distinta sin dejar de ser nuestra letra.
--
-- El resto de los momentos queda vacio: se cargan desde el panel cuando haga
-- falta corregir un tic, no por adelantado.
-- ============================================================================
INSERT INTO chat_frases (momento, frase, orden) VALUES
('compat_confirmada', 'Este kit va perfecto para tu {moto}', 10),
('compat_confirmada', 'A la {moto} le entra directo, sin modificar nada', 20),
('compat_confirmada', 'Si, es el indicado para tu {moto}', 30)
ON CONFLICT DO NOTHING;
