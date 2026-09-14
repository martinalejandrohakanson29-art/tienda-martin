-- ============================================================================
-- Situacion: piden el catalogo/lista de precios en general (sin aclarar si es
-- por unidad o por mayor).
--
-- Conv con +5493773602026 (14/09): pidio el catalogo y el bot le tiro TODOS
-- los kits activos (incluyendo cilindradas que no tenian nada que ver con el
-- kit de 110 por el que habia entrado). Ademas, un pedido de "catalogo" asi de
-- generico muchas veces es un revendedor preguntando lista mayorista, y hasta
-- ahora el bot no preguntaba nada: iba directo a mostrar precios de unidad.
--
-- Esta situacion hace que el bot haga PRIMERO la pregunta que hace Martin a
-- mano ("Por mayor o por unidad?") antes de llamar a consultar_catalogo_y_precios
-- o dar cualquier precio. Si el cliente ya aclaro "por mayor" en el mismo
-- mensaje, la situacion 'mayorista' (ya existente) prioriza y escala en
-- silencio sin preguntar nada.
--
-- Correr:  node scratch/correr-sql.js n8n-workflows/chat-situaciones-catalogo-mayor-unidad.sql
-- ============================================================================
INSERT INTO chat_situaciones (clave, titulo, disparadores, instruccion, activo, orden)
VALUES
  ('catalogo_generico_mayor_unidad',
   'Pide el catalogo/lista de precios en general (sin aclarar mayor o unidad)',
   ARRAY['el catalogo','los catalogos','mandame el catalogo','pasame el catalogo','tienen catalogo','que catalogo tienen','catalogo completo','catalogo de kits','catalogo de productos','que kits tenes','que kits tienen','que combos tenes','que combos tienen','que productos tienen','que productos venden','lista de precios','pasame la lista de precios','pasame los precios','que precios tienen','que variedad tienen','que tenes disponible','que tienen disponible','vendes por catalogo','venden por catalogo'],
   'El cliente pidio el catalogo, la lista de kits o los precios en general, sin decir todavia si busca por unidad o por mayor. ANTES de llamar a consultar_catalogo_y_precios o dar cualquier precio, pregunta corto y directo: "Por mayor o por unidad?". No listes kits ni des precios en este mensaje. Excepcion: si en este mismo mensaje el cliente ya aclaro que es por unidad (o ya nombro un producto o su moto puntual), no preguntes nada y seguí el flujo normal. Si ya aclaro que es por mayor, tampoco preguntes: ejecuta escalar_a_humano con motivo "mayorista" y guarda silencio total (esa es la situacion "mayorista", que prioriza sobre esta si tambien aparece).',
   true, 45)
ON CONFLICT (clave) DO UPDATE
  SET titulo = EXCLUDED.titulo, disparadores = EXCLUDED.disparadores,
      instruccion = EXCLUDED.instruccion, activo = true, actualizado_en = now();
