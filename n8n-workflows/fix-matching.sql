-- Fix de matching de la base de conocimiento del bot — 2026-08-06
-- Ver AUDITORIA-2026-08-06.md. Aplicado en produccion el 2026-08-06.
--
-- Las funciones viven en n8n-workflows/conocimiento-libre.sql, que ya quedo
-- actualizado con el punto A: correrlo de nuevo NO revierte este fix.
-- Para volver atras, la definicion anterior esta en el historial de git de ese
-- archivo (git log -p n8n-workflows/conocimiento-libre.sql).
--
-- ---------------------------------------------------------------------------
-- A) rm_modelo_ok daba true cuando el cliente NO decia el modelo de moto
-- ---------------------------------------------------------------------------
-- rm_tokens('') devuelve NULL, asi que la linea "OR rm_tokens(consulta) IS NULL"
-- hacia pasar CUALQUIER fila cuando la consulta venia sin modelo. Como
-- "¿Datos Tecnicos Suficientes?" deja pasar consultas con solo el kit, un
-- cliente que preguntaba "¿el kit 120 sirve?" sin decir la moto se llevaba la
-- compatibilidad guardada para otra moto, presentada como dato confirmado.
--
-- Se conserva "rm_tokens(guardado) IS NULL": ahi el que no tiene modelo es el
-- dato guardado (compatibilidad generica cargada por el equipo), y en ese caso
-- si corresponde que matchee.

CREATE OR REPLACE FUNCTION public.rm_modelo_ok(guardado text, consulta text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT rm_tokens(guardado) IS NULL
      OR rm_score(guardado, consulta) >= 0.5
      OR rm_score(consulta, guardado) >= 0.5
$function$;

-- ---------------------------------------------------------------------------
-- B) rm_score es asimetrico: una consulta generica matcheaba con puntaje
--    perfecto cualquier producto especifico
-- ---------------------------------------------------------------------------
-- rm_score(guardado, consulta) mide que fraccion de los tokens de la CONSULTA
-- aparece en el dato guardado. Con una consulta de un solo token:
--
--   rm_score('cadena de arrastre titan 150', 'cadena') = 1.000
--   rm_score('kit de arrastre wave',         'kit')    = 1.000
--
-- o sea "¿cuanto sale la cadena?" se llevaba el precio de la primera cadena
-- cargada. La correccion NO toca rm_score (sus umbrales estan calibrados): se
-- agrega la condicion inversa en las consultas del workflow, exigiendo tambien
-- que los tokens del dato guardado esten cubiertos por la consulta.
--
-- Queda aplicado en workflow_mateo.json, en las busquedas sobre las tablas
-- estructuradas:
--
--   Buscar Compatibilidad          compatibilidades.kit, precios_stock.producto
--   Buscar Datos Tecnicos (Multi)  idem
--   Buscar Precio Stock            precios_stock.producto
--   Buscar Producto (Multi)        idem
--   Buscar Info Negocio            info_negocio.tema
--   Buscar Tema Negocio (Multi)    idem
--
--   -  WHERE rm_score(c.kit, 'X') >= 0.5
--   +  WHERE rm_score(c.kit, 'X') >= 0.5 AND rm_score('X', c.kit) >= 0.5
--
-- A PROPOSITO no se aplica a conocimiento_libre: ahi el "guardado" es
-- clave || pregunta (el texto largo que escribio el cliente original), y exigir
-- cobertura inversa lo dejaria sin matchear nunca. Esa tabla tiene su propio
-- guard, corregido en el punto C.

-- ---------------------------------------------------------------------------
-- C) conocimiento_libre: umbral 0.6 -> 0.75
-- ---------------------------------------------------------------------------
-- Salio al verificar el punto B contra los datos reales. Con 0.6 alcanzaba con
-- que coincidieran los tokens del MODELO DE MOTO: una consulta de 3 tokens
-- donde 2 son el modelo da 0.667 y pasa. Caso real de la base:
--
--   consulta: "kit 120 para titan 150"      -> tokens [120, 150, titan]
--   fila:     "titan 150 Cubiertas delanteras y traseras 18"  -> score 0.667
--
-- o sea que preguntar por un kit 120 devolvia la respuesta sobre CUBIERTAS de
-- $110.000, presentada al agente como "Info que ya nos dio el equipo antes".
--
-- Con 0.75 se exige que practicamente todo lo que pregunto el cliente este
-- cubierto, tolerando un token suelto en consultas largas:
--
--   3 tokens: 2/3 = 0.667 rechaza   3/3 = 1.00 acepta
--   4 tokens: 2/4 = 0.500 rechaza   3/4 = 0.75 acepta
--   5 tokens: 3/5 = 0.600 rechaza   4/5 = 0.80 acepta
--
-- Aplicado en workflow_mateo.json, en las mismas 6 busquedas. Si el bot empieza
-- a escalar de mas por consultas que deberia poder responder, es este numero el
-- que hay que bajar (esta 6 veces, siempre como ">= 0.75" sobre k.pregunta).

-- ---------------------------------------------------------------------------
-- Verificacion
-- ---------------------------------------------------------------------------
SELECT 'modelo vacio ya no matchea' AS caso, rm_modelo_ok('titan 150', '') = false AS ok
UNION ALL
SELECT 'modelo igual sigue matcheando', rm_modelo_ok('titan 150', 'titan 150') = true
UNION ALL
SELECT 'modelo distinto sigue sin matchear', rm_modelo_ok('titan 150', 'wave 110') = false
UNION ALL
SELECT 'dato generico sin modelo sigue matcheando', rm_modelo_ok('', 'titan 150') = true
UNION ALL
SELECT 'consulta generica rechazada (bidireccional)', rm_score('cadena', 'cadena de arrastre titan 150') < 0.5
UNION ALL
SELECT 'consulta especifica aceptada (bidireccional)', rm_score('cadena titan 150', 'cadena de arrastre titan 150') >= 0.5;
