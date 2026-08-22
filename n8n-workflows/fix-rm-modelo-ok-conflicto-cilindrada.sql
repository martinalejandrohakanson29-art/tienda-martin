-- Fix 2026-08-21: rm_modelo_ok trataba un numero de cilindrada (110, 125...)
-- como una palabra mas al puntuar coincidencia de modelo. Eso dejaba pasar
-- falsos positivos entre motos que comparten nombre pero tienen motor
-- distinto (ej. "Motomel Blitz 110" -- china generica, cargada compatible --
-- vs "Motomel Blitz 125" -- motor distinto, nunca cargada -- matcheaban con
-- score 0.667 porque compartian 2 de 3 palabras "motomel"/"blitz", y el bot
-- le dijo a un cliente real que su Blitz 125 era compatible cuando no lo es).
-- Disparador real: conversacion +5493731635177 (Milton G.), 2026-08-21,
-- corregida a mano en el chat antes de este fix.
--
-- Ahora, si tanto el modelo guardado como el consultado tienen al menos un
-- numero y esos numeros no coinciden, se considera conflicto y no matchea --
-- sin importar cuantas palabras compartan. No afecta comparaciones donde
-- alguno de los dos lados no menciona numero (ahi sigue valiendo el scoring
-- por palabras de siempre). Probado contra las 248 filas reales de
-- chat_articulo_compatibilidad comparadas consigo mismas (0 regresiones) y
-- contra 17 consultas realistas de motos/cilindradas (solo cambio los 2
-- casos que debia cambiar: Blitz 110 vs 125, Zanella ZB 110 vs 125).
--
-- Importante: esto solo bloquea el choque entre dos entradas *con numero*.
-- Una entrada generica sin numero (ej. "motomel", habilitada por
-- fix-rm-modelo-ok-un-token.sql) sigue matcheando igual -- por eso este fix
-- se aplica junto con una fila negativa puntual para "motomel blitz 125" en
-- chat_articulo_compatibilidad (ver conversacion citada), no lo reemplaza.

CREATE OR REPLACE FUNCTION public.rm_numeros_conflictivos(guardado text, consulta text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  WITH ng AS (
    SELECT array_agg(t) AS nums FROM unnest(coalesce(rm_tokens_modelo(guardado), ARRAY[]::text[])) t WHERE t ~ '^[0-9]+$'
  ), nc AS (
    SELECT array_agg(t) AS nums FROM unnest(coalesce(rm_tokens_modelo(consulta), ARRAY[]::text[])) t WHERE t ~ '^[0-9]+$'
  )
  SELECT
    (SELECT nums FROM ng) IS NOT NULL
    AND (SELECT nums FROM nc) IS NOT NULL
    AND NOT ( (SELECT nums FROM ng) && (SELECT nums FROM nc) )
$function$;

CREATE OR REPLACE FUNCTION public.rm_modelo_ok(guardado text, consulta text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT rm_tokens_modelo(guardado) IS NULL
      OR (
        NOT rm_numeros_conflictivos(guardado, consulta)
        AND (
          (rm_score_modelo(guardado, consulta) >= 0.5 AND rm_match_count_modelo(guardado, consulta) >= LEAST(2, array_length(rm_tokens_modelo(guardado), 1)))
          OR (rm_score_modelo(consulta, guardado) >= 0.5 AND rm_match_count_modelo(consulta, guardado) >= LEAST(2, array_length(rm_tokens_modelo(guardado), 1)))
        )
      )
$function$;

-- Fila negativa puntual: sin esto, "motomel" (generica, sin numero, true)
-- sigue matcheando "motomel blitz 125" pese al fix de arriba, porque no hay
-- numero del lado guardado con el cual entrar en conflicto. Sin constraint
-- unico en la tabla -- se guarda el filtro NOT EXISTS a mano para que correr
-- este archivo dos veces no duplique la fila.
INSERT INTO chat_articulo_compatibilidad (articulo_id, modelo_moto, compatible, detalle)
SELECT DISTINCT cpa.articulo_id, 'motomel blitz 125', false, 'Motor distinto a la Blitz 110 china -- no compatible con este combo'
FROM chat_pack_articulos cpa
JOIN chat_packs p ON p.id = cpa.pack_id
WHERE p.grupo_id = 2
  AND NOT EXISTS (
    SELECT 1 FROM chat_articulo_compatibilidad existente
    WHERE existente.articulo_id = cpa.articulo_id
      AND existente.modelo_moto = 'motomel blitz 125'
  );
