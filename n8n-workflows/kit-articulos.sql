-- Tabla de artículos sueltos por kit — primera capa del "árbol de artículos"
-- (ver [[project-chatwoot-arbol-articulos-idea]] en memoria y
-- CHATWOOT-BOT-CONTEXTO.md). Hoy los componentes de un kit viven mezclados
-- como texto libre en kits_publicidad.detalle/keywords; esta tabla les da a
-- cada componente su propia entidad (nombre + precio opcional), cargada a
-- mano fila por fila desde /admin/chatwoot/conocimiento.
--
-- `alias` (agregado 2026-08-19 en n8n-workflows/kit-articulos-alias.sql, ya
-- fusionado acá para que una instalación nueva lo tenga desde el CREATE):
-- cómo nombra el cliente al artículo en la práctica (ej. "tapa", "cilindro"),
-- separado del nombre técnico completo. Encontrado con datos reales del Kit 8:
-- "TAPA DE CILINDRO CDI 125 COMPLETA" y "CILINDRO 120 54MM PERNO 13" comparten
-- la palabra "cilindro" en el nombre formal, así que matchear directo contra
-- `nombre` genera el mismo falso positivo por palabra compartida que ya se
-- resolvió para motos (rm_modelo_ok). El alias lo carga a mano quien agrega
-- el artículo, para no depender de parsear el nombre técnico.
--
-- Correr UNA VEZ en el Postgres de producción. Sin riesgo: tabla nueva, no
-- toca nada existente, el workflow de n8n todavía no la lee.

CREATE TABLE IF NOT EXISTS kit_articulos (
    id        serial PRIMARY KEY,
    kit_id    integer NOT NULL REFERENCES kits_publicidad (id) ON DELETE CASCADE,
    nombre    text NOT NULL,
    alias     text,
    precio    text,
    orden     integer NOT NULL DEFAULT 0,
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kit_articulos_kit_idx
    ON kit_articulos (kit_id, orden);
