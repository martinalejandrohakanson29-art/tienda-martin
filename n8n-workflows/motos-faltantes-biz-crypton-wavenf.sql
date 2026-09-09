-- Cierra la grieta entre `motos_modelos` (catálogo de reconocimiento) y las
-- tablas de compatibilidad: había motos con veredicto y motivo cargados en
-- compat que el bot escalaba en silencio porque no las "reconocía".
-- Origen: conv 503 (Honda Biz 105), 09/09/2026.

-- 1. Motos reales que ya tenían filas de compatibilidad y no estaban cargadas.
INSERT INTO motos_modelos (marca, modelo, nombre_completo, cilindrada, aliases) VALUES
  ('Honda',  'Biz 105',     'Honda Biz 105',      105, ARRAY['biz 105','honda biz 105','biz105','viz 105','honda viz 105']),
  ('Honda',  'Biz 110',     'Honda Biz 110',      110, ARRAY['biz 110','honda biz 110','biz110']),
  ('Honda',  'Biz 125',     'Honda Biz 125',      125, ARRAY['biz 125','honda biz 125','biz125']),
  ('Yamaha', 'Crypton 110', 'Yamaha Crypton 110', 110, ARRAY['crypton','cripton','criptón','criponton','cryp','yamaha crypton','crypton 110']);

-- 2. La Wave NF no es otra moto: es cómo el cliente nombra la misma Wave.
--    Los veredictos de compat de "wave", "wave s", "wave nf" y "honda wave nf"
--    coinciden, así que entran como alias del modelo que ya existe.
UPDATE motos_modelos
SET aliases = aliases || ARRAY['nf','nf 100','wave nf','honda wave nf','wave nf 100','wuave','wuaver','wawe'],
    actualizado_en = now()
WHERE nombre_completo = 'Honda Wave 110';

-- 3. Tandas del aprendizaje corruptas: filas que dicen "no compatible" a TODO
--    (incluido filtro de aire y codo, que entran en cualquier moto) y
--    contradicen la grafía canónica del mismo modelo. Sin ellas, los alias de
--    arriba colapsan las dos grafías y el veredicto quedaría indefinido.
--    Backup en chat_articulo_compatibilidad_bk_20260909.
DELETE FROM chat_articulo_compatibilidad WHERE lower(modelo_moto) = 'honda viz 105';
DELETE FROM chat_articulo_compatibilidad WHERE lower(modelo_moto) = 'weve nf';
DELETE FROM chat_articulo_compatibilidad WHERE lower(modelo_moto) = 'criptón';
