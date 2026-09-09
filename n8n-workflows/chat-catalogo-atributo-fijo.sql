-- Atributo FIJO del pack (2026-09-09). Disparador real: conv 3791.
--
-- El grupo "Kit 120 corto + Leva 6.40" tiene DOS dimensiones, no una:
--   * el recorrido del cilindro, que está FIJO en corto (es el art 7, 54mm), y
--   * la leva (69mm / 74mm), que es la única que el bot pregunta.
-- El recorrido vivía solamente en el NOMBRE del pack, invisible para el motor.
-- Resultado: un cliente que dijo "recorrido largo" recibió "para tu Guerrero
-- Trip va el recorrido largo con leva larga, $99.000" — el combo que le
-- cotizó es el CORTO. Le confirmamos algo falso sobre el producto.
--
-- Se agregan dos columnas, con el mismo hábito de carga que
-- `sinonimos_variante` (dato que carga Martín en el admin, cero razonamiento
-- del LLM):
--
--   atributo_fijo            texto legible de lo que este pack NO puede
--                            cambiar, ej. "recorrido corto". Se le pasa al
--                            modelo como dato duro para que no redacte lo
--                            contrario.
--   atributo_fijo_contradice sinónimos que DESMIENTEN ese atributo. Si el
--                            cliente dice uno, este pack no le sirve.
--
-- Importante: acá se cargan solo frases INEQUÍVOCAS ("recorrido largo",
-- "aluminio", "plateado", "32 dientes"). NO van "largo" ni "larga" sueltos:
-- en este grupo esas palabras significan la LEVA, que sí es variable. Esa
-- colisión de vocabulario entre grupos es justamente el origen del bug.
--
-- Aditivo: los packs que no cargan estas columnas se comportan igual que hoy.
--
-- Correr UNA VEZ en el Postgres de producción.

BEGIN;

ALTER TABLE chat_packs ADD COLUMN IF NOT EXISTS atributo_fijo text;
ALTER TABLE chat_packs ADD COLUMN IF NOT EXISTS atributo_fijo_contradice text[];

-- Grupo "Kit 120 corto + Leva 6.40": las dos variantes llevan el cilindro
-- corto (art 7). El combo con leva para recorrido largo NO existe armado —
-- por eso el cliente de recorrido largo se ESCALA, no se le ofrece nada.
UPDATE chat_packs p
SET atributo_fijo = 'recorrido corto',
    atributo_fijo_contradice = ARRAY[
        'recorrido largo',
        'recorrido larga',
        'aluminio plateado',
        'aluminio',
        'plateado',
        '32 dientes',
        'c/larga',
        'cilindro largo'
    ]
FROM chat_pack_grupos g
WHERE p.grupo_id = g.id
  AND g.nombre = 'Kit 120 corto + Leva 6.40';

COMMIT;
