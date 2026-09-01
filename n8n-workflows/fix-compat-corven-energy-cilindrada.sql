-- ============================================================================
-- Fix de datos 2026-09-01 (acompaña a fix-rm-tokens-modelo-cilindrada-pegada.sql).
-- Disparador: conv 3032 (+5493491582103) -- el bot confirmo compatibilidad de
-- una "Corven Energy 125" que no es compatible.
--
-- La Corven Energy es una 110 (no existe version 125). Habia 5 filas positivas
-- cargadas como "corven energy" SIN cilindrada (24/08, articulo_id 7/8/9/10/12,
-- ids 362-366) -> matcheaban cualquier cilindrada que dijera el cliente,
-- incluida "125", y el bot confirmaba. Se les pone la cilindrada real (110)
-- para que rm_numeros_conflictivos bloquee un "125" y el caso escale al equipo
-- en vez de auto-confirmar.
--
-- Las filas "Corven energy 110cc Modelo 2016" (id 194, 237) ya quedan cubiertas
-- por el fix del tokenizer (110cc -> 110); no se tocan.
--
-- NO se tocan las ~120 filas positivas genericas sin cilindrada de otros
-- modelos (keller, motomel, zanella zb, wave s, ...): ahi la compatibilidad
-- depende del modelo y no de la cilindrada a proposito, y el cliente casi
-- siempre da el numero correcto. Esos casos se siguen manejando con una fila
-- negativa puntual cuando aparece un incidente real (como Blitz 125 / ZB 125).
-- ============================================================================

UPDATE chat_articulo_compatibilidad
SET modelo_moto = 'corven energy 110'
WHERE modelo_moto = 'corven energy';

-- Chequeo:
-- SELECT id, articulo_id, modelo_moto, compatible FROM chat_articulo_compatibilidad
--   WHERE lower(modelo_moto) LIKE 'corven energy%' ORDER BY id;
-- SELECT rm_modelo_ok('corven energy 110', 'corven energy 125');  -- false (escala)
-- SELECT rm_modelo_ok('corven energy 110', 'corven energy');      -- true  (sigue OK)
-- SELECT rm_modelo_ok('corven energy 110', 'corven energy 110');  -- true
