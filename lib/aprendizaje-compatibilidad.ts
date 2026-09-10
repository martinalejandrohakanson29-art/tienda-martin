import { prisma } from "@/lib/prisma"
import { normalizarTexto, puntuarItemCatalogo } from "@/bot-agente/nucleo/texto"
import { obtenerConfiguracionAgente } from "@/bot-agente/configuracion"
import { textoCompatibleSugerido, textoIncompatibleSugerido, type DestinoCompat } from "@/lib/compat-mensaje"

/**
 * Aprendizaje de compatibilidad dentro de la app.
 *
 * Por qué existe: hasta el pase a bot-agente en vivo (07/09) el circuito era
 * "el equipo contesta una nota privada en Chatwoot -> el workflow de n8n la
 * parsea, guarda la compatibilidad y le responde al cliente". Con n8n apagado
 * ese eslabón quedó sin dueño: `responderPendienteTecnica` seguía mandando la
 * nota con la marca [[RM_TECNICA:...]] y nadie la leía nunca. Resultado: los
 * escalados se cerraban a mano (check "Marcar como resuelto") y el dato se
 * perdía — `compatibilidades` no sumó una fila desde el 20/08.
 *
 * Acá vive lo que hacía n8n, sin IA de por medio: el equipo elige Sí/No + el
 * detalle, y esto lo escribe en las tablas que el resolutor de compatibilidad
 * realmente lee (ver bot-agente/herramientas/compatibilidad.ts).
 */

export type { DestinoCompat }

export type ResultadoAprendizaje = {
    destino: DestinoCompat
    modeloMoto: string
    compatible: boolean
    /** Filas escritas por tabla, para poder mostrar qué se guardó. */
    filas: { combo: number; legacy: number; articulos: number }
    /** Texto sugerido para el cliente (el equipo lo puede editar antes de enviar). */
    mensajeSugerido: string
}

/**
 * Kits disponibles como destino. Los grupos van primero: cuando un combo tiene
 * variantes (recorrido corto/largo), la compatibilidad es del GRUPO — no de una
 * de las dos variantes. Cargarla en el pack dejaría la otra variante sin regla.
 */
export async function listarDestinosCompat(): Promise<DestinoCompat[]> {
    const [grupos, packs] = await Promise.all([
        prisma.$queryRaw<{ id: number; nombre: string }[]>`
            SELECT id, nombre FROM chat_pack_grupos WHERE activo = true ORDER BY nombre ASC
        `,
        prisma.$queryRaw<{ id: number; nombre: string; grupo_id: number | null }[]>`
            SELECT id, nombre, grupo_id FROM chat_packs WHERE activo = true ORDER BY nombre ASC
        `,
    ])

    return [
        ...grupos.map((g) => ({ tipo: "grupo" as const, id: Number(g.id), nombre: g.nombre })),
        // Un pack que pertenece a un grupo no se ofrece suelto: su compatibilidad
        // la manda el grupo (si no, se cargan reglas que contradicen a su hermana).
        ...packs
            .filter((p) => p.grupo_id == null)
            .map((p) => ({ tipo: "pack" as const, id: Number(p.id), nombre: p.nombre })),
    ]
}

/**
 * Mejor destino para el nombre de kit que quedó guardado en la pendiente (texto
 * libre que escribió el modelo al escalar). Devuelve null si no hay un match
 * razonable: en ese caso la UI obliga a elegir el kit a mano en vez de adivinar
 * — una compatibilidad cargada en el kit equivocado es peor que no cargarla.
 */
export async function resolverDestinoPorNombre(
    nombre: string | null | undefined,
    destinos?: DestinoCompat[]
): Promise<DestinoCompat | null> {
    const buscado = (nombre || "").trim()
    if (!normalizarTexto(buscado)) return null

    const lista = destinos ?? (await listarDestinosCompat())
    let mejor: { destino: DestinoCompat; puntaje: number } | null = null

    for (const destino of lista) {
        const puntaje = puntuarItemCatalogo(buscado, destino.nombre)
        if (!mejor || puntaje > mejor.puntaje) mejor = { destino, puntaje }
    }

    // Piso alto a propósito: esto solo PRESELECCIONA el kit en el formulario. Si
    // el nombre que dejó el escalado no matchea con claridad, es mejor que el
    // equipo lo elija a mano que cargar la regla en el kit equivocado. Con un
    // piso más bajo, "Escape DM Curvo" (un escape que no vendemos) se llevaba el
    // "Combo Escape pwr + Leva 6.40" solo por compartir la palabra "escape".
    if (!mejor || mejor.puntaje < 300) return null
    return mejor.destino
}

