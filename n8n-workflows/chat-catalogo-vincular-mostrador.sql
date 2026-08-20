-- Corrección de diseño (2026-08-20, misma tarde que chat-catalogo.sql): un
-- "artículo" del catálogo del bot ya NO se tipea a mano — tiene que SER un
-- artículo real de articulos_mostrador, elegido con un buscador. chat_articulos
-- deja de guardar su propio nombre (se lee en vivo de articulos_mostrador vía
-- articulo_mostrador_id, así nunca se desincroniza) y pasa a ser una capa de
-- anotación: a qué artículo real corresponde + alias (cómo lo nombra el
-- cliente) + precio propio (precargado del real al elegirlo, editable a mano
-- para casos donde el precio de WhatsApp difiera del de mostrador) + detalle.
--
-- Se borra la única fila de prueba cargada a mano antes de este cambio (id 4,
-- "leva 110", sin alias/precio/pack) — no había forma de migrarla sin vincularla
-- a mano a un artículo real, y no estaba en uso en ningún pack.
--
-- Correr UNA VEZ en el Postgres de producción, después de chat-catalogo.sql.
-- Sin riesgo de pérdida de datos real: la tabla solo tenía esa fila de prueba.

DELETE FROM chat_articulos WHERE nombre = 'leva 110' AND alias IS NULL AND precio IS NULL;

ALTER TABLE chat_articulos ADD COLUMN IF NOT EXISTS articulo_mostrador_id text REFERENCES articulos_mostrador (id);
ALTER TABLE chat_articulos ALTER COLUMN articulo_mostrador_id SET NOT NULL;
ALTER TABLE chat_articulos ADD CONSTRAINT chat_articulos_mostrador_unique UNIQUE (articulo_mostrador_id);
ALTER TABLE chat_articulos DROP COLUMN IF EXISTS nombre;

CREATE INDEX IF NOT EXISTS chat_articulos_mostrador_idx ON chat_articulos (articulo_mostrador_id);
