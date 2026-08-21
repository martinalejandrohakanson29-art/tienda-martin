-- Categoría de pieza (a nivel artículo) y categoría de combo (a nivel pack/
-- grupo), 2026-08-21. Disparador real: conv 2331 (+5493863690579) preguntó
-- "Precio del escape pwr" y el bot no supo ubicarlo — el precio ya estaba
-- cargado (chat_articulos id 13, $95.000) pero no había forma determinística
-- de reconocer "esto es un escape" sin que el alias coincida letra por letra.
--
-- Dos conceptos separados, a propósito (no comparten valores ni tabla):
--   - categoría de ARTÍCULO = tipo de pieza (escape, leva, cilindro...). Sirve
--     para el matching de piezas sueltas: si el kit pineado tiene un solo
--     artículo de esa categoría, alcanza con que el cliente la nombre en
--     criollo para saber a cuál se refiere, sin depender de que el alias
--     matchee exacto. Si el kit tiene 2+ artículos de la misma categoría
--     (ej. las 2 levas), es la señal de que hace falta desambiguar.
--   - categoría de COMBO = qué resuelve el kit en general (ej. "potenciación
--     110"). No ayuda a identificar una pieza — es para un caso todavía sin
--     construir (preguntas tipo "qué tenés para potenciar mi 110" sin nombrar
--     ningún kit puntual).
--
-- Texto libre a propósito (no un tipo ENUM ni un CHECK de valores permitidos):
-- la lista de categorías la valida el código de la app (constante editable,
-- ver CATEGORIAS_ARTICULO en app/actions/chat-catalogo.ts), así se puede
-- sumar una categoría nueva sin migración. El paso de matching en n8n (todavía
-- sin construir, ver CHATWOOT-BOT-CONTEXTO.md) es el que le va a dar uso real
-- a estas columnas.
--
-- El campo de combo se replica en chat_packs (para un pack sin grupo) y en
-- chat_pack_grupos (para cuando el pack pertenece a un grupo) — mismo patrón
-- ya usado con mensaje_bienvenida/foto_url: la variante agrupada comparte el
-- dato del grupo, no lo repite por pack.
--
-- Correr UNA VEZ en el Postgres de producción. Aditivo, sin riesgo: todo NULL
-- por default, ningún artículo/pack/grupo existente cambia de comportamiento.

ALTER TABLE chat_articulos ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE chat_packs ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE chat_pack_grupos ADD COLUMN IF NOT EXISTS categoria text;
