-- Tablas y funciones que le faltaban a revolucion_motos_test respecto de
-- produccion, necesarias para el workflow_mateo completo (deteccion de
-- kits, matching de compatibilidad). Idempotente: DROP/CREATE.

CREATE TABLE IF NOT EXISTS kits_publicidad (
  id serial PRIMARY KEY,
  nombre text NOT NULL,
  keywords text,
  detalle text,
  precio text,
  envio text,
  mensaje_bienvenida text NOT NULL,
  activo boolean DEFAULT true,
  creado_en timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conocimiento_libre (
  id serial PRIMARY KEY,
  categoria text NOT NULL,
  clave text NOT NULL DEFAULT '',
  pregunta text NOT NULL DEFAULT '',
  respuesta text NOT NULL,
  fuente text NOT NULL DEFAULT 'equipo',
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.rm_tokens(txt text)
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
    WHERE length(t) >= 3
      AND t NOT IN ('para','con','del','las','los','una','uno','que','por',
                    'sus','esa','ese','esta','este','hay','mas','tiene','tienen',
                    'quiero','necesito','busco','tengo','como','cual','cuanto')
  ) s
$function$;

CREATE OR REPLACE FUNCTION public.rm_score(guardado text, consulta text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  WITH c AS (SELECT rm_tokens(consulta) AS toks),
       g AS (SELECT ' ' || array_to_string(coalesce(rm_tokens(guardado), ARRAY[]::text[]), ' ') || ' ' AS txt)
  SELECT CASE
    WHEN (SELECT toks FROM c) IS NULL THEN 0::numeric
    ELSE round(
      (SELECT count(*) FROM unnest((SELECT toks FROM c)) AS t, g WHERE g.txt LIKE '%' || t || '%')::numeric
      / array_length((SELECT toks FROM c), 1)::numeric, 3)
  END
$function$;

CREATE OR REPLACE FUNCTION public.rm_modelo_ok(guardado text, consulta text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT rm_tokens(guardado) IS NULL
      OR rm_score(guardado, consulta) >= 0.5
      OR rm_score(consulta, guardado) >= 0.5
$function$;
