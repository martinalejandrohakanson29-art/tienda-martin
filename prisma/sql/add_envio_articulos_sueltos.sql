-- Envío de una pieza vendida SOLA (conv 3860, 10/09/2026).
--
-- El "envío gratis a todo el país" vive en chat_packs.envio y es del KIT: no se
-- hereda a sus piezas cuando el cliente se lleva una o dos por separado. Sin
-- estas columnas el bot cotizaba las piezas sueltas sin una palabra de envío,
-- rodeado del envío gratis del kit en el mismo contexto.
--
-- envio_gratis es tri-estado a propósito:
--   true  -> gratis, el bot lo puede afirmar
--   false -> lo paga el cliente, el bot lo aclara al pasar el precio
--   NULL  -> sin definir: el bot NO menciona el envío y escala si le preguntan
ALTER TABLE chat_articulos ADD COLUMN IF NOT EXISTS envio_gratis BOOLEAN;
ALTER TABLE chat_articulos ADD COLUMN IF NOT EXISTS envio TEXT;
