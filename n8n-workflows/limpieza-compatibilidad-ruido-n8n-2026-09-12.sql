-- SEGUNDA LIMPIEZA DEL RUIDO QUE DEJO EL APRENDIZAJE AUTOMATICO DE n8n
--
-- Continuacion de `limpieza-compatibilidad-datos-n8n.sql` (08/09). Aquella
-- barrio las filas cuyo `modelo_moto` describia una PIEZA ("negro de
-- fundicion"); esta barre las que guardaron otra cosa que tampoco es la moto
-- del cliente: la marca del kit, una spec del cilindro, un pedazo de frase, o
-- dos motos juntas con veredictos distintos bajo un solo "compatible".
--
-- Por que ahora: conv 4028 (12/09). La fila 'S2 perno 15 Motomel' le confirmo
-- compatibilidad a una "Jawa 150 Supernova" porque "su-PERNO-va" contiene
-- "perno". El scorer ya se arreglo (`tokensDeModeloCoinciden` no matchea mas
-- substrings en el medio de una palabra), pero la fila seguia siendo ruido.
--
-- Detectadas con una auditoria de palabras huerfanas: tokens del `modelo_moto`
-- que no aparecen en NINGUN nombre ni alias de `motos_modelos`.
--
-- Correr con: node scratch/correr-sql.js n8n-workflows/limpieza-compatibilidad-ruido-n8n-2026-09-12.sql
-- Verificar con: npx tsx bot-agente/pruebas/sweep-compatibilidad.ts
--
-- REVERSIBLE: antes de tocar nada se copia todo a tablas `*_bk_20260912`.

BEGIN;

-- ── 0. Backup completo (para poder volver atras) ────────────────────────────
CREATE TABLE IF NOT EXISTS chat_articulo_compatibilidad_bk_20260912 AS
    SELECT * FROM chat_articulo_compatibilidad;
CREATE TABLE IF NOT EXISTS chat_combo_compatibilidad_bk_20260912 AS
    SELECT * FROM chat_combo_compatibilidad;
CREATE TABLE IF NOT EXISTS compatibilidades_bk_20260912 AS
    SELECT * FROM compatibilidades;

-- ── 1. NORMALIZAR: son motos reales con texto de mas pegado. Se les deja el
--       modelo limpio; el veredicto, el kit y el detalle no se tocan. ────────

-- El año no identifica la moto y "modelo" es relleno. Ojo: NO es redundante con
-- la fila limpia 'corven 110' (274-277), que cubre otros articulos.
UPDATE chat_articulo_compatibilidad SET modelo_moto = 'Corven 110'
 WHERE id IN (429, 430);

-- "escuter" es el tipo de carroceria, no parte del nombre (y traia doble espacio).
UPDATE chat_articulo_compatibilidad SET modelo_moto = 'Motomel VX 150'
 WHERE id IN (449, 450);

UPDATE chat_combo_compatibilidad SET modelo_moto = 'Imsa 125 Road'
 WHERE id = 83;

-- "Serie 2" es como el cliente nombra la Motomel S2. Se deja el nombre
-- canonico, que es el que resuelve contra `motos_modelos`.
UPDATE compatibilidades SET modelo_moto = 'Motomel S2 150'
 WHERE id = 172;

-- ── 2. PARTIR: una fila con DOS motos. El detalle dice que ninguna de las dos
--       lleva nada ("No hay nada compatible con Motomel 200 ni con XLR 125"),
--       asi que el veredicto es el mismo para las dos y no se pierde nada al
--       separarlas. Ninguna de las dos tiene fila propia todavia. ────────────
UPDATE chat_articulo_compatibilidad SET modelo_moto = 'Motomel 200'
 WHERE id IN (530, 531);

INSERT INTO chat_articulo_compatibilidad (articulo_id, modelo_moto, compatible, detalle)
VALUES
    (18, 'XLR 125', false, 'No tenemos nada compatible con la XLR 125.'),
    (17, 'XLR 125', false, 'No tenemos nada compatible con la XLR 125.');

-- ── 3. BORRAR: el `modelo_moto` no es la moto del cliente, y ya existe la fila
--       limpia que cubre el MISMO articulo con el MISMO veredicto. Cada bloque
--       dice cual es esa fila: sin ella, esto no se borraria. ────────────────

-- 'S2 perno 15 Motomel': "perno 15" es la spec del cilindro (diametro de perno),
-- no una moto. La que disparo la conv 4028.
-- Cubiertas por: 305 y 289 ('s2 150', mismos articulos 18 y 17, SI).
--
-- 'serie 2, 𝕏ℝ 𝟙𝟚𝟝': dos motos con veredictos OPUESTOS bajo un solo
-- compatible=true — el propio detalle dice "Le va perfecto a la Serie 2. Para la
-- XR 125 no tenemos nada". Ademas con caracteres unicode matematicos, que
-- `normalizarTexto` no convierte a letras.
-- Cubiertas por: las mismas 305 y 289 ('s2 150').
DELETE FROM chat_articulo_compatibilidad WHERE id IN (479, 480, 471, 472);

-- 'Y keller': pedazo de "Mondial y Keller" — el aprendizaje se comio la primera
-- moto y dejo la conjuncion. Su hermana de `compatibilidades` (id 142,
-- 'Mondial\nY keller') ya se borro el 08/09 por lo mismo.
-- Cubiertas por: 173 y 255 ('keller 110') y 178 y 260 ('Keller Crono 110').
DELETE FROM chat_articulo_compatibilidad WHERE id IN (482, 484);

-- 'Marca malen': el cliente pregunto por la MARCA DEL KIT, no por su moto — el
-- detalle lo dice solo ("No tenemos el kit marca Male/Malen; el kit 170
-- disponible es marca Kmisno"). Guardada como compatible=false, o sea que podia
-- negarle el kit a alguien por una pregunta que no era de compatibilidad.
DELETE FROM chat_articulo_compatibilidad WHERE id IN (503, 504);

-- 'faro cuadrado': asi describio el cliente su moto, pero no nombra ninguna.
-- Cubiertas por: 266, 21 y 142 (fila generica '110', mismos articulos 16, 7 y
-- 12, SI). El detalle que traia ("va sin modificaciones, usa los resortes
-- originales") ya esta en la ficha del articulo.
DELETE FROM chat_articulo_compatibilidad WHERE id IN (436, 437, 438);

-- 'Motomel serie 2': duplicado exacto de la fila 14 ('s2 150'), mismo kit_id 12
-- y mismo compatible=true. La de `compatibilidades` (172) no se borra porque no
-- tiene equivalente: se normalizo arriba.
DELETE FROM chat_combo_compatibilidad WHERE id = 98;

-- 'Yamaha clitoy la 2009': el nombre esta ilegible. El veredicto que aporta
-- (NO para el Combo Escape pwr + Leva 6.40) ya lo dan las filas 'crypton'
-- (190, 215, 244) sobre los articulos de ese mismo combo.
DELETE FROM compatibilidades WHERE id = 60;

COMMIT;

-- NO se tocan (a proposito). Son palabras huerfanas para la auditoria, pero no
-- son ruido:
--   * 'motor 110' (12 filas) y 'motor zanella' (8): no salieron del aprendizaje
--     sino del lote que cargo el equipo el 20/08 (las de `compatibilidades`
--     tienen fuente 'admin'/'equipo'). Son las reglas genericas "le va a
--     cualquier 110 / a cualquier motor Zanella".
--   * 'Motor cerro 150 cc sin balanceador' (385-387, 606): ya se habia decidido
--     dejarla el 08/09 — no es un modelo, es el tipo de motor al que apunta el
--     Kit 200, que es justo su publico.
--   * 'zanella due 110', 'Zanella due', 'cerro 150', 'dlx', 'nomad',
--     'sapucai 150', 'stratus 150', 'okinoi tango 110 cc', 'Siam 110',
--     'beta 110', 'appia citi'...: son MOTOS REALES que no estan en
--     `motos_modelos`. Que el catalogo canonico no las tenga no las hace ruido;
--     su fila literal es lo unico que las contesta.
--   * 'motomel s2 190 cc' (493, 494): un S2 al que ya le hicieron 190cc. Es raro
--     pero es una moto concreta y el veredicto es deliberado.
