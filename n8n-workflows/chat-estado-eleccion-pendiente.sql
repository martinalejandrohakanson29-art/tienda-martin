-- Estado persistente del bot-agente: recordar que el bot le PREGUNTÓ al cliente
-- cuál de varios kits busca, y todavía no eligió.
--
-- Conv 4499 (18/09, +5493516239032): el cliente clickeó dos anuncios, el bot le
-- preguntó "en cuál estás interesado?" y él contestó "En el kit 120 / el que
-- trae el cilindro carburador y escape". Pero esa respuesta llegó con el
-- referral de un TERCER aviso (Escape PWR + Leva 6.40) pegado por Meta, y la
-- guarda de "entró por el anuncio y pide otra medida" (conv 4386) leyó el 120
-- como un producto ajeno al aviso: silencio total y a la bandeja del equipo,
-- teniendo la ficha de ese combo cargada. Contestó Martín a mano al otro día.
--
-- Con esta columna el motor sabe que hay una elección abierta: mientras siga
-- abierta, un aviso que el cliente NO escribió no puede decidir el turno — lo
-- que escribió es la respuesta a nuestra pregunta.
--
-- Los candidatos se guardan como "grupo:3"/"pack:7" para poder reconocer el
-- caso inverso: si el aviso que clickeó ES uno de los candidatos, eso también
-- es una respuesta válida y su ficha sale igual.
--
-- Correr con: node scratch/correr-sql.js n8n-workflows/chat-estado-eleccion-pendiente.sql

ALTER TABLE chat_conversacion_estado
    ADD COLUMN IF NOT EXISTS eleccion_pendiente_candidatos text[],
    ADD COLUMN IF NOT EXISTS eleccion_pendiente_en timestamptz;
