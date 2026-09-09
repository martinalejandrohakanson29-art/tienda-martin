-- La Bajaj Rouser 125 tenía filas de compatibilidad cargadas (escape Paolucci y
-- las dos levas) pero no estaba en `motos_modelos`: al cliente que escribía
-- "rouser 125" el bot le repreguntaba en vez de contestarle, siendo que el dato
-- era suyo. Misma grieta que la Biz 105 (conv 503).
--
-- NO se le pone el alias "rouser" pelado: ese ya es de la Rouser NS 200, y un
-- alias sin cilindrada es justo lo que hacía que la fila "rouser 125" hablara
-- por la NS 200.
INSERT INTO motos_modelos (marca, modelo, nombre_completo, cilindrada, aliases) VALUES
  ('Bajaj', 'Rouser 125', 'Bajaj Rouser 125', 125, ARRAY['rouser 125','bajaj rouser 125','rouser125','rouser ns 125']);
