-- ============================================================================
-- Correr UNA VEZ en la base de produccion ANTES de importar el workflow nuevo.
-- Si no se corre esto, todas las busquedas del bot van a fallar (las funciones
-- rm_tokens / rm_score / rm_modelo_ok no existirian).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) Tabla de conocimiento libre
--    Red de seguridad: acá cae TODA respuesta del equipo, sirva o no para las
--    tablas especificas (compatibilidades / precios_stock / info_negocio).
--    Antes, si el equipo contestaba un precio a una pregunta tecnica, la info
--    se perdia. Ahora siempre queda guardada y reutilizable.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conocimiento_libre (
  id          serial PRIMARY KEY,
  categoria   text NOT NULL,              -- 'tecnica' | 'precio' | 'negocio'
  clave       text NOT NULL DEFAULT '',   -- modelo+kit / producto / tema
  pregunta    text NOT NULL DEFAULT '',   -- texto original del cliente
  respuesta   text NOT NULL,              -- respuesta lista para el cliente
  fuente      text NOT NULL DEFAULT 'equipo',
  creado_en   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conocimiento_libre_creado ON conocimiento_libre (creado_en DESC);


-- ----------------------------------------------------------------------------
-- 2) rm_tokens: normaliza un texto a una lista de palabras comparables.
--    - pasa a minusculas y saca acentos
--    - parte por cualquier cosa que no sea letra/numero
--    - descarta palabras de menos de 3 letras y palabras vacias
--    - saca la "s" final para que singular y plural matcheen
--      ('Cubiertas delanteras' -> {cubierta, delantera})
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rm_tokens(txt text)
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
    WHERE length(t) >= 3
      AND t NOT IN ('para','con','del','las','los','una','uno','que','por',
                    'sus','esa','ese','esta','este','hay','mas','tiene','tienen',
                    'quiero','necesito','busco','tengo','como','cual','cuanto')
  ) s
$$;


-- ----------------------------------------------------------------------------
-- 3) rm_score: 0..1, que proporcion de las palabras de la consulta aparece
--    en lo guardado. Reemplaza al viejo ILIKE '%texto%', que exigia que el
--    texto guardado contuviera la consulta EXACTA (mismo orden, mismo plural).
--
--    Ejemplo que antes fallaba y ahora da 1.0:
--      guardado: 'Cubiertas delanteras y traseras 18'
--      consulta: 'cubierta trasera y delantera'
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rm_score(guardado text, consulta text)
RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  WITH c AS (SELECT rm_tokens(consulta) AS toks),
       g AS (SELECT ' ' || array_to_string(coalesce(rm_tokens(guardado), ARRAY[]::text[]), ' ') || ' ' AS txt)
  SELECT CASE
    WHEN (SELECT toks FROM c) IS NULL THEN 0::numeric
    ELSE round(
      (SELECT count(*) FROM unnest((SELECT toks FROM c)) AS t, g WHERE g.txt LIKE '%' || t || '%')::numeric
      / array_length((SELECT toks FROM c), 1)::numeric, 3)
  END
$$;


-- ----------------------------------------------------------------------------
-- 4) rm_modelo_ok: el modelo de moto matchea si el dato GUARDADO no tiene
--    modelo (comodin) o si los dos se parecen en cualquiera de las dos
--    direcciones.
--
--    El comodin es clave: antes una fila guardada con modelo_moto = '' era
--    inalcanzable, porque '' ILIKE '%Titan 150%' es siempre falso.
--
--    2026-08-06: se saco "OR rm_tokens(consulta) IS NULL". El comodin valia
--    para los dos lados, y el lado de la CONSULTA abria un agujero: como
--    "¿Datos Tecnicos Suficientes?" deja pasar consultas con solo el kit,
--    un cliente que preguntaba "¿el kit 120 sirve?" sin decir la moto
--    matcheaba CUALQUIER fila y se llevaba la compatibilidad de otra moto,
--    presentada al agente como dato confirmado. Verificado contra los datos
--    reales: rm_modelo_ok('wave nf', '') daba true.
--
--    El comodin del lado guardado (fila cargada sin modelo) se conserva: ahi
--    si corresponde que matchee. Ver AUDITORIA-2026-08-06.md y fix-matching.sql.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rm_modelo_ok(guardado text, consulta text)
RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT rm_tokens(guardado) IS NULL
      OR rm_score(guardado, consulta) >= 0.5
      OR rm_score(consulta, guardado) >= 0.5
$$;


-- ----------------------------------------------------------------------------
-- 5) Chequeo rapido (deberia dar todo true / 1.000)
-- ----------------------------------------------------------------------------
-- SELECT rm_score('Cubiertas delanteras y traseras 18', 'cubierta trasera y delantera'); -- 1.000
-- SELECT rm_modelo_ok('', 'Titan 150');                                                  -- true
-- SELECT rm_modelo_ok('titan 150', 'Titán 150');                                         -- true
-- SELECT rm_score('kit de arrastre', 'espejos');                                         -- 0.000
-- SELECT rm_modelo_ok('titan 150', '');                                                  -- false (era true antes del 2026-08-06)
