-- Fix 2026-08-21: rm_modelo_ok exigía al menos 2 palabras en común entre lo
-- guardado y lo consultado, lo que dejaba inutilizables las entradas de
-- compatibilidad cargadas como una sola palabra (ej. "motomel", "keller",
-- "wave", "crypton", "biz", "Mondial", "Trip", "110") — ni siquiera matcheaban
-- contra sí mismas. Ahora el mínimo de coincidencias se adapta: si lo guardado
-- tiene una sola palabra, alcanza con que esa palabra aparezca.
CREATE OR REPLACE FUNCTION public.rm_modelo_ok(guardado text, consulta text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT rm_tokens_modelo(guardado) IS NULL
      OR (rm_score_modelo(guardado, consulta) >= 0.5 AND rm_match_count_modelo(guardado, consulta) >= LEAST(2, array_length(rm_tokens_modelo(guardado), 1)))
      OR (rm_score_modelo(consulta, guardado) >= 0.5 AND rm_match_count_modelo(consulta, guardado) >= LEAST(2, array_length(rm_tokens_modelo(guardado), 1)))
$function$;
