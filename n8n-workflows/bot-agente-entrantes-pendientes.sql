-- ============================================================================
-- bot_agente_entrantes_pendientes: conversaciones con un mensaje del cliente
-- SIN RESPONDER que el motor todavía tiene que atender.
-- ============================================================================
-- El webhook de Chatwoot, apenas rutea un mensaje al motor, hace un upsert acá
-- (ANTES de arrancar el trabajo async). Cuando `procesarTurno` termina de
-- atender esa conversación, borra la fila. Si el proceso se cae a mitad de
-- camino (deploy de Coolify, crash) la fila queda, y el barrido
-- `atenderEntrantesPendientes()` la recupera: reconstruye el hilo desde
-- Chatwoot y responde UNA vez.
--
-- Cubre dos casos con el mismo mecanismo:
--   1. Local CERRADO: `procesarTurno` no llama al modelo, solo deja la fila;
--      al abrir, el barrido responde consolidado (evita la lluvia de mensajes
--      desfasados de las convs 3528 / 3565 / 2900).
--   2. Turno que murió en vuelo EN HORARIO (deploy/crash): Chatwoot ya recibió
--      el 200 del webhook y no reintenta -> sin esto, el mensaje se perdía
--      (conv 3575, 07/09, "Recorrido corto" durante un deploy).
--
-- El barrido se dispara: desde el webhook con cada mensaje entrante, al abrir
-- el local (`sincronizarEstadoBot`), por un `setInterval` cada 3 min, y a mano
-- con `scripts/atender-pendientes.ts`. Se auto-protege: fuera de horario / lock
-- tomado / nada vencido (grace de 4 min) = no-op.
--
-- Correr UNA VEZ en el Postgres del bot. Aditivo, idempotente.
-- ============================================================================

DROP TABLE IF EXISTS bot_agente_pendiente_apertura;

CREATE TABLE IF NOT EXISTS bot_agente_entrantes_pendientes (
    conversation_id   bigint PRIMARY KEY,
    account_id        bigint NOT NULL DEFAULT 1,
    primer_mensaje_en timestamptz NOT NULL DEFAULT now(),
    ultimo_mensaje_en timestamptz NOT NULL DEFAULT now(),
    intentos          integer NOT NULL DEFAULT 0,
    actualizado_en    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_agente_entrantes_pendientes_ultimo
    ON bot_agente_entrantes_pendientes (ultimo_mensaje_en);
