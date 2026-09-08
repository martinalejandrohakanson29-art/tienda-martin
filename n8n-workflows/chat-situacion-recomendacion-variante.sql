-- ============================================================================
-- Situacion: el cliente pide que le recomienden CUAL llevar.
--
-- Conv 3627 (08/09/2026): ante un "q me recomendas", el bot confirmo recorrido
-- largo y le agrego un consejo inventado ("te da mas salida y torque abajo...
-- si buscaras mas estirada arriba, ahi se usa corto"), como si el recorrido
-- fuera una preferencia. NO lo es: lo define fisicamente el motor de la moto, y
-- el sistema no tiene ningun dato de rendimiento para opinar.
--
-- El refuerzo principal vive en `resolver_variante` (AVISO_NO_ES_PREFERENCIA +
-- la guia de como fijarse). Esta fila cubre el caso aunque el modelo no llame la
-- herramienta.
-- Correr:  node scratch/correr-sql.js n8n-workflows/chat-situacion-recomendacion-variante.sql
-- ============================================================================
INSERT INTO chat_situaciones (clave, titulo, disparadores, instruccion, activo, orden)
VALUES
  ('recomendacion_variante',
   'Pide que le recomienden cual llevar (la variante no se elige)',
   ARRAY['que me recomendas','que me recomiendas','cual me recomendas','cual me recomiendas','me recomendas','que me conviene','cual me conviene','cual es mejor','cual es el mejor','que me sugeris','cual me sirve mas','cual llevo','cual compro','que conviene mas','cual es mas recomendable'],
   'El cliente pide que le recomendes cual llevar. Si es entre las VARIANTES de un mismo combo (recorrido corto/largo, medida de leva, etc.): NO es una eleccion suya. La variante la define fisicamente el motor que ya tiene la moto, la que le corresponde es la unica que le entra. Decilo en un renglon y pasale la guia de como fijarse (llama resolver_variante con cliente_no_sabe: true). Si es entre PRODUCTOS distintos: pasale lo que devuelva el catalogo, sin opinar. PROHIBIDO en los dos casos inventar comparaciones de rendimiento (torque, estirada, potencia, para calle o para picadas, cual anda mejor): el sistema no tiene ese dato. Si el cliente insiste en un consejo tecnico que no podes dar, escalar_a_humano(motivo: ''consulta_tecnica'') y silencio.',
   true, 20)
ON CONFLICT (clave) DO UPDATE
  SET titulo = EXCLUDED.titulo, disparadores = EXCLUDED.disparadores,
      instruccion = EXCLUDED.instruccion, activo = true, actualizado_en = now();
