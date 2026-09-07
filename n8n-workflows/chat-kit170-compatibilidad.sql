-- ============================================================================
-- Kit 170 varillero + leva (pack id 11) -- limpieza de compatibilidad
-- ============================================================================
-- Hallazgos (07/09):
--  1. La compatibilidad RICA del Kit 170 ya existe: son las ~90 filas de
--     `chat_articulo_compatibilidad` del articulo 17 "Cilindro 170 varillero"
--     (el cilindro es el corazon del kit). El motor ya las lee para consultas
--     del kit (match por "170 varillero"). No hay que migrar nada.
--  2. La tabla legacy `compatibilidades` tenia 14 filas duplicadas ("Kit 170",
--     kit_id 9) con menos data y 2 que ofrecian un "kit 150 + leva $129.999"
--     que NO esta en el catalogo. -> se borran (una sola fuente de verdad).
--  3. `chat_articulo_compatibilidad` 537 y 538 (moto "ybr") y legacy 19
--     (xtz 125) arrastran esa misma "alternativa fantasma" de $129.999.
--     Decision (Martin): YBR -> que ESCALE, sin ofrecer nada. Sin fila, el
--     motor no matchea y escala en silencio. -> se borran.
--
-- Nota: NO se cargan filas en chat_combo_compatibilidad para el pack 11; seria
-- una segunda copia de la data del articulo 17 y el proyecto quiere un solo
-- lugar por dato.
--
-- Correr UNA VEZ:  node scratch/correr-sql.js n8n-workflows/chat-kit170-compatibilidad.sql
-- (Idempotente.)
-- ============================================================================

BEGIN;

-- por si una corrida previa de este script dejo filas: revertir
DELETE FROM chat_combo_compatibilidad WHERE kit_id = 11;

-- 14 filas legacy del Kit 170 (incluye las 2 con la alternativa fantasma)
DELETE FROM compatibilidades WHERE kit ILIKE 'kit 170%';

-- alternativa fantasma de YBR ($129.999, producto inexistente en catalogo)
DELETE FROM chat_articulo_compatibilidad
WHERE id IN (537, 538);
DELETE FROM compatibilidades
WHERE id = 19 AND detalle ILIKE '%129.999%';

COMMIT;
