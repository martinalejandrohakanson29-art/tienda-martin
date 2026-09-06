-- ============================================================================
-- Resolución de variantes agnóstica al eje + estado persistente de conversación
-- ============================================================================
-- Problema: la fase "definir qué variante lleva el cliente" (recorrido corto/
-- largo, color azul/negro, pistón 70/90mm, ...) estaba resuelta con prosa en el
-- prompt (Caminos 1-4) + una regex que ataba las palabras "corto o largo". El
-- día que el eje cambia, se rompe.
--
-- Solución estructural:
--  1) Cada variante (pack agrupado) lleva `sinonimos_variante text[]`: las formas
--     en que el cliente puede nombrarla. La herramienta `resolver_variante` hace
--     un match determinista contra eso — misma mecánica para cualquier eje.
--  2) `chat_conversacion_estado` guarda lo ya resuelto (combo pineado, variante
--     resuelta, moto confirmada). El motor lo lee al empezar el turno y lo
--     escribe al terminar. Reemplaza el parseo heurístico del historial.
--
-- Correr UNA VEZ en el Postgres. Aditivo, sin romper nada.
-- ============================================================================

-- 1. Sinónimos por variante -----------------------------------------------------
ALTER TABLE chat_packs ADD COLUMN IF NOT EXISTS sinonimos_variante text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN chat_packs.sinonimos_variante IS
    'Formas en que el cliente puede nombrar esta variante (ej: {corto,recorrido corto,54,c/corta}). Match determinista en resolver_variante. Cargar al armar el combo.';

-- Seed de los combos actuales de recorrido corto/largo (por etiqueta, sin depender de IDs)
UPDATE chat_packs
SET sinonimos_variante = ARRAY['corto', 'recorrido corto', 'c/corta', 'corta', '54']
WHERE grupo_id IS NOT NULL
  AND lower(coalesce(criterio_variante, '')) LIKE '%corto%'
  AND sinonimos_variante = '{}';

UPDATE chat_packs
SET sinonimos_variante = ARRAY['largo', 'recorrido largo', 'c/larga', 'larga', '56']
WHERE grupo_id IS NOT NULL
  AND lower(coalesce(criterio_variante, '')) LIKE '%largo%'
  AND sinonimos_variante = '{}';

-- 2. Estado persistente de la conversación ------------------------------------
CREATE TABLE IF NOT EXISTS chat_conversacion_estado (
    clave                  TEXT PRIMARY KEY,          -- conversation_id de Chatwoot, o session_id del simulador
    grupo_pineado_id       INTEGER,
    grupo_pineado_nombre   TEXT,
    variante_pack_id       INTEGER,                   -- NULL = variante todavía no resuelta
    variante_etiqueta      TEXT,
    variante_precio        NUMERIC,
    moto_confirmada        TEXT,
    actualizado_en         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE chat_conversacion_estado IS
    'Memoria explícita del embudo por conversación. La escribe bot-agente/motor.ts al final de cada turno a partir de lo que devolvieron las herramientas.';
