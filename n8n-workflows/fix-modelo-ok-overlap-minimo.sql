-- ============================================================================
-- Fix 2026-08-14: rm_modelo_ok daba compatibilidad "confirmada" prestada de
-- OTRO modelo de moto cuando el unico dato en comun era una palabra generica
-- (tipicamente "110", que aparece en casi todas las consultas de este rubro).
--
-- Caso real: contacto +5493856217036 (conv 1910), pregunto por su
-- "hyamaja criton 110 amo 2015" (typeo de Yamaha Crypton 110, 2015) con el
-- Kit 8 pineado. NUNCA hubo una fila de compatibilidad para esa moto. El bot
-- contesto "Si, es compatible... Para recorrido corto" citando el detalle de
-- una fila totalmente distinta ya confirmada: "Zanella ZB 110".
--
-- Causa: rm_tokens('Zanella ZB 110') = {zanella, 110} ("ZB" se descarta por
-- tener menos de 3 letras). La unica palabra en comun con "hyamaja criton 110
-- amo 2015" es "110". En la direccion inversa (rm_score(consulta, guardado))
-- eso es 1 de 2 palabras = 50%, que ya alcanzaba el umbral de rm_modelo_ok.
--
-- Como el negocio es especificamente de motos "110cc", casi cualquier
-- consulta de un cliente contiene "110" — asi que CUALQUIER fila guardada
-- con nombre corto (2 palabras, una de ellas "110") podia prestarle su
-- compatibilidad a una moto completamente distinta.
--
-- Fix: ademas del umbral de 50%, exigir un minimo de 2 palabras en comun
-- (no solo el porcentaje). Una sola palabra generica compartida ya no
-- alcanza. rm_score() NO se toca (se usa en otros lados con su calibracion
-- propia: conocimiento_libre, link-compatibilidades-kit) — el fix es
-- exclusivo de rm_modelo_ok, que solo se usa en "Buscar Compatibilidad del
-- Kit" (workflow "Respuestas chatwoot 2.0").
-- ============================================================================

CREATE OR REPLACE FUNCTION rm_match_count(guardado text, consulta text)
RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  WITH c AS (SELECT rm_tokens(consulta) AS toks),
       g AS (SELECT ' ' || array_to_string(coalesce(rm_tokens(guardado), ARRAY[]::text[]), ' ') || ' ' AS txt)
  SELECT CASE
    WHEN (SELECT toks FROM c) IS NULL THEN 0
    ELSE (SELECT count(*) FROM unnest((SELECT toks FROM c)) AS t, g WHERE g.txt LIKE '%' || t || '%')::integer
  END
$$;

CREATE OR REPLACE FUNCTION rm_modelo_ok(guardado text, consulta text)
RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT rm_tokens(guardado) IS NULL
      OR (rm_score(guardado, consulta) >= 0.5 AND rm_match_count(guardado, consulta) >= 2)
      OR (rm_score(consulta, guardado) >= 0.5 AND rm_match_count(consulta, guardado) >= 2)
$$;

-- ----------------------------------------------------------------------------
-- Chequeo rapido
-- ----------------------------------------------------------------------------
-- SELECT rm_modelo_ok('Zanella ZB 110', 'hyamaja criton 110 amo 2015');       -- false (antes: true) <- el bug real
-- SELECT rm_modelo_ok('Zanella ZB 110', 'tengo una zanella zb 110 del 2020'); -- true  (sigue matcheando, 2 palabras en comun)
-- SELECT rm_modelo_ok('motomel blitz', 'tengo una motomel blitz 110');       -- true  (sigue matcheando, 2 palabras en comun)
-- SELECT rm_modelo_ok('honda wave nf', 'tengo una honda wave 110');          -- true  (sigue detectando el false-compatible correcto)
-- SELECT rm_modelo_ok('', 'titan 150');                                      -- true  (comodin intacto)
-- SELECT rm_modelo_ok('titan 150', 'wave 110');                              -- false (sin cambios, ya daba false)
