-- Ajuste al esquema de variantes (2026-08-20, misma tarde que
-- chat-catalogo-variantes.sql): `pregunta_desambiguacion` en la práctica
-- tiene que funcionar como el mensaje de bienvenida completo del grupo
-- (saludo + qué es el combo + la pregunta) porque se manda como un solo
-- mensaje de WhatsApp — no una pregunta suelta aparte de la presentación.
-- Se renombra a `mensaje_bienvenida` para seguir la misma convención que
-- kits_publicidad y chat_packs, y se suma foto opcional (mismo patrón que
-- packs). Ver [[project-chat-catalogo-nuevo]].
--
-- Correr UNA VEZ en el Postgres de producción, después de
-- chat-catalogo-variantes.sql. Solo 1 fila de dato real hoy (grupo "Kit 120
-- para 110"), sin riesgo.

ALTER TABLE chat_pack_grupos RENAME COLUMN pregunta_desambiguacion TO mensaje_bienvenida;
ALTER TABLE chat_pack_grupos ADD COLUMN IF NOT EXISTS foto_url text;
