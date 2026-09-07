-- ============================================================================
-- bot_agente_pendiente_apertura: conversaciones que escribieron con el local
-- CERRADO y esperan UNA respuesta consolidada al abrir.
-- ============================================================================
-- Antes (Fase 6): cada mensaje entrante fuera de horario generaba (LLM) y
-- encolaba su propia respuesta en `respuestas_pendientes`; al abrir, el
-- despachador las mandaba TODAS seguidas -> el cliente recibia 3-6 mensajes
-- desfasados y contradictorios (un turno preguntaba la moto que el turno
-- siguiente ya daba por sabida). Detectado en las conversaciones 3528 / 3565 /
-- 2900 (07/09, domingo, local cerrado todo el dia).
--
-- Ahora (Fase 7): fuera de horario NO se llama al modelo. Solo se marca la
-- conversacion aca. Al abrir el local,
-- `responderPendientesDeAperturaBotAgente()` (lib/bot-agente-tiempo-real.ts)
-- hace UNA pasada: reconstruye el hilo completo desde Chatwoot y genera UNA
-- respuesta por conversacion, escalonadas entre si (se lee como "abrio el local
-- y se puso a contestar").
--
-- Se dispara oportunista: desde el webhook con cada mensaje entrante y desde
-- `sincronizarEstadoBot` cuando el horario automatico acaba de abrir. Se
-- auto-protege: no hace nada fuera de horario, ni con otra pasada en curso, ni
-- con la tabla vacia.
--
-- Correr UNA VEZ en el Postgres del bot. Aditivo, idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS bot_agente_pendiente_apertura (
    conversation_id   bigint PRIMARY KEY,
    account_id        bigint NOT NULL DEFAULT 1,
    primer_mensaje_en timestamptz NOT NULL DEFAULT now(),
    ultimo_mensaje_en timestamptz NOT NULL DEFAULT now(),
    intentos          integer NOT NULL DEFAULT 0,
    actualizado_en    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_agente_pendiente_apertura_primer
    ON bot_agente_pendiente_apertura (primer_mensaje_en);
