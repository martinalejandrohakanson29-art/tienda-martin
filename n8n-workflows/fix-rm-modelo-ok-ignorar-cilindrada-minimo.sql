-- ============================================================================
-- Fix 2026-08-24: rm_modelo_ok seguia contando el numero de cilindrada como
-- "una palabra mas" a la hora de exigir el minimo de 2 coincidencias, pese a
-- que ese minimo se penso (fix-rm-modelo-ok-un-token.sql, 08-21) para que un
-- dato guardado con una sola palabra util alcance con esa sola palabra. El
-- problema: casi todos los modelos cargados en el catalogo nuevo se guardan
-- como "modelo + cilindrada" (ej. "s2 150", "corven 110", "keller 110", "rx
-- 150" -- 22 modelos distintos con este patron, verificado contra la base
-- real), asi que en la practica SIEMPRE tenian 2 tokens y exigian que el
-- cliente mencionara TAMBIEN la cilindrada -- algo que casi nadie hace
-- cuando ya dio el nombre del modelo ("tengo una Keller", no "tengo una
-- Keller 110").
--
-- Casos reales del mismo dia (Kit 170, +5493456528101 / +5493406641922 /
-- +5493426260049): "s2 150cc" -> la IA de extraccion separo bien el modelo
-- ("s2") pero como ya habia nombre de modelo dejo la cilindrada vacia (asi
-- esta pensado el prompt a proposito); "S2" solo (transcripcion de audio);
-- "motomel s2" (nombre + marca adivinada). Los 3 tienen datos ya cargados y
-- confirmados como compatibles ("s2 150"), pero ninguno llego al minimo de 2
-- coincidencias exigido porque les faltaba o les sobraba una palabra
-- (siempre la cilindrada o la marca, nunca la palabra que identifica el
-- modelo de verdad).
--
-- Fix: separar el rol de las dos partes del dato. La palabra que identifica
-- el modelo (no numerica) sigue siendo la que decide el match, con el mismo
-- minimo de siempre (2, o 1 si el lado guardado tiene una sola palabra util
-- -- mismo criterio que el fix de un-token). El numero de cilindrada deja de
-- contar para ese minimo -- pasa a usarse SOLO como ya se usaba desde
-- fix-rm-modelo-ok-conflicto-cilindrada.sql (08-21): bloquear si hay un
-- conflicto real entre dos numeros explicitos y distintos (ej. Blitz 110 vs
-- Blitz 125). Esa proteccion sigue intacta, sin tocarla.
--
-- Probado contra las 345 filas reales de chat_articulo_compatibilidad
-- comparadas contra si mismas (0 regresiones: todo lo que matcheaba sigue
-- matcheando) y contra los 9 casos de regresion documentados en los 4 fixes
-- anteriores de esta funcion (ver abajo, todos preservados) + los 3 casos
-- reales de esta sesion (ahora dan true).
-- ============================================================================

CREATE OR REPLACE FUNCTION rm_tokens_modelo_palabra(txt text)
RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT array_agg(t) FROM unnest(rm_tokens_modelo(txt)) t WHERE t !~ '^[0-9]+$'
$$;

CREATE OR REPLACE FUNCTION rm_score_modelo_palabra(guardado text, consulta text)
RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  WITH c AS (SELECT rm_tokens_modelo_palabra(consulta) AS toks),
       g AS (SELECT ' ' || array_to_string(coalesce(rm_tokens_modelo_palabra(guardado), ARRAY[]::text[]), ' ') || ' ' AS txt)
  SELECT CASE
    WHEN (SELECT toks FROM c) IS NULL THEN 0::numeric
    ELSE round(
      (SELECT count(*) FROM unnest((SELECT toks FROM c)) AS t, g WHERE g.txt LIKE '%' || t || '%')::numeric
      / array_length((SELECT toks FROM c), 1)::numeric, 3)
  END
$$;

CREATE OR REPLACE FUNCTION rm_match_count_modelo_palabra(guardado text, consulta text)
RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  WITH c AS (SELECT rm_tokens_modelo_palabra(consulta) AS toks),
       g AS (SELECT ' ' || array_to_string(coalesce(rm_tokens_modelo_palabra(guardado), ARRAY[]::text[]), ' ') || ' ' AS txt)
  SELECT CASE
    WHEN (SELECT toks FROM c) IS NULL THEN 0
    ELSE (SELECT count(*) FROM unnest((SELECT toks FROM c)) AS t, g WHERE g.txt LIKE '%' || t || '%')::integer
  END
$$;

CREATE OR REPLACE FUNCTION public.rm_modelo_ok(guardado text, consulta text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT rm_tokens_modelo(guardado) IS NULL
      OR (
        NOT rm_numeros_conflictivos(guardado, consulta)
        AND (
          (rm_score_modelo_palabra(guardado, consulta) >= 0.5 AND rm_match_count_modelo_palabra(guardado, consulta) >= LEAST(2, array_length(rm_tokens_modelo_palabra(guardado), 1)))
          OR (rm_score_modelo_palabra(consulta, guardado) >= 0.5 AND rm_match_count_modelo_palabra(consulta, guardado) >= LEAST(2, array_length(rm_tokens_modelo_palabra(guardado), 1)))
        )
      )
$function$;

-- ----------------------------------------------------------------------------
-- Chequeo rapido: casos reales de esta sesion (deben dar true ahora)
-- ----------------------------------------------------------------------------
-- SELECT rm_modelo_ok('s2 150', 's2');                                        -- true (antes: false) <- +5493456528101
-- SELECT rm_modelo_ok('s2 150', 'S2');                                        -- true (antes: false) <- +5493406641922
-- SELECT rm_modelo_ok('s2 150', 'motomel s2');                                -- true (antes: false) <- +5493426260049
-- SELECT rm_modelo_ok('corven 110', 'corven');                                -- true (antes: false) <- mismo patron general
--
-- Regresiones de los 4 fixes anteriores (deben mantenerse igual):
-- SELECT rm_modelo_ok('Zanella ZB 110', 'Zanella zb');                        -- true
-- SELECT rm_modelo_ok('zanella zb', 'Zanella zb');                            -- true
-- SELECT rm_modelo_ok('honda wave nf', 'tengo una honda wave nf');            -- true
-- SELECT rm_modelo_ok('Zanella ZB 110', 'hyamaja criton 110 amo 2015');       -- false
-- SELECT rm_modelo_ok('Zanella ZB 110', 'Zanella');                           -- false
-- SELECT rm_modelo_ok('wave', 'tengo una honda');                             -- false
-- SELECT rm_modelo_ok('motomel blitz', 'tengo una motomel blitz 110');        -- true
-- SELECT rm_modelo_ok('honda wave nf', 'tengo una honda wave 110');           -- true
-- SELECT rm_modelo_ok('', 'titan 150');                                       -- true
-- SELECT rm_modelo_ok('titan 150', 'wave 110');                               -- false
-- SELECT rm_modelo_ok('motomel blitz 110', 'motomel blitz 125');              -- false (conflicto de cilindrada intacto)
