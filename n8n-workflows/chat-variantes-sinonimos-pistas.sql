-- Sinonimos de variante para las PISTAS que el propio bot le ofrece al cliente.
--
-- Problema (conv 3448, 07/09): el `pregunta_variante_reintento` de los grupos 1
-- y 3 le dice al cliente que puede identificar el recorrido de dos formas —
-- por el COLOR del cilindro o por los DIENTES de la corona:
--
--   "si el cilindro es negro fundicion, generalmente es corto.
--    si es color aluminio plateado es largo.
--    o revisando los dientes de la corona, si tiene 28 dientes es corto,
--    si tiene 32 es largo"
--
-- ...pero `sinonimos_variante` solo cubria el vocabulario "corto/largo". El
-- cliente contesto "el cilindro es color plateado" — exactamente lo que el bot
-- le pidio — y el bot volvio a hacerle la MISMA pregunta, tres veces seguidas.
-- Es decir: le pedimos que conteste en un idioma que despues no entendemos.
--
-- Se cargan SOLO las pistas que el texto afirma como CIERTAS:
--   * "color aluminio plateado ES largo"        -> plateado / aluminio  -> largo
--   * "28 dientes es corto, 32 es largo"        -> 28 -> corto, 32 -> largo
--
-- NO se carga "negro fundicion -> corto" a proposito: el texto dice
-- "GENERALMENTE es corto", o sea que no es determinante, y estos sinonimos
-- deciden que producto se vende. Si Martin confirma que alcanza, se agrega
-- 'negro' y 'fundicion' a los packs 3 y 7 con el mismo patron de abajo.
--
-- Correr con: node scratch/correr-sql.js n8n-workflows/chat-variantes-sinonimos-pistas.sql

-- Recorrido CORTO (grupo 1 -> pack 3, grupo 3 -> pack 7): 28 dientes.
UPDATE chat_packs
SET sinonimos_variante = ARRAY(
    SELECT DISTINCT unnest(sinonimos_variante || ARRAY['28', '28 dientes'])
)
WHERE id IN (3, 7);

-- Recorrido LARGO (grupo 1 -> pack 4, grupo 3 -> pack 8): plateado / 32 dientes.
UPDATE chat_packs
SET sinonimos_variante = ARRAY(
    SELECT DISTINCT unnest(
        sinonimos_variante || ARRAY['plateado', 'aluminio', 'aluminio plateado', '32', '32 dientes']
    )
)
WHERE id IN (4, 8);
