-- Botón ON/OFF del bot de WhatsApp + cola de respuestas diferidas.
--
-- Correr UNA VEZ en el Postgres del bot (el mismo que usa la app) ANTES de
-- importar la versión del workflow que apunta los envíos a /api/chatwoot/enviar.
-- El orden inverso también es seguro: el workflow viejo no toca estas tablas.
--
-- Idea: mientras el local está cerrado el bot sigue procesando todo igual
-- (clasifica, busca en la base, genera la respuesta con el LLM y guarda el turno
-- en el historial); lo único que se difiere es el mensaje que ve el cliente.
-- Al prender, la cola se despacha escalonada.

-- Estado del bot: una sola fila, id = 1.
CREATE TABLE IF NOT EXISTS bot_estado (
    id              integer PRIMARY KEY,
    encendido       boolean NOT NULL DEFAULT true,
    actualizado_en  timestamptz NOT NULL DEFAULT now(),
    actualizado_por text,
    CONSTRAINT bot_estado_fila_unica CHECK (id = 1)
);

INSERT INTO bot_estado (id, encendido, actualizado_por)
VALUES (1, true, 'instalacion')
ON CONFLICT (id) DO NOTHING;

-- Cola de respuestas al cliente generadas con el bot apagado.
--
-- estado:
--   pendiente  -> esperando que prendan el bot
--   enviando   -> reclamada por el despachador (si el proceso se cae queda así;
--                 se ve en la web y se puede reintentar a mano, pero nunca se
--                 manda dos veces sola)
--   enviado    -> ya salió a Chatwoot
--   descartado -> no se manda (contestó un humano, o la descartaron a mano)
--   error      -> Chatwoot rechazó el envío; el motivo queda en `motivo`
CREATE TABLE IF NOT EXISTS respuestas_pendientes (
    id              serial PRIMARY KEY,
    conversation_id bigint NOT NULL,
    account_id      bigint NOT NULL DEFAULT 1,
    contacto        text,
    contenido       text NOT NULL,
    -- de qué rama del workflow salió: respuesta | aprendizaje_tecnico |
    -- aprendizaje_negocio | aprendizaje_precio | saludo_kit | pregunta_ambigua
    origen          text NOT NULL DEFAULT 'respuesta',
    estado          text NOT NULL DEFAULT 'pendiente',
    motivo          text,
    creado_en       timestamptz NOT NULL DEFAULT now(),
    enviado_en      timestamptz
);

-- El despachador lee siempre "lo pendiente, en orden de llegada".
CREATE INDEX IF NOT EXISTS respuestas_pendientes_estado_idx
    ON respuestas_pendientes (estado, id);

CREATE INDEX IF NOT EXISTS respuestas_pendientes_conversacion_idx
    ON respuestas_pendientes (conversation_id, estado);
