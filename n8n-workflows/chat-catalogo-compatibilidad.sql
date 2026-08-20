-- Compatibilidad por artículo del catálogo nuevo (2026-08-20, misma tarde que
-- chat-catalogo.sql / chat-catalogo-vincular-mostrador.sql). Decisión charlada
-- con Martín: NO se hereda en vivo del kit — un artículo puede compartir
-- compatibilidad con el kit del que forma parte (típico: el cilindro, que
-- suele ser la pieza que define si el combo entero anda en una moto) pero no
-- necesariamente todas las piezas de un kit comparten la misma, y un mismo
-- artículo puede pertenecer a más de un kit. Heredar en vivo obligaría a una
-- regla de "de cuál kit hereda" sin respuesta única — más simple y sin
-- ambigüedad: cada artículo tiene su propia lista, editable, con un atajo de
-- "copiar de un kit" al cargarla por primera vez (copia una vez, después es
-- dato propio del artículo, no un vínculo).
--
-- Tabla aislada del catálogo nuevo — no toca la tabla `compatibilidades`
-- (esa es de kits_publicidad, en producción). Ver [[project-chat-catalogo-nuevo]].
--
-- Correr UNA VEZ en el Postgres de producción, después de chat-catalogo.sql.

CREATE TABLE IF NOT EXISTS chat_articulo_compatibilidad (
    id          serial PRIMARY KEY,
    articulo_id integer NOT NULL REFERENCES chat_articulos (id) ON DELETE CASCADE,
    modelo_moto text NOT NULL,
    compatible  boolean NOT NULL,
    detalle     text,
    creado_en   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_articulo_compatibilidad_articulo_idx ON chat_articulo_compatibilidad (articulo_id);
