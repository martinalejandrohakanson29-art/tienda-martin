-- Variantes de un mismo kit publicitado (2026-08-20, misma tarde que el resto
-- de chat-catalogo-*.sql). Disparador real: Kit 120 tiene, en la práctica, dos
-- versiones según el recorrido del cilindro (corto/largo) — mismo anuncio de
-- Instagram, distinto artículo y distinto precio según cuál le toque al
-- cliente. Antes de esto, la única forma de representarlo era el precio
-- ambiguo de Kit 8 (dos valores pegados en un mismo campo de texto) — esto
-- reemplaza esa idea con datos limpios: cada variante es un pack propio, con
-- su propio artículo y precio real, agrupados para que a futuro el workflow
-- de n8n sepa que tiene que preguntar antes de pinear uno solo.
--
-- Solo el schema por ahora — el paso de n8n que usa esto (preguntar y
-- resolver a la variante definitiva) se construye en una conversación aparte,
-- como el resto del matching de este catálogo. Aditivo, sin riesgo: no toca
-- ningún pack existente (todos quedan con grupo_id NULL, sin cambio de
-- comportamiento).
--
-- Correr UNA VEZ en el Postgres de producción, después de chat-catalogo.sql.

CREATE TABLE IF NOT EXISTS chat_pack_grupos (
    id                      serial PRIMARY KEY,
    nombre                  text NOT NULL,              -- solo para identificarlo en el admin, ej. "Kit 120 para 110"
    plantillas_bienvenida   text,                        -- la plantilla exacta de Instagram, compartida por las variantes
    pregunta_desambiguacion text,                        -- qué se le pregunta al cliente para resolver a una variante concreta
    activo                  boolean NOT NULL DEFAULT true,
    creado_en               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_packs ADD COLUMN IF NOT EXISTS grupo_id integer REFERENCES chat_pack_grupos (id);
-- Etiqueta corta de qué variante representa este pack dentro de su grupo,
-- ej. "recorrido corto" / "recorrido largo". NULL si el pack no pertenece a
-- ningún grupo (caso normal, un kit sin variantes).
ALTER TABLE chat_packs ADD COLUMN IF NOT EXISTS criterio_variante text;

-- Un pack agrupado siempre tiene su etiqueta de variante, y viceversa —
-- no tiene sentido uno sin el otro.
ALTER TABLE chat_packs DROP CONSTRAINT IF EXISTS chat_packs_grupo_criterio_check;
ALTER TABLE chat_packs ADD CONSTRAINT chat_packs_grupo_criterio_check
    CHECK ((grupo_id IS NULL) = (criterio_variante IS NULL));

CREATE INDEX IF NOT EXISTS chat_packs_grupo_idx ON chat_packs (grupo_id);
