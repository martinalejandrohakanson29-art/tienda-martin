-- Cierra la ultima pista de variante que el bot ofrecia y no entendia.
--
-- El `pregunta_variante_reintento` dice "si el cilindro es negro fundicion,
-- GENERALMENTE es corto". Por ese "generalmente" no se cargo junto con las
-- otras pistas (ver chat-variantes-sinonimos-pistas.sql). Martin confirmo el
-- 08/09: el negro SIEMPRE es corto.
--
-- Con esto quedan cubiertos los tres vocabularios que el bot le ofrece al
-- cliente para identificar el recorrido: la palabra (corto/largo), el color
-- (negro/plateado) y los dientes de la corona (28/32).
--
-- Correr con: node scratch/correr-sql.js n8n-workflows/chat-variantes-sinonimo-negro.sql

-- Recorrido CORTO (grupo 1 -> pack 3, grupo 3 -> pack 7): cilindro negro de fundicion.
UPDATE chat_packs
SET sinonimos_variante = ARRAY(
    SELECT DISTINCT unnest(sinonimos_variante || ARRAY['negro', 'fundicion', 'negro de fundicion'])
)
WHERE id IN (3, 7);