/**
 * `kit_id` que le corresponde a una fila de `compatibilidades` (la tabla legacy).
 *
 * Acá vivía el bug que rompía "Aprender y responder": se guardaba el id del
 * grupo/pack de `chat_pack_grupos`/`chat_packs`, pero esa columna es una FK a
 * `kits_publicidad` — otra tabla, con otra numeración. Con un kit cuyo id no
 * existe allá (el "kit dakar 200 economico" es el pack 12 y `kits_publicidad`
 * llega hasta 9) el INSERT moría con violación de foreign key, y el escalado
 * quedaba sin cerrar. Cuando el id SÍ existía era peor que un error: la fila
 * quedaba colgada del kit viejo equivocado (el grupo 3 "Tapa CDI + Cilindro 120"
 * apuntaba al "KIT POTENCIADO 220cc"), que es lo que agrupa el panel de
 * /admin/chatwoot/conocimiento y lo que borra en cascada eliminar un kit viejo.
 *
 * Se matchea por nombre exacto (normalizado) porque es el único puente confiable
 * entre las dos numeraciones; si el kit nuevo no existe en la tabla vieja, `null`.
 * El bot no pierde nada: en las filas legacy el kit se resuelve por NOMBRE
 * (`coincideKitPedido` en bot-agente/herramientas/compatibilidad.ts), no por id.
 */
async function idKitPublicidadPorNombre(nombre: string): Promise<number | null> {
    const buscado = normalizarTexto(nombre)
    if (!buscado) return null

    const filas = await prisma
        .$queryRaw<{ id: number; nombre: string }[]>`SELECT id, nombre FROM kits_publicidad`
        .catch(() => [] as { id: number; nombre: string }[])

    const match = filas.find((k) => normalizarTexto(k.nombre) === buscado)
    return match ? Number(match.id) : null
}

/** "Sí, el Kit 120 para 110 le va bien a tu Gilera Smash." / el texto de incompatibilidad configurado. */
export async function armarMensajeCompatibilidad(params: {
    compatible: boolean
    modeloMoto: string
    kitNombre: string
    detalle?: string | null
}): Promise<string> {
    const detalle = (params.detalle || "").trim()
    const moto = params.modeloMoto.trim()

    if (params.compatible) {
        return textoCompatibleSugerido(params.kitNombre, moto, detalle)
    }

    // El texto de "no es compatible" es editable por el equipo en
    // /admin/chatwoot/catalogo (chat_config.mensaje_incompatibilidad): se usa el
    // mismo que manda el bot, para no tener dos redacciones distintas para lo mismo.
    const config = await obtenerConfiguracionAgente().catch(() => null)
    return textoIncompatibleSugerido(config?.mensajeIncompatibilidad || "", moto, detalle)
}

/**
 * Guarda la compatibilidad que cargó el equipo en las tablas que el bot lee.
 *
 * Dónde escribe y por qué:
 *  - `chat_combo_compatibilidad`: destino natural del kit/grupo, y la primera
 *    fuente que consulta el resolutor.
 *  - `compatibilidades` (legacy): el resolutor la sigue leyendo, y es la tabla
 *    que mira el sweep anti-regresión. Se escribe con `fuente = 'equipo'`.
 *  - `chat_articulo_compatibilidad`: SOLO si se pide explícitamente
 *    (`aplicarAPiezas`). El workflow de n8n lo hacía siempre y por eso una pieza
 *    periférica del combo terminaba hablando por el cilindro (ver el fix de la
 *    conv 2882): la regla del combo se derramaba a cada artículo suelto.
 *
 * Es idempotente: vuelve a cargar la misma moto para el mismo kit y la fila se
 * reemplaza en vez de duplicarse (dos filas contradictorias para la misma moto
 * son la forma más rápida de que el bot conteste cualquier cosa).
 *
 * Las tres escrituras van en UNA transacción: mientras no lo estuvieron, un
 * error en la segunda tabla dejaba la compatibilidad a medias (cargada donde el
 * bot la lee, ausente donde la busca el sweep) y el escalado abierto, sin que el
 * equipo supiera qué había quedado guardado y qué no.
 */
