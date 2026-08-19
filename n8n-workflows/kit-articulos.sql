-- Tabla de artículos sueltos por kit — primera capa del "árbol de artículos"
-- (ver [[project-chatwoot-arbol-articulos-idea]] en memoria y
-- CHATWOOT-BOT-CONTEXTO.md). Hoy los componentes de un kit viven mezclados
-- como texto libre en kits_publicidad.detalle/keywords; esta tabla les da a
-- cada componente su propia entidad (nombre + precio opcional), cargada a
-- mano fila por fila desde /admin/chatwoot/conocimiento.
--
-- Deliberadamente sin campo de keywords/alias todavía: el paso de matching
-- (cómo reconocer que un mensaje del cliente se refiere a un artículo
-- puntual, no al kit completo) todavía no está diseñado — se agrega cuando
-- se defina esa parte, para no inventar un campo que después no sirva como
-- se pensó.
--
-- Correr UNA VEZ en el Postgres de producción. Sin riesgo: tabla nueva, no
-- toca nada existente, el workflow de n8n todavía no la lee.

CREATE TABLE IF NOT EXISTS kit_articulos (
    id        serial PRIMARY KEY,
    kit_id    integer NOT NULL REFERENCES kits_publicidad (id) ON DELETE CASCADE,
    nombre    text NOT NULL,
    precio    text,
    orden     integer NOT NULL DEFAULT 0,
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kit_articulos_kit_idx
    ON kit_articulos (kit_id, orden);
