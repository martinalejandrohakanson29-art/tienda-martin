-- Enlazar compatibilidades a su kit real — 2026-08-12
-- Fase 1 de "Respuestas chatwoot 2.0": antes, compatibilidades.kit era texto
-- libre y se emparejaba contra kits_publicidad por parecido de texto
-- (rm_score, ver fix-matching.sql). Ese "parecido" es lo que dejaba colar
-- respuestas de compatibilidad de un kit para otro. Esta fase agrega un
-- enlace real: de aca en adelante toda fila de compatibilidad nace atada a
-- un kit puntual, sin adivinar.
--
-- Aditivo y sin riesgo: columna nullable, no se borra ni se deja de usar la
-- columna kit (texto) — sigue ahi solo para mostrar en la tabla del admin.
-- El workflow viejo que lee esta tabla por texto (workflow_mateo) esta
-- desactivado, asi que no hay nada corriendo en produccion que dependa de
-- que kit_id NO exista.

ALTER TABLE compatibilidades
    ADD COLUMN IF NOT EXISTS kit_id integer REFERENCES kits_publicidad(id);

CREATE INDEX IF NOT EXISTS compatibilidades_kit_id_idx ON compatibilidades (kit_id);

-- ---------------------------------------------------------------------------
-- Backfill de las filas existentes
-- ---------------------------------------------------------------------------
-- Reusa rm_score() (ya en produccion) para emparejar compatibilidades.kit
-- contra kits_publicidad.nombre + keywords, en la MISMA direccion que ya
-- usa la consulta real del bot viejo para esta comparacion puntual
-- (rm_score(nombre || keywords, kit) — un solo sentido, no bidireccional:
-- el texto de nombre+keywords es naturalmente mas largo que kit, exigir
-- cobertura inversa rechazaba matches correctos). Solo se asigna kit_id
-- cuando hay un candidato con match perfecto (score = 1, o sea que TODOS
-- los tokens de compatibilidades.kit aparecen en el kit) y ningun otro
-- kit activo llega tambien a 1 — ante cualquier ambiguedad o match
-- parcial, se deja sin asignar para revision manual antes que adivinar.

WITH candidatos AS (
    SELECT
        c.id AS compatibilidad_id,
        k.id AS kit_id,
        count(*) OVER (PARTITION BY c.id) AS matches_perfectos
    FROM compatibilidades c
    JOIN kits_publicidad k
        ON rm_score(k.nombre || ' ' || coalesce(k.keywords, ''), c.kit) = 1
    WHERE c.kit_id IS NULL
)
UPDATE compatibilidades c
SET kit_id = cand.kit_id
FROM candidatos cand
WHERE cand.compatibilidad_id = c.id
  AND cand.matches_perfectos = 1;

-- ---------------------------------------------------------------------------
-- Verificacion / filas que quedaron sin asignar (revisar a mano)
-- ---------------------------------------------------------------------------
SELECT
    (SELECT count(*) FROM compatibilidades) AS total_filas,
    (SELECT count(*) FROM compatibilidades WHERE kit_id IS NOT NULL) AS con_kit_id,
    (SELECT count(*) FROM compatibilidades WHERE kit_id IS NULL) AS sin_kit_id;

SELECT id, modelo_moto, kit, detalle
FROM compatibilidades
WHERE kit_id IS NULL
ORDER BY id;
