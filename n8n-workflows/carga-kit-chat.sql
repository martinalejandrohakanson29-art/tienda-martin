-- Carga de kits asistida por chat (workflow n8n "carga_kit_chat", separado de
-- workflow_mateo). Correr UNA VEZ contra el Postgres de la app antes de usar
-- la seccion /admin/chatwoot/cargar-kit o el workflow nuevo.
--
-- Idea: en vez de que el dueño llene el formulario de Kits y Combos a mano
-- (y se equivoque con cosas como palabras clave sueltas o un detalle
-- incompleto), una IA lo entrevista por chat y arma el borrador. El dueño
-- revisa y confirma antes de que se publique como kit real via guardarKit()
-- (app/actions/kits-publicidad.ts) — este workflow nunca escribe
-- directamente en kits_publicidad.

-- Un borrador por conversación. Los campos van quedando null hasta que la IA
-- los completa; recién quedan fijos cuando estado pasa a 'listo'.
CREATE TABLE IF NOT EXISTS borradores_kits (
    id                  serial PRIMARY KEY,
    estado              text NOT NULL DEFAULT 'en_progreso', -- en_progreso | listo | publicado | descartado
    nombre              text,
    keywords            text,
    detalle             text,
    precio              text,
    envio               text,
    mensaje_bienvenida  text,
    creado_en           timestamptz NOT NULL DEFAULT now(),
    actualizado_en      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS borradores_kits_estado_idx ON borradores_kits (estado);

-- Historial de la charla, mismo shape que conversaciones_historial
-- (session_key, role, content) que ya usa workflow_mateo para su memoria.
CREATE TABLE IF NOT EXISTS borradores_kits_turnos (
    id           serial PRIMARY KEY,
    borrador_id  integer NOT NULL REFERENCES borradores_kits(id) ON DELETE CASCADE,
    role         text NOT NULL, -- 'human' | 'ai'
    content      text NOT NULL,
    creado_en    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS borradores_kits_turnos_borrador_idx
    ON borradores_kits_turnos (borrador_id, creado_en);
