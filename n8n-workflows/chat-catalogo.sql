-- Catálogo nuevo y aislado para el bot de WhatsApp: artículos sueltos +
-- packs armados a partir de esos artículos. Pensado para reemplazar en el
-- futuro a kits_publicidad/kit_articulos, pero mientras tanto NO los toca —
-- el workflow "Respuestas chatwoot 2.0" (en producción) sigue leyendo
-- kits_publicidad como hasta ahora. Tampoco toca articulos_mostrador ni
-- pack_mostrador_items (inventario real de mostrador) — es una base propia,
-- chica y curada a mano, sin ninguna relación con esas tablas.
--
-- Ver [[project-chat-catalogo-nuevo]] en memoria y CHATWOOT-BOT-CONTEXTO.md
-- para el porqué de este diseño.
--
-- Correr UNA VEZ en el Postgres de producción. Sin riesgo: tablas nuevas,
-- no tocan nada existente.

-- Un artículo, cargado una sola vez, enganchable a varios packs.
CREATE TABLE IF NOT EXISTS chat_articulos (
    id        serial PRIMARY KEY,
    nombre    text NOT NULL,
    alias     text,                 -- frases completas de cómo lo nombra el cliente
                                     -- ("tapa sola", "cilindro solo"), separadas por coma.
                                     -- Va en el artículo (no en el vínculo con el pack): la
                                     -- ambigüedad real encontrada con Kit 8 ("125 solo" nombra
                                     -- a 2 piezas distintas) es del alias en sí, no del contexto.
    precio    numeric(12,2),        -- NULL = no se vende suelto (a propósito: no forzar precio
                                     -- a artículos que solo existen como parte de un pack).
    detalle   text,                 -- descripción corta opcional, para cuando el bot necesite
                                     -- explicar qué es la pieza además del precio.
    activo    boolean NOT NULL DEFAULT true,
    creado_en timestamptz NOT NULL DEFAULT now()
);

-- Un pack (kit publicitado). Sin columna de stock: mismo criterio ya usado
-- para los kits actuales, todo lo cargado acá se asume en stock.
CREATE TABLE IF NOT EXISTS chat_packs (
    id                     serial PRIMARY KEY,
    nombre                 text NOT NULL,
    precio                 numeric(12,2) NOT NULL DEFAULT 0,  -- precio del pack completo,
                                                                -- manual — no es la suma de partes.
    envio                  text,
    mensaje_bienvenida     text NOT NULL DEFAULT '',
    foto_url               text,
    plantillas_bienvenida  text,   -- plantillas exactas de Instagram/Meta Ads, una por línea
    activo                 boolean NOT NULL DEFAULT true,
    creado_en              timestamptz NOT NULL DEFAULT now()
);

-- Composición: qué artículos (y en qué cantidad) tiene cada pack.
-- articulo_id sin ON DELETE CASCADE a propósito: si un artículo está
-- enganchado a un pack, borrarlo de golpe dejaría al pack con un componente
-- "fantasma" sin que nadie lo note — hay que sacarlo del pack primero.
CREATE TABLE IF NOT EXISTS chat_pack_articulos (
    id          serial PRIMARY KEY,
    pack_id     integer NOT NULL REFERENCES chat_packs (id) ON DELETE CASCADE,
    articulo_id integer NOT NULL REFERENCES chat_articulos (id),
    cantidad    integer NOT NULL DEFAULT 1,
    orden       integer NOT NULL DEFAULT 0,
    UNIQUE (pack_id, articulo_id)
);

CREATE INDEX IF NOT EXISTS chat_pack_articulos_pack_idx ON chat_pack_articulos (pack_id, orden);
CREATE INDEX IF NOT EXISTS chat_pack_articulos_articulo_idx ON chat_pack_articulos (articulo_id);
