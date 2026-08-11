-- Esquema completo del bot para revolucion_motos_test, reconstruido a partir de:
-- bot-onoff.sql, conocimiento-libre.sql, lock-conversacion.sql, y las queries de
-- Postgres embebidas en workflow_local.json (para las tablas que nunca se
-- versionaron como .sql: conversaciones_historial, info_negocio, precios_stock,
-- preguntas_negocio_pendientes, preguntas_precio_pendientes, compatibilidades,
-- preguntas_tecnicas_pendientes, kits_publicidad).
-- Idempotente (CREATE ... IF NOT EXISTS / CREATE OR REPLACE).

-- 1) Conocimiento libre + funciones de matching (de conocimiento-libre.sql)
CREATE TABLE IF NOT EXISTS conocimiento_libre (
  id          serial PRIMARY KEY,
  categoria   text NOT NULL,
  clave       text NOT NULL DEFAULT '',
  pregunta    text NOT NULL DEFAULT '',
  respuesta   text NOT NULL,
  fuente      text NOT NULL DEFAULT 'equipo',
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conocimiento_libre_creado ON conocimiento_libre (creado_en DESC);

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

CREATE OR REPLACE FUNCTION rm_modelo_ok(guardado text, consulta text)
RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT rm_tokens(guardado) IS NULL
      OR rm_score(guardado, consulta) >= 0.5
      OR rm_score(consulta, guardado) >= 0.5
$$;

-- 2) Bot ON/OFF + cola (de bot-onoff.sql)
CREATE TABLE IF NOT EXISTS bot_estado (
    id              integer PRIMARY KEY,
    encendido       boolean NOT NULL DEFAULT true,
    actualizado_en  timestamptz NOT NULL DEFAULT now(),
    actualizado_por text,
    CONSTRAINT bot_estado_fila_unica CHECK (id = 1)
);
INSERT INTO bot_estado (id, encendido, actualizado_por)
VALUES (1, true, 'instalacion-local-test')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS respuestas_pendientes (
    id              serial PRIMARY KEY,
    conversation_id bigint NOT NULL,
    account_id      bigint NOT NULL DEFAULT 1,
    contacto        text,
    contenido       text NOT NULL,
    origen          text NOT NULL DEFAULT 'respuesta',
    estado          text NOT NULL DEFAULT 'pendiente',
    motivo          text,
    creado_en       timestamptz NOT NULL DEFAULT now(),
    enviado_en      timestamptz
);
CREATE INDEX IF NOT EXISTS respuestas_pendientes_estado_idx ON respuestas_pendientes (estado, id);
CREATE INDEX IF NOT EXISTS respuestas_pendientes_conversacion_idx ON respuestas_pendientes (conversation_id, estado);

-- 3) Lock por conversacion (de lock-conversacion.sql)
CREATE TABLE IF NOT EXISTS bot_conversacion_lock (
  telefono text PRIMARY KEY,
  bloqueado_hasta timestamptz NOT NULL
);

-- 4) Compatibilidad tecnica + pendientes (sticky note "Nota - SQL Tablas")
CREATE TABLE IF NOT EXISTS compatibilidades (
  id serial PRIMARY KEY,
  modelo_moto text,
  kit text,
  compatible boolean,
  detalle text,
  fuente text DEFAULT 'equipo',
  creado_en timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS preguntas_tecnicas_pendientes (
  id serial PRIMARY KEY,
  conversation_id bigint,
  modelo_moto text,
  kit text,
  pregunta_original text,
  estado text DEFAULT 'pendiente',
  creado_en timestamptz DEFAULT now()
);

-- 5) Kits de publicidad (sticky note "Nota - Kits Publicidad")
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

-- 6) Precio/stock + pendientes (reconstruido de "Buscar Precio Stock" / "Guardar en Precios Stock" / etc.)
CREATE TABLE IF NOT EXISTS precios_stock (
  id serial PRIMARY KEY,
  producto text,
  precio text,
  stock text,
  detalle text,
  fuente text DEFAULT 'equipo',
  creado_en timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS preguntas_precio_pendientes (
  id serial PRIMARY KEY,
  conversation_id bigint,
  producto text,
  pregunta_original text,
  estado text DEFAULT 'pendiente',
  creado_en timestamptz DEFAULT now()
);

-- 7) Info del negocio + pendientes (reconstruido de "Buscar Info Negocio" / "Guardar en Info Negocio" / etc.)
CREATE TABLE IF NOT EXISTS info_negocio (
  id serial PRIMARY KEY,
  tema text,
  respuesta text,
  fuente text DEFAULT 'equipo',
  creado_en timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS preguntas_negocio_pendientes (
  id serial PRIMARY KEY,
  conversation_id bigint,
  tema text,
  pregunta_original text,
  estado text DEFAULT 'pendiente',
  creado_en timestamptz DEFAULT now()
);

-- 8) Historial de conversacion (reconstruido de "Guardar Turno Conversacion" / "Traer Historial (...)")
CREATE TABLE IF NOT EXISTS conversaciones_historial (
  id serial PRIMARY KEY,
  session_key text NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conversaciones_historial_session ON conversaciones_historial (session_key, created_at DESC);
