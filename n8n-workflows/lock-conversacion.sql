-- Lock por conversación (telefono) para evitar que dos ejecuciones del workflow
-- workflow_mateo respondan al mismo cliente en paralelo (se pisan el historial y
-- mandan respuestas contradictorias). Ver n8n-workflows/auditoria-harness.
--
-- Se toma justo despues de "Soy el ultimo?" (nodo "Reservar Conversacion") y se
-- libera al terminar de responder (nodos "Liberar Lock - ..."). bloqueado_hasta
-- funciona como vencimiento de seguridad: si una ejecucion nunca llega a liberar
-- el lock (rama sin cubrir, error, etc.), a los 150s vuelve a estar disponible.
CREATE TABLE IF NOT EXISTS bot_conversacion_lock (
  telefono text PRIMARY KEY,
  bloqueado_hasta timestamptz NOT NULL
);
