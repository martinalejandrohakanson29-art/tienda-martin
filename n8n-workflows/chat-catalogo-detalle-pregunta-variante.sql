-- Prepara el catálogo nuevo para que el workflow de n8n pueda migrarse a él
-- (ver plan de migración charlado con Martín, 2026-08-21). Dos gaps reales
-- encontrados al comparar contra kits_publicidad:
--
-- 1) chat_packs no tenía un campo "detalle" (a diferencia de
--    kits_publicidad.detalle, que hoy resuelve la categoría "otro" del
--    partidor de sub-preguntas de "Respuestas chatwoot 2.0"). Sin esto, migrar
--    el workflow deja esa categoría sin dato para responder.
-- 2) La resolución de variante (corto/largo) va a necesitar 2 preguntas, no 1:
--    primero el modelo de moto (gatea compatibilidad), y solo si es compatible,
--    la pregunta de corto/largo. chat_pack_grupos.mensaje_bienvenida es la
--    primera pregunta (moto); pregunta_variante es la segunda, específica por
--    grupo (ej. "fijate si el cilindro es negro (corto) o no (largo)").
--
-- Correr UNA VEZ en el Postgres de producción. Sin riesgo: solo agrega
-- columnas nuevas, nullable, no toca datos existentes.

ALTER TABLE chat_packs ADD COLUMN IF NOT EXISTS detalle text;
ALTER TABLE chat_pack_grupos ADD COLUMN IF NOT EXISTS pregunta_variante text;
