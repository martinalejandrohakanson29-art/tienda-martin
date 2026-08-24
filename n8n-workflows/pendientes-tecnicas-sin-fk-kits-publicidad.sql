-- 2026-08-24: preguntas_tecnicas_pendientes.kit_id tenia una foreign key vieja
-- contra kits_publicidad (la tabla que se dejo de usar el 21/08 cuando el
-- workflow paso a leer chat_packs/chat_pack_grupos). Desde la migracion,
-- kit_id guarda el id de chat_packs (kit simple) o chat_pack_grupos (grupo,
-- es_grupo=true) -- ninguno de los dos tiene por que existir en la tabla
-- vieja. Rompia en silencio (error de ejecucion en n8n, el cliente no recibia
-- ni siquiera el escalado normal) para cualquier kit/grupo cuyo id no
-- coincidiera por casualidad con una fila vieja de kits_publicidad -- caso
-- real: kit_id 12 ("kit dakar 200 economico", conv 2596, +5493755383488).
ALTER TABLE preguntas_tecnicas_pendientes
  DROP CONSTRAINT IF EXISTS preguntas_tecnicas_pendientes_kit_id_fkey;
