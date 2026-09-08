-- LIMPIEZA DE LOS DATOS DE COMPATIBILIDAD ENSUCIADOS POR n8n
--
-- El flujo viejo de aprendizaje de n8n guardaba en `modelo_moto` el texto CRUDO
-- que escribia el cliente, sin normalizar. Quedaron filas que no nombran una
-- moto sino una pieza ("negro de fundicion"), una frase entera del cliente
-- ("guerrero chopera que yeba un cilindro cadenero Es 150 cilindrada") o dos
-- motos juntas con un salto de linea ("Mondial\nY keller").
--
-- Esas filas pueden responder por motos que no son. Ejemplo real (conv 3515):
-- el bot le dijo a un cliente con Blitz que su moto NO era compatible citando
-- una fila que ni siquiera era una moto.
--
-- Detectadas con: node scratch/auditar-compatibilidad.cjs
-- Correr con: node scratch/correr-sql.js n8n-workflows/limpieza-compatibilidad-datos-n8n.sql
--
-- REVERSIBLE: antes de tocar nada se copia todo a tablas `*_backup_20260908`.

BEGIN;

-- ── 0. Backup completo (para poder volver atras) ────────────────────────────
CREATE TABLE IF NOT EXISTS compatibilidades_backup_20260908 AS
    SELECT * FROM compatibilidades;
CREATE TABLE IF NOT EXISTS chat_articulo_compatibilidad_backup_20260908 AS
    SELECT * FROM chat_articulo_compatibilidad;

-- ── 1. NORMALIZAR: son motos reales, escritas largo o con el comentario del
--       cliente pegado. Se les deja el modelo limpio; el veredicto y el kit no
--       se tocan. ────────────────────────────────────────────────────────────
UPDATE chat_articulo_compatibilidad SET modelo_moto = 'Corven Energy 110'   WHERE id IN (194, 237);
UPDATE chat_articulo_compatibilidad SET modelo_moto = 'Guerrero Trip 110'   WHERE id IN (197, 234);
UPDATE chat_articulo_compatibilidad SET modelo_moto = 'Guerrero Tundra 200' WHERE id IN (556, 557);
UPDATE chat_articulo_compatibilidad SET modelo_moto = 'Guerrero Chopera 150' WHERE id IN (532, 533);
UPDATE chat_articulo_compatibilidad SET modelo_moto = 'KS 125'              WHERE id IN (495, 496);
UPDATE chat_articulo_compatibilidad SET modelo_moto = 'ZR 150'              WHERE id IN (381, 382);

UPDATE compatibilidades SET modelo_moto = 'Corven Energy 110' WHERE id = 122;
UPDATE compatibilidades SET modelo_moto = 'Guerrero Trip 110' WHERE id = 114;
-- "ni ningun modelo de wave s" -> la moto es "wave s" (la negacion ya la
-- expresa la columna `compatible`, no hace falta repetirla en el nombre).
UPDATE compatibilidades SET modelo_moto = 'wave s'            WHERE id = 91;

-- ── 2. BORRAR: no nombran ninguna moto. Son descripciones del CILINDRO que
--       quedaron guardadas como si fueran el modelo del cliente. ─────────────
DELETE FROM chat_articulo_compatibilidad WHERE id IN (
    506,  -- 'cilindro corto, negro de fundicion'
    554,  -- 'cilindro corto'
    555   -- 'negro de fundicion'
);

-- ── 3. BORRAR: fila con DOS motos y un salto de linea. Redundante: ya existen
--       las filas limpias 74 ('mondial 110') y 72 ('keller 110'), mismo kit y
--       mismo veredicto (compatible = true). ────────────────────────────────
DELETE FROM compatibilidades WHERE id = 142;  -- 'Mondial\nY keller'

-- ── 4. BORRAR: reglas escritas como si fueran un modelo. "Todas las 110
--       recorrido corto" no es una moto; el matcheo por modelo nunca la usa
--       (verificado con el barrido de 475 combinaciones), asi que solo ensucia.
--       Si en algun momento hace falta una regla "toda 110 entra", va como
--       regla del kit, no como una fila de moto. ─────────────────────────────
DELETE FROM chat_articulo_compatibilidad WHERE id IN (20, 43, 78, 104, 143, 183, 201, 230, 265);
DELETE FROM compatibilidades             WHERE id IN (44, 87, 104);

COMMIT;

-- NO se tocan (a proposito):
--   * chat_articulo_compatibilidad 385/386/387 'Motor cerro 150 cc sin
--     balanceador': no es un modelo, es el tipo de motor al que apunta el Kit
--     200 — y eso es exactamente el publico del kit. Es inerte para el matcheo
--     por modelo y el Kit 200 ya tiene sus modelos reales cargados en
--     `chat_combo_compatibilidad` (rx 150, s2 150, skua 150...).
--   * `compatibilidades` id 119 'motomel' (fila de MARCA sola): el codigo ya la
--     ignora cuando el cliente nombro un modelo. Si Martin quiere, se puede
--     borrar; se deja porque sigue sirviendo para "tengo una motomel" a secas.
