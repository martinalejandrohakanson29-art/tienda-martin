-- Campo opcional para poder cargar un texto DISTINTO al de la primera
-- pregunta de variante (corto/largo), para cuando el bot tiene que volver a
-- preguntar (Fase reintento de "Respuestas chatwoot 2.0"). Hoy el reintento
-- parte siempre de chat_pack_grupos.pregunta_variante y una IA lo reformula
-- con otras palabras (ver Redactar Variante Repregunta Variante); con este
-- campo, si está cargado, el reintento parte de este texto en vez del
-- original -- la IA lo sigue reformulando igual.
--
-- Nullable: si se deja vacío, el workflow sigue usando pregunta_variante
-- como hasta ahora -- cero cambio de comportamiento por default.
--
-- Correr UNA VEZ en el Postgres de producción. Sin riesgo: solo agrega una
-- columna nueva, nullable, no toca datos existentes.

ALTER TABLE chat_pack_grupos ADD COLUMN IF NOT EXISTS pregunta_variante_reintento text;
