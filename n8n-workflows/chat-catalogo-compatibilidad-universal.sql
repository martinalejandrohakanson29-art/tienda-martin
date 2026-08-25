-- Fix real 2026-08-25 (conv 2720, +5493435311660): un grupo pineado en estado
-- "esperando_moto" seguía pidiendo marca/modelo aunque el cliente ya hubiera
-- contestado directo el recorrido (corto/largo) sin dar la moto. Para Kit 120
-- y Tapa CDI, la moto solo sirve para inferir el recorrido -- no hay
-- incompatibilidad física real -- así que si el cliente ya dio el recorrido,
-- no hace falta preguntar la moto. Escape+Leva (id 2) sí tiene compatibilidad
-- física real documentada (ver CHATWOOT-BOT-CONTEXTO.md) y queda excluido.
--
-- Correr UNA VEZ en el Postgres de producción. Sin riesgo: agrega una columna
-- nueva con default false (no cambia comportamiento de ningún grupo hasta que
-- se marque explícitamente), y el UPDATE solo toca 2 filas ya identificadas.

ALTER TABLE chat_pack_grupos ADD COLUMN IF NOT EXISTS compatibilidad_universal boolean NOT NULL DEFAULT false;
UPDATE chat_pack_grupos SET compatibilidad_universal = true WHERE id IN (1, 3); -- Kit 120, Tapa CDI: la moto solo determina el recorrido corto/largo, no hay incompatibilidad física real (Escape+Leva, id 2, queda en false)
