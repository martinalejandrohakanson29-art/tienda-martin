-- Fix 2026-08-21: rm_tokens_modelo trataba un año (2015, 2021, etc.) como una
-- palabra más a la hora de comparar modelos de moto. Eso rompía el matching
-- cuando el mismo modelo se guardaba/consultaba con años distintos (ej. "dlx
-- 2015" guardado vs un cliente que dice "dlx 2021" no matcheaba, porque le
-- faltaba una palabra en común) — la compatibilidad de un kit no depende del
-- año de la moto, solo del modelo. Ahora cualquier token de 4 cifras que
-- parezca año (19xx/20xx) se ignora al tokenizar, así que deja de contar ni
-- para sumar ni para exigir coincidencia.
CREATE OR REPLACE FUNCTION public.rm_tokens_modelo(txt text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
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
      AND t !~ '^(19|20)[0-9]{2}$'
  ) s
$function$;
