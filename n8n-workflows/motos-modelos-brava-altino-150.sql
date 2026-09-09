-- Brava Altino 150 en motos_modelos (conv 3730, 09/09/2026).
--
-- El cliente escribio "a una brava altino 150 base". La moto no estaba cargada:
-- la unica Brava del catalogo era la Nevada 110, y el alias "brava 110" (que al
-- sacarle los numeros queda en la marca sola) la arrastraba a la familia. El bot
-- terminaba repreguntando "para ese modelo tengo cargada la Brava Nevada 110".
-- El alias-marca ya se ignora en bot-agente/nucleo/motos.ts; esto agrega el
-- modelo real para que resuelva firme en vez de caer en "moto desconocida".
--
-- OJO: no agregar un alias "brava 150" (marca + cilindrada). Ese es exactamente
-- el patron que causo el bug.

INSERT INTO motos_modelos (marca, modelo, nombre_completo, cilindrada, aliases)
SELECT 'Brava', 'Altino 150', 'Brava Altino 150', 150,
       ARRAY['altino','brava altino','altino 150','brava altino 150','altino base','altino 150 base']
WHERE NOT EXISTS (
    SELECT 1 FROM motos_modelos WHERE lower(nombre_completo) = 'brava altino 150'
);
