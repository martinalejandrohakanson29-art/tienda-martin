-- Grupo nuevo del catálogo del bot (2026-09-08): "Kit 120 corto + Leva 6.40".
--
-- Mismo anuncio de Instagram, dos packs reales según la LEVA que le toque al
-- cliente (corta 69mm / larga 74mm). El cilindro es el mismo para las dos
-- variantes (el corto de 54mm, art 7). Precio idéntico ($99.000) — por eso el
-- mensaje de bienvenida del grupo ya lleva el precio, no hay ambigüedad de
-- monto como en el grupo "Kit 120 para 110" (corto/largo).
--
-- compatibilidad_universal = false: la leva tiene incompatibilidades físicas
-- reales (motos donde el escape entra pero la leva no), así que una moto no
-- confirmada se escala en vez de asumir que le va. Mismo criterio que el grupo
-- "Combo Escape pwr + Leva 6.40".
--
-- La compatibilidad fina sale sola de los artículos (cilindro corto art 7,
-- levas art 14/15 ya tienen sus motos cargadas). Acá solo se copian las 4
-- exclusiones duras a nivel combo del grupo "Kit 120 para 110" (alesar
-- cárteres).
--
-- Artículos referenciados (ya cargados en chat_articulos):
--   7  -> Cilindros Smash 125 54 C/corta Potenciado
--   14 -> Leva Competicion 110 Corta 6.4 Res Y Bal Boggie
--   15 -> Leva Competicion 110 Larga 6.4 Boggie
--
-- Correr UNA VEZ. Idempotente por nombre de grupo (aborta si ya existe).

BEGIN;

DO $$
DECLARE
    v_grupo_id   integer;
    v_pack_corta integer;
    v_pack_larga integer;
    v_envio      text := 'Envío gratis a todo el país por Andreani a domicilio. Llegamos a todas las provincias. Demora de 4 a 6 días hábiles.';
    v_detalle    text := 'El kit viene completo y listo para instalar: cilindro 120 potenciado + leva de calle mejorada con resortes originales y balancines tipo original. La leva se coloca con punto original y mejora el rendimiento en todos los regímenes de RPM. No hace falta modificarle nada a la moto para colocarlo.';
BEGIN
    IF EXISTS (SELECT 1 FROM chat_pack_grupos WHERE nombre = 'Kit 120 corto + Leva 6.40') THEN
        RAISE EXCEPTION 'El grupo "Kit 120 corto + Leva 6.40" ya existe — abortado.';
    END IF;

    INSERT INTO chat_pack_grupos
        (nombre, plantillas_bienvenida, plantillas_referral, mensaje_bienvenida,
         pregunta_variante, pregunta_variante_reintento, foto_url, categoria,
         compatibilidad_universal, activo)
    VALUES (
        'Kit 120 corto + Leva 6.40',
        '¿Hola quier mas informacion sobre el kit 120 + leva de calle de 6.4?',
        NULL,
        E'Hola, cómo va! 🔥\n\nEl combo Kit 120 corto + leva de calle de 6.40 sale $99.000 con envío gratis a todo el país.\n\nIncluye:\n✅ Kit de cilindro completo, diámetro 54 mm\n✅ Leva de calle de 6.40, no precisa modificaciones\n\nA qué moto se lo querés poner?',
        'Tu moto tiene leva corta (69mm) o larga (74mm)? Si no estás seguro hay que desarmar la tapa y medir.',
        NULL,
        NULL,
        'Potenciacion 110',
        false,
        true
    )
    RETURNING id INTO v_grupo_id;

    -- Variante 1: leva corta ---------------------------------------------------
    INSERT INTO chat_packs
        (nombre, precio, envio, mensaje_bienvenida, foto_url,
         plantillas_bienvenida, plantillas_referral, detalle, activo,
         grupo_id, criterio_variante, categoria, sinonimos_variante)
    VALUES (
        'Kit 120 corto + leva 6.40 corta',
        99000,
        v_envio,
        'Genial, entonces te corresponde el Kit 120 corto + leva 6.40 corta — $99.000, envío gratis a todo el país. Si te interesa avisanos y coordinamos.',
        NULL, NULL, NULL,
        v_detalle,
        true,
        v_grupo_id,
        'leva corta',
        NULL,
        ARRAY['corta','leva corta','69','69mm','6.40 corta']
    )
    RETURNING id INTO v_pack_corta;

    INSERT INTO chat_pack_articulos (pack_id, articulo_id, cantidad, orden) VALUES
        (v_pack_corta, 7,  1, 0),
        (v_pack_corta, 14, 1, 1);

    -- Variante 2: leva larga -------------------------------------------------
    INSERT INTO chat_packs
        (nombre, precio, envio, mensaje_bienvenida, foto_url,
         plantillas_bienvenida, plantillas_referral, detalle, activo,
         grupo_id, criterio_variante, categoria, sinonimos_variante)
    VALUES (
        'Kit 120 corto + leva 6.40 larga',
        99000,
        v_envio,
        'Genial, entonces te corresponde el Kit 120 corto + leva 6.40 larga — $99.000, envío gratis a todo el país. Si te interesa avisanos y coordinamos.',
        NULL, NULL, NULL,
        v_detalle,
        true,
        v_grupo_id,
        'leva larga',
        NULL,
        ARRAY['larga','leva larga','74','74mm','6.40 larga']
    )
    RETURNING id INTO v_pack_larga;

    INSERT INTO chat_pack_articulos (pack_id, articulo_id, cantidad, orden) VALUES
        (v_pack_larga, 7,  1, 0),
        (v_pack_larga, 15, 1, 1);

    -- Exclusiones duras a nivel combo (copiadas del grupo "Kit 120 para 110")
    INSERT INTO chat_combo_compatibilidad (grupo_id, modelo_moto, compatible, detalle)
    VALUES
        (v_grupo_id, 'crypton',       false, 'Para que entre hay que hacerle modificaciones al motor (alesar los cárteres) — no es un cambio directo de fábrica.'),
        (v_grupo_id, 'biz',           false, 'Para que entre hay que hacerle modificaciones al motor (alesar los cárteres) — no es un cambio directo de fábrica.'),
        (v_grupo_id, 'honda wave nf', false, 'Para que entre hay que hacerle modificaciones al motor (alesar los cárteres) — no es un cambio directo de fábrica.'),
        (v_grupo_id, 'wave s',        false, 'Para que entre hay que hacerle modificaciones al motor (alesar los cárteres) — no es un cambio directo de fábrica.');

    RAISE NOTICE 'grupo=% pack_corta=% pack_larga=%', v_grupo_id, v_pack_corta, v_pack_larga;
END $$;

COMMIT;
