-- ============================================================================
-- Fix 2026-08-19: rm_modelo_ok no reconocia compatibilidad ya confirmada
-- cuando el nombre del modelo se reducia a una sola palabra util porque la
-- sigla que lo distingue tiene menos de 3 letras (rm_tokens la descarta).
--
-- Caso real: contacto +5492954878893 (conv 2151), con el Kit 1 pineado,
-- escribio "Es para una Zanella zb". En `compatibilidades` ya existian dos
-- filas confirmadas ("Zanella ZB 110" y "zanella zb", compatible=true) para
-- ese kit, pero el bot no las encontro y termino escalando la pregunta al
-- equipo en vez de contestar sola.
--
-- Causa: rm_tokens('Zanella ZB 110') = {zanella, 110} y rm_tokens('Zanella
-- zb') = {zanella} ("zb" se descarta por tener menos de 3 letras). La unica
-- palabra en comun entre ambos es "zanella" -- 1 sola palabra, no alcanza el
-- minimo de 2 que exige rm_modelo_ok desde el fix del 14/8
-- (fix-modelo-ok-overlap-minimo.sql). Mismo patron afecta a "wave nf" y
-- "wave s" (Honda), que se reducen a solo "wave".
--
-- Opcion descartada: bajar el minimo de rm_tokens (usada globalmente por
-- rm_score en conocimiento_libre con calibracion propia) o relajar la regla
-- de "2 palabras en comun" a "alcanza con 1 si el mensaje del cliente es
-- corto". La primera tiene alcance demasiado amplio; la segunda reabre el
-- mismo tipo de falso positivo que se cerro el 14/8 -- hay filas guardadas
-- solo con la marca/modelo generico ("wave", "crypton", "biz", todas
-- compatible=false) que un cliente podria "matchear" sin querer con solo
-- mencionar la marca, sin el modelo puntual.
--
-- Fix: tokenizador nuevo y exclusivo para esta funcion (rm_tokens_modelo,
-- minimo 2 letras en vez de 3), que NO reemplaza a rm_tokens/rm_score
-- (siguen intactas, se siguen usando en conocimiento_libre y demas con su
-- calibracion propia). La regla de "2 palabras en comun" de rm_modelo_ok NO
-- se relaja -- se cumple de verdad, porque ahora "zb"/"nf"/"s" cuentan como
-- palabra real. rm_modelo_ok solo se usa en "Buscar Compatibilidad del Kit"
-- (workflow "Respuestas chatwoot 2.0"), asi que el fix queda contenido ahi.
-- ============================================================================

CREATE OR REPLACE FUNCTION rm_tokens_modelo(txt text)
RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT array_agg(DISTINCT tok)
  FROM (
    SELECT regexp_replace(t, 's$', '') AS tok
    FROM unnest(
      string_to_array(
        regexp_replace(
          lower(translate(coalesce(txt, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')),
          '[^a-z0-9]+', ' ', 'g'),
        ' ')
    ) AS t
    WHERE length(t) >= 2
      AND t NOT IN ('de','el','la','un','en','es','no','si','ya','tu','mi',
                    'para','con','del','las','los','una','uno','que','por',
                    'sus','esa','ese','esta','este','hay','mas','tiene','tienen',
                    'quiero','necesito','busco','tengo','como','cual','cuanto')
  ) s
$$;

CREATE OR REPLACE FUNCTION rm_score_modelo(guardado text, consulta text)
RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  WITH c AS (SELECT rm_tokens_modelo(consulta) AS toks),
       g AS (SELECT ' ' || array_to_string(coalesce(rm_tokens_modelo(guardado), ARRAY[]::text[]), ' ') || ' ' AS txt)
  SELECT CASE
    WHEN (SELECT toks FROM c) IS NULL THEN 0::numeric
    ELSE round(
      (SELECT count(*) FROM unnest((SELECT toks FROM c)) AS t, g WHERE g.txt LIKE '%' || t || '%')::numeric
      / array_length((SELECT toks FROM c), 1)::numeric, 3)
  END
$$;

CREATE OR REPLACE FUNCTION rm_match_count_modelo(guardado text, consulta text)
RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  WITH c AS (SELECT rm_tokens_modelo(consulta) AS toks),
       g AS (SELECT ' ' || array_to_string(coalesce(rm_tokens_modelo(guardado), ARRAY[]::text[]), ' ') || ' ' AS txt)
  SELECT CASE
    WHEN (SELECT toks FROM c) IS NULL THEN 0
    ELSE (SELECT count(*) FROM unnest((SELECT toks FROM c)) AS t, g WHERE g.txt LIKE '%' || t || '%')::integer
  END
$$;

CREATE OR REPLACE FUNCTION rm_modelo_ok(guardado text, consulta text)
RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT rm_tokens_modelo(guardado) IS NULL
      OR (rm_score_modelo(guardado, consulta) >= 0.5 AND rm_match_count_modelo(guardado, consulta) >= 2)
      OR (rm_score_modelo(consulta, guardado) >= 0.5 AND rm_match_count_modelo(consulta, guardado) >= 2)
$$;

-- ----------------------------------------------------------------------------
-- Chequeo rapido
-- ----------------------------------------------------------------------------
-- SELECT rm_modelo_ok('Zanella ZB 110', 'Zanella zb');                        -- true  (antes: false) <- el bug real
-- SELECT rm_modelo_ok('zanella zb', 'Zanella zb');                            -- true  (antes: false) <- otra fila afectada
-- SELECT rm_modelo_ok('honda wave nf', 'tengo una honda wave nf');            -- true  (antes: false) <- mismo patron, Honda Wave NF
-- SELECT rm_modelo_ok('Zanella ZB 110', 'hyamaja criton 110 amo 2015');       -- false (no reabre el bug del 14/8)
-- SELECT rm_modelo_ok('Zanella ZB 110', 'Zanella');                           -- false (marca sola sin modelo, sigue sin alcanzar)
-- SELECT rm_modelo_ok('wave', 'tengo una honda');                             -- false (palabra generica sola, sigue sin alcanzar)
-- SELECT rm_modelo_ok('motomel blitz', 'tengo una motomel blitz 110');        -- true  (sigue matcheando, sin cambios)
-- SELECT rm_modelo_ok('honda wave nf', 'tengo una honda wave 110');           -- true  (sigue detectando el false-compatible correcto)
-- SELECT rm_modelo_ok('', 'titan 150');                                       -- true  (comodin intacto)
-- SELECT rm_modelo_ok('titan 150', 'wave 110');                               -- false (sin cambios, ya daba false)
