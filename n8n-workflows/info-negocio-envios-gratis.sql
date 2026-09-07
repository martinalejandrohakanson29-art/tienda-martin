-- ============================================================================
-- info_negocio: declarar que el ENVÍO ES GRATIS en la política canónica.
-- ============================================================================
-- Problema: "envío gratis" vivía SOLO en el texto de cada combo
-- (`chat_packs`). La fila `info_negocio.envios` no lo decía, así que cuando el
-- cliente hacía una consulta de negocio pura ("de dónde son", "hacen envíos"),
-- el `mensaje_para_agente` no traía el dato y el modelo lo rellenaba solo
-- ("querés que te pase el costo de envío a tu ciudad?" -> contradice el envío
-- gratis). Conv 3563 (+5493454933366), 07/09.
--
-- Fix de datos (nivel A). El mecanismo general está en el contrato de grounding
-- de `bot-agente/prompts/sistema.ts` ("no ofrezcas/prometas/preguntes nada que
-- una herramienta no te haya dado") y el backstop en `guardrails/sanitizador.ts`.
--
-- Editable desde /admin/chatwoot/conocimiento. Este archivo es el registro.
-- Correr en el Postgres del bot.
-- ============================================================================

UPDATE info_negocio
SET respuesta = 'El envío es gratis a todo el país: ya está incluido en el precio del kit, no se cobra aparte.

Lo hacemos por Andreani a domicilio (la demora habitual es de 4 a 6 días hábiles). Si sos de Córdoba capital, podemos coordinar con un cadete según la zona.

El envío se despacha siempre después del pago — no trabajamos con pago contra reembolso ni pago al recibir la mercadería.'
WHERE tema = 'envios';

UPDATE info_negocio
SET respuesta = 'Estamos en Revolución de Mayo 1605, barrio Crisol, Córdoba capital. Si estás lejos, te lo mandamos a domicilio con envío gratis a todo el país.'
WHERE tema = 'ubicacion';
