-- Estado persistente del bot-agente: recordar QUE TEMAS DE NEGOCIO ya se le
-- contestaron al cliente (envios, ubicacion, pagos, horarios, garantia...).
--
-- Por que: `consultar_info_negocio` devolvia el bloque oficial completo del
-- tema en CADA turno, sin saber si ya se habia dicho. En la conv 3561 el
-- cliente pregunto "cuanto tarda en llegar" (se le volco todo el bloque de
-- envios) y despues aclaro "soy de Villa Dolores" -> el bot volvio a llamar la
-- misma herramienta, recibio el mismo bloque literal y lo repitio entero.
--
-- Con esta columna el motor sabe que `envios` ya se entrego y la herramienta
-- devuelve una guia distinta: contestar solo el matiz nuevo, sin re-volcar.
--
-- Correr con: node scratch/correr-sql.js n8n-workflows/chat-estado-temas-respondidos.sql

ALTER TABLE chat_conversacion_estado
    ADD COLUMN IF NOT EXISTS temas_respondidos text[] NOT NULL DEFAULT '{}';
