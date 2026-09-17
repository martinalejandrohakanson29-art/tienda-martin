-- Motos chicas (menos de 105cc) en motos_modelos — 17/09/2026.
--
-- POR QUE
-- Conv 4475: "quiero saber si vienen un kit de 70 a 110" / "tengo una motomel
-- eco 70". La moto no estaba cargada, asi que `resolverMoto` devolvia "ninguna",
-- el 70 quedaba como ruido y el turno arrancaba sin saber que habia una moto en
-- juego: el bot le ofrecio los dos combos que potencian una 110.
--
-- La Econo 80 ya existia en el negocio pero SOLO como fila de compatibilidad: el
-- 17/09 el equipo cargo "Econo 80 / Kit 120 corto + Leva 6.40: NO compatible"
-- desde el circuito de aprendizaje (conv 4444, "Un econo 80"). Con el modelo
-- cargado esa fila se puede usar: el bot contesta la negativa con la letra de la
-- casa en vez de derivarla. Es el mismo hueco de la Biz 105 (conv 503): una moto
-- conocida solo en compat es invisible para el resolvedor.
--
-- Ninguna de las dos tiene kit: `cilindradas_base` arranca en 105. Cargarlas no
-- las hace vendibles — hace que el bot SEPA de que moto habla y derive (o niegue)
-- en vez de ofrecer kits de otra cilindrada. Ver bot-agente/nucleo/conversion-pedida.ts.
--
-- EFECTO MEDIDO (sweep-numeros, 17/09): "una eco 110" y "un econor con motor de
-- 110" —dos clientes reales— ahora caen en la FAMILIA de estas dos (comparten el
-- "eco" sin numeros) y el resolvedor los da por ambiguos en vez de desconocidos.
-- Los dos terminan igual que antes: escalado mudo a la bandeja tecnica. Si esa
-- Eco/Econor 110 existe de verdad, cargarla limpia la ambiguedad; no se cargo
-- porque no nos consta el modelo.
--
-- OJO CON LOS ALIAS: nada de "eco" ni "econo" pelados. En la conv 4352 un cliente
-- escribio "un econor con motor de 110" — es otra moto y de otra cilindrada. Los
-- alias llevan el numero SIEMPRE, que es lo unico que las distingue.
-- Tampoco "motomel 70" (marca + cilindrada): ese es el patron que arrastro a la
-- Brava Nevada 110 en la conv 3730.

INSERT INTO motos_modelos (marca, modelo, nombre_completo, cilindrada, aliases)
SELECT 'Motomel', 'Eco 70', 'Motomel Eco 70', 70,
       ARRAY['eco 70','eco70','econo 70','motomel eco 70','eco 70cc']
WHERE NOT EXISTS (
    SELECT 1 FROM motos_modelos WHERE lower(nombre_completo) = 'motomel eco 70'
);

-- Sin marca a proposito (decision de Martin, 17/09): el equipo la cargo como
-- "Econo 80" a secas y no nos consta de que fabrica es.
INSERT INTO motos_modelos (marca, modelo, nombre_completo, cilindrada, aliases)
SELECT '', 'Econo 80', 'Econo 80', 80,
       ARRAY['econo 80','econo80','eco 80','eco80','econo 80cc']
WHERE NOT EXISTS (
    SELECT 1 FROM motos_modelos WHERE lower(nombre_completo) = 'econo 80'
);
