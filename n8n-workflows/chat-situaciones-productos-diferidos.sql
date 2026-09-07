-- ============================================================================
-- Situaciones: productos que el catalogo nuevo (chat_packs) todavia NO tiene
-- pero que el negocio SI vende. Hasta cargarlos, el bot escala en silencio en
-- vez de decir "no lo tenemos" (que seria mentira) o cotizar mal.
--   Escape DM Curvo para 110  -> $129.999  (esta en kits_publicidad, no en chat_packs)
--   Kit 220 / KIT POTENCIADO 220cc -> $199.000 (idem)
-- Al cargarlos en el catalogo, borrar estas filas.
-- Correr:  node scratch/correr-sql.js n8n-workflows/chat-situaciones-productos-diferidos.sql
-- ============================================================================
INSERT INTO chat_situaciones (clave, titulo, disparadores, instruccion, activo, orden)
VALUES
  ('producto_diferido_escape_dm_curvo',
   'Consulta por el Escape DM Curvo (aun sin cargar en catalogo)',
   ARRAY['escape dm curvo','escape dm','dm curvo','escape curvo','escape competicion 110','escape de competicion'],
   'El Escape DM Curvo es un producto que vendemos ($129.999 con envio gratis) pero todavia no esta cargado en el catalogo del sistema, asi que NO tenes el dato confirmado ni podes cotizarlo vos. Ejecuta escalar_a_humano con motivo "producto_sin_catalogo" y un resumen de que moto y que consulto. Guarda silencio total cara al cliente. PROHIBIDO decir que no lo tenemos y PROHIBIDO improvisar precio o compatibilidad.',
   true, 5),
  ('producto_diferido_kit_220',
   'Consulta por el Kit 220 / potenciado 220cc (aun sin cargar en catalogo)',
   ARRAY['kit 220','220cc','kit varillero 220','kit potenciado 220','kit daka 220','kit dakar 220','potenciado 220'],
   'El Kit Potenciado 220cc para varilleros 150 sin balanceador es un producto que vendemos ($199.000 con envio gratis) pero todavia no esta cargado en el catalogo del sistema, asi que NO tenes el dato confirmado. Ejecuta escalar_a_humano con motivo "producto_sin_catalogo" y un resumen de que moto y que consulto. Guarda silencio total cara al cliente. PROHIBIDO decir que no lo tenemos y PROHIBIDO improvisar precio o compatibilidad. OJO: "kit 200" / "dakar 200" SI esta en el catalogo (es otro producto), no confundir.',
   true, 6)
ON CONFLICT (clave) DO UPDATE
  SET titulo = EXCLUDED.titulo, disparadores = EXCLUDED.disparadores,
      instruccion = EXCLUDED.instruccion, activo = true, actualizado_en = now();
