-- Agrega `alias` a kit_articulos (ver n8n-workflows/kit-articulos.sql, ya
-- fusionado ahí para instalaciones nuevas). Necesario para el paso de
-- matching: el nombre técnico completo de un artículo no sirve para
-- reconocer lenguaje de cliente, porque dos artículos del mismo kit pueden
-- compartir una palabra (ej. Kit 8: "TAPA DE CILINDRO CDI 125 COMPLETA" y
-- "CILINDRO 120 54MM PERNO 13" comparten "cilindro" — matchear por nombre
-- completo confundiría los dos artículos con solo decir "el cilindro").
--
-- Correr UNA VEZ en el Postgres de producción, después de kit-articulos.sql
-- (si esa tabla ya existe sin esta columna). Sin riesgo: solo agrega una
-- columna nullable, no toca ninguna fila existente.

ALTER TABLE kit_articulos ADD COLUMN IF NOT EXISTS alias text;
