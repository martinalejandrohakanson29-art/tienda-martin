-- Fix 2026-09-01: una regla de compatibilidad NEGATIVA (compatible = false)
-- cuyo modelo_moto trae una cilindrada explicita (ej. "motomel blitz 125")
-- se estaba aplicando a cualquier consulta generica sin numero (ej. "motomel
-- blitz"), porque rm_numeros_conflictivos solo bloquea el choque entre DOS
-- entradas con numero. Como el CTE de piezas ordena por "compatible ASC"
-- (un "no" de cualquier pieza bloquea el combo), el "no" de la Blitz 125
-- tapaba el "si" de la Blitz 110 y el bot le decia a un cliente con una Blitz
-- generica (casi siempre la 110 china, compatible) que su moto NO servia.
-- Disparador real: conversacion +5492975288540 (conv 3131), 2026-09-01.
--
-- Decision (Martin): "inclinarse por el SI". Una regla negativa atada a una
-- cilindrada puntual SOLO aplica si el cliente nombro esa cilindrada. Si el
-- cliente dice el modelo pelado, gana la regla positiva.
--
-- rm_numero_guardado_no_mencionado(guardado, consulta):
--   true  <=> el lado GUARDADO tiene al menos un numero Y ninguno de esos
--             numeros aparece en la CONSULTA.
-- Se usa en los nodos "Buscar Compatibilidad del Grupo/del Kit" para descartar
-- filas negativas especulativas:  AND NOT (compatible = false AND
--   rm_numero_guardado_no_mencionado(modelo_moto, '<consulta>'))
--
-- No afecta: reglas negativas SIN numero (ej. "wave", "biz") -> ng es NULL ->
-- devuelve false -> la regla sigue aplicando. Reglas positivas -> el filtro
-- solo mira compatible = false. Cliente que SI dice "125" -> el numero
-- intersecta -> devuelve false -> la regla negativa sigue aplicando.

CREATE OR REPLACE FUNCTION public.rm_numero_guardado_no_mencionado(guardado text, consulta text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  WITH ng AS (
    SELECT array_agg(t) AS nums
    FROM unnest(coalesce(rm_tokens_modelo(guardado), ARRAY[]::text[])) t
    WHERE t ~ '^[0-9]+$'
  ), nc AS (
    SELECT array_agg(t) AS nums
    FROM unnest(coalesce(rm_tokens_modelo(consulta), ARRAY[]::text[])) t
    WHERE t ~ '^[0-9]+$'
  )
  SELECT
    (SELECT nums FROM ng) IS NOT NULL
    AND (
      (SELECT nums FROM nc) IS NULL
      OR NOT ( (SELECT nums FROM ng) && (SELECT nums FROM nc) )
    )
$function$;