export async function aprenderCompatibilidad(params: {
    destino: DestinoCompat
    modeloMoto: string
    compatible: boolean
    detalle?: string | null
    aplicarAPiezas?: boolean
}): Promise<ResultadoAprendizaje> {
    const modeloMoto = params.modeloMoto.trim()
    if (!modeloMoto) throw new Error("Falta el modelo de moto a registrar")

    const detalle = (params.detalle || "").trim()
    const { destino, compatible } = params
    const esGrupo = destino.tipo === "grupo"
    const grupoId = esGrupo ? destino.id : null
    const packId = esGrupo ? null : destino.id

    const kitIdLegacy = await idKitPublicidadPorNombre(destino.nombre)

    const { combo, legacy, articulos } = await prisma.$transaction(async (tx) => {
        // 1. chat_combo_compatibilidad (reemplazo, no acumulación)
        await tx.$executeRawUnsafe(
            `DELETE FROM chat_combo_compatibilidad
             WHERE lower(btrim(modelo_moto)) = lower(btrim($1))
               AND (($2::int IS NOT NULL AND grupo_id = $2::int) OR ($3::int IS NOT NULL AND kit_id = $3::int))`,
            modeloMoto,
            grupoId,
            packId
        )
        const combo = await tx.$executeRawUnsafe(
            `INSERT INTO chat_combo_compatibilidad (grupo_id, kit_id, modelo_moto, compatible, detalle, creado_en)
             VALUES ($1::int, $2::int, $3, $4, $5, NOW())`,
            grupoId,
            packId,
            modeloMoto,
            compatible,
            detalle
        )

        // 2. compatibilidades (legacy).
        // El reemplazo se hace por NOMBRE de kit, no por `kit_id`: en esta tabla el
        // id no dice si es un grupo o un pack, y los ids de una y otra tabla se
        // pisan — borrar por id se llevaría puesta la fila de otro kit.
        await tx.$executeRawUnsafe(
            `DELETE FROM compatibilidades
             WHERE lower(btrim(modelo_moto)) = lower(btrim($1))
               AND lower(btrim(kit)) = lower(btrim($2))`,
            modeloMoto,
            destino.nombre
        )
        const legacy = await tx.$executeRawUnsafe(
            `INSERT INTO compatibilidades (modelo_moto, kit, kit_id, compatible, detalle, fuente, creado_en)
             VALUES ($1, $2, $3::int, $4, $5, 'equipo', NOW())`,
            modeloMoto,
            destino.nombre,
            kitIdLegacy,
            compatible,
            detalle
        )

        // 3. Piezas sueltas del kit, solo si se pidió.
        let articulos = 0
        if (params.aplicarAPiezas) {
            const filas = esGrupo
                ? await tx.$queryRaw<{ articulo_id: number }[]>`
                      SELECT DISTINCT cpa.articulo_id
                      FROM chat_pack_articulos cpa
                      JOIN chat_packs p ON p.id = cpa.pack_id
                      WHERE p.grupo_id = ${destino.id}
                  `
                : await tx.$queryRaw<{ articulo_id: number }[]>`
                      SELECT DISTINCT articulo_id FROM chat_pack_articulos WHERE pack_id = ${destino.id}
                  `

            for (const fila of filas) {
                await tx.$executeRawUnsafe(
                    `DELETE FROM chat_articulo_compatibilidad
                     WHERE articulo_id = $1::int AND lower(btrim(modelo_moto)) = lower(btrim($2))`,
                    fila.articulo_id,
                    modeloMoto
                )
                await tx.$executeRawUnsafe(
                    `INSERT INTO chat_articulo_compatibilidad (articulo_id, modelo_moto, compatible, detalle, creado_en)
                     VALUES ($1::int, $2, $3, $4, NOW())`,
                    fila.articulo_id,
                    modeloMoto,
                    compatible,
                    detalle
                )
                articulos++
            }
        }
        return { combo, legacy, articulos }
    })

    const mensajeSugerido = await armarMensajeCompatibilidad({
        compatible,
        modeloMoto,
        kitNombre: destino.nombre,
        detalle,
    })

    return {
        destino,
        modeloMoto,
        compatible,
        filas: { combo: Number(combo), legacy: Number(legacy), articulos },
        mensajeSugerido,
    }
}
