-- ============================================================================
-- Fix 2026-09-01: rm_tokens_modelo no reconocia la cilindrada cuando venia
-- PEGADA a una unidad ("110cc", "125 cc", "150cm3"). El token quedaba como
-- "110cc" -> no pasa el filtro `^[0-9]+$` que usan rm_numeros_conflictivos y
-- rm_numero_guardado_no_mencionado para detectar el choque de cilindradas.
-- Resultado: una regla positiva guardada como "Corven energy 110cc Modelo
-- 2016" (o una consulta del cliente "corven energy 125cc") no entraba en
-- conflicto con "125" / "110" y el bot confirmaba compatibilidad de una moto
-- con motor distinto.
-- Disparador real: conv 3032 (+5493491582103, Elias Nieva), 2026-09-01 -- el
-- cliente dijo "Corven energy 125" y el bot respondio "le va bien a tu moto".
--
-- Fix: antes de tokenizar, separar la cilindrada de su unidad
--   "([0-9]+)(cc|cm3|c.c) -> "\1 "  (se descarta la unidad, no aporta nada).
-- Asi "110cc" pasa a ser el token puro "110" y la deteccion de conflicto de
-- cilindrada funciona igual que con "110" suelto.
--
-- Regresion (1540 comparaciones: cada modelo real de chat_articulo/combo_
-- compatibilidad contra si mismo + contra 13 consultas realistas): 3 flips,
-- los 3 correctos y esperados, ninguno rompe un match legitimo:
--   corven 110                        :: corven energy 125cc   true -> false
--   Corven energy 110cc Modelo 2016   :: corven energy 125     true -> false
--   Corven energy 110cc Modelo 2016   :: corven energy 125cc   true -> false
-- 0 self-matches rotos. Solo afecta filas/consultas con "Ncc"/"Ncm3" pegado
-- (en la base real, 2 filas: id 194 y 237).
-- ============================================================================

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
          regexp_replace(
            lower(translate(coalesce(txt, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')),
            '([0-9]+)[[:space:]]*(cc|cm3|c\.c\.?)\y', '\1 ', 'g'),
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

-- Chequeo:
-- SELECT rm_tokens_modelo('Corven energy 110cc Modelo 2016');  -- {110,corven,energy,modelo}
-- SELECT rm_tokens_modelo('corven energy 125cc');              -- {125,corven,energy}
-- SELECT rm_modelo_ok('Corven energy 110cc Modelo 2016', 'corven energy 125');  -- false
-- SELECT rm_modelo_ok('corven 110', 'corven energy 125cc');                     -- false
-- SELECT rm_tokens_modelo('s2 150');                           -- {150,s2}  (sin cambios)
