-- ============================================================================
-- CILINDRADA BASE DEL PRODUCTO (red dura contra el "le va bien" de otra moto)
-- 2026-09-14 — conv 4068
-- ============================================================================
--
-- QUÉ PASÓ
-- --------
-- Un cliente entró por el anuncio del "Kit 120 corto + Leva 6.40" (un kit que
-- se anuncia PARA 110) y dijo que era para una Zanella RX 150. El bot le
-- contestó "Le va bien a la RX 150 2012" y siguió pidiéndole la medida de la
-- leva.
--
-- La lógica hizo lo que tenía que hacer: el grupo no tiene ninguna fila propia
-- para esa moto, así que contestó una PIEZA del kit, y la fila de la pieza
-- decía que sí — `chat_articulo_compatibilidad` #434, "Cilindro 120 corto" ↔
-- "Zanella RX", cargada el 26/08 dentro de una tanda de 5 filas (carburador,
-- filtro, codo, los dos cilindros) que dejó el aprendizaje. Un "sí" del equipo
-- sobre un combo se repartió entre todas sus piezas, y desde ahí contesta por
-- cualquier otro kit que comparta una de esas piezas.
--
-- LA RED
-- ------
-- Cada producto declara para qué cilindrada de motor es. Si la moto del cliente
-- resuelve a una cilindrada conocida que no es ésa, ninguna fila POSITIVA puede
-- confirmarla: el turno se deriva al equipo. Las filas NEGATIVAS siguen
-- valiendo siempre (una moto que no entra, no entra).
--
-- Vacío = sin declarar = el producto no filtra por cilindrada (comportamiento
-- de antes). Es un array porque hay kits que sirven a más de un motor.
--
-- Lo lee `bot-agente/herramientas/compatibilidad.ts` (cilindradasBaseDelKit).

ALTER TABLE chat_articulos   ADD COLUMN IF NOT EXISTS cilindradas_base INTEGER[] NOT NULL DEFAULT '{}';
ALTER TABLE chat_packs       ADD COLUMN IF NOT EXISTS cilindradas_base INTEGER[] NOT NULL DEFAULT '{}';
ALTER TABLE chat_pack_grupos ADD COLUMN IF NOT EXISTS cilindradas_base INTEGER[] NOT NULL DEFAULT '{}';

-- Los valores NO se inventan: son la cilindrada de las motos que YA figuran
-- positivas en cada familia (se verificó fila por fila que ninguna compatible
-- legítima quede afuera).
--
-- Familia 110: lo que se arma sobre el motor de una 110 (cilindros 120, levas
-- 6.40, tapa CDI, escape PWR 110). Se incluye 105 por la Biz 105.
UPDATE chat_articulos SET cilindradas_base = ARRAY[105,110]
WHERE titulo_comercial IN (
    'Cilindro 120 corto', 'Cilindro 120 largo', 'Leva 6.40 corta', 'Leva 6.40 larga',
    'Tapa CDI 125', 'Escape Paolucci PWR 110'
);

-- Familia varillera (Kit 170, Dakar 200, Dakar 220 y sus piezas). Es más ancha
-- que "150": hay positivas cargadas desde 125 (X3M) hasta 190/200 (Motomel S2).
UPDATE chat_articulos SET cilindradas_base = ARRAY[125,150,190,200]
WHERE titulo_comercial IN (
    'Cilindro 170 varillero', 'Leva de calle 7.80', 'Cilindro Dakar 200',
    'Cigüeñal 200 varillero', 'Cilindro completo dakar 220 varillero 65.5mm'
);

-- Las piezas periféricas (carburador, codo, filtro, espárragos) NO declaran
-- cilindrada a propósito: no definen el motor de destino y van a motores
-- distintos (el carburador CG 125 figura cargado para la Biz 125 y la Biz 105).
UPDATE chat_articulos SET cilindradas_base = '{}'
WHERE titulo_comercial IN (
    'Carburador CG 125', 'Codo de admisión', 'Filtro de alto flujo',
    'Kit de espárragos y varillas'
);

UPDATE chat_pack_grupos SET cilindradas_base = ARRAY[105,110]
WHERE nombre IN (
    'Kit 120 para 110', 'Combo Escape pwr + Leva 6.40',
    'Combo Tapa CDI + Cilindro 120', 'Kit 120 corto + Leva 6.40'
);

UPDATE chat_packs SET cilindradas_base = ARRAY[125,150,190,200]
WHERE grupo_id IS NULL AND nombre IN (
    'Kit 170 varillero + leva', 'kit dakar 200 economico', 'kit dakar 220'
);

-- Backup antes de borrar (misma convención que los fixes anteriores de compat).
CREATE TABLE IF NOT EXISTS chat_articulo_compatibilidad_bk_20260914 AS
SELECT * FROM chat_articulo_compatibilidad;

-- Limpieza del dato que disparó todo esto: la RX 150 (y las demás motos de
-- 125cc+ que se colaron como positivas en productos de 110) no lleva el
-- cilindro 120. Se borran en vez de marcarse `compatible = false` porque nunca
-- fueron un veredicto del equipo sobre esa moto: son el reparto automático de
-- un "sí" dado sobre otro producto.
DELETE FROM chat_articulo_compatibilidad ac
USING chat_articulos a
WHERE ac.articulo_id = a.id
  AND ac.compatible = TRUE
  AND a.cilindradas_base = ARRAY[105,110]
  AND ac.modelo_moto ~* '(zanella rx|rx 150|boxer 150|zr 150|zt 150)';
