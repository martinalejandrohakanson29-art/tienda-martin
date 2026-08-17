-- Guarda de "aspecto" para el matching de conocimiento_libre — 2026-08-17.
--
-- Encontrado auditando las pendientes escaladas: "Buscar en Conocimiento
-- Libre (Sin Match)" (rama "otro" de la Fase 6) matchea solo por palabras
-- compartidas (rm_score), sin ninguna nocion de que TIPO de pregunta es.
-- Caso real confirmado (conv 1989, +5493513815504): el cliente pregunto
-- "Que vale el combo con tapa CDI y cilindro?" (precio) y el bot le
-- contesto con una fila guardada de OTRO cliente que preguntaba lo mismo en
-- general y cuya respuesta era sobre STOCK ("Sí, tenemos stock disponible
-- de ese kit, con entrega inmediata.") -- comparten "combo/tapa/cdi/cilindro"
-- (score 0.8), pero no contestan lo mismo. Es el mismo patron de fondo que
-- ya se arreglo en rm_modelo_ok el 14/8 (matchear por palabras sin verificar
-- que la intencion real coincide), pero viviendo en otro lado.
--
-- De paso, revisando las filas reales de conocimiento_libre (categoria
-- 'sin_match') aparecio el mismo riesgo para preguntas de COMPATIBILIDAD
-- sueltas (sin kit pineado, tambien caen en "otro"): hay varias filas del
-- tipo "le va bien a la Guerrero DL 110" / "no le va a la Wave NF" que
-- podrian prestarle su respuesta a una moto distinta si comparten palabras
-- genericas -- mismo mecanismo, mismo arreglo.
--
-- No se intento separar CADA tipo de pregunta (precio/stock/tecnica/envio/
-- etc): eso pediria una taxonomia mas fina sin evidencia real detras. Se
-- cubren los dos aspectos con evidencia real de causar una respuesta
-- incorrecta o con riesgo claro de hacerlo: precio y compatibilidad. Todo lo
-- demas queda "generico" y sigue matcheando como hoy (comportamiento
-- identico al actual salvo para estos dos aspectos).
--
-- Aditivo y sin riesgo: función nueva, no toca tablas ni datos existentes.
-- Reemplazable (CREATE OR REPLACE), correr las veces que haga falta.

CREATE OR REPLACE FUNCTION rm_aspecto(txt text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN regexp_replace(
           lower(translate(coalesce(txt, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')),
           '[^a-z0-9$]+', ' ', 'g'
         ) ~ '(^| )(precio|precios|vale|valen|cuesta|cuestan|sale|salen|valor|cuanto|cuanta|importe)( |$)'
      OR txt ~ '\$\s?[0-9]'
    THEN 'precio'
    WHEN regexp_replace(
           lower(translate(coalesce(txt, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')),
           '[^a-z0-9]+', ' ', 'g'
         ) ~ '(^| )(anda|andan|compatible|incompatible|calza|calzan|corresponde|corresponden|sirve|sirven|entra|entran)( |$)|le va|no va'
    THEN 'compatibilidad'
    ELSE 'generico'
  END
$$;

-- Chequeo rapido (deberia dar precio / compatibilidad / generico / precio):
-- SELECT rm_aspecto('Que vale el combo con tapa CDI y cilindro?');                    -- precio
-- SELECT rm_aspecto('Sí, tenemos stock disponible de ese kit, con entrega inmediata.'); -- generico
-- SELECT rm_aspecto('le va bien a la Guerrero DL 110');                                -- compatibilidad
-- SELECT rm_aspecto('Sí, la tapa CDI sola cuesta $129.999.');                          -- precio
