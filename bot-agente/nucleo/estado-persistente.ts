import { prisma } from "@/lib/prisma"
import { formatearPrecioAR, normalizarTexto } from "./texto"

/**
 * ESTADO PERSISTENTE DEL EMBUDO (memoria explícita, agnóstica al eje de variante)
 * -----------------------------------------------------------------------------
 * Antes: se intentaba adivinar del historial (regex "corto o largo") qué quedaba
 * resuelto. Se rompía en cuanto el eje cambiaba (color, mm...).
 *
 * Ahora: el motor guarda en `chat_conversacion_estado`, al final de cada turno,
 * lo que efectivamente resolvieron las herramientas:
 *   - combo pineado (consultar_catalogo_y_precios devolvió 1 solo grupo)
 *   - variante resuelta (resolver_variante devolvió `resuelta: true`)
 *   - moto confirmada (consultar_compatibilidad devolvió compatible)
 * y lo lee al empezar el siguiente turno para armar el bloque MEMORIA DE ESTADO.
 *
 * Degradación: si la tabla no existe todavía o no hay `clave`, todo es no-op y
 * el bot funciona igual (sin memoria persistente).
 */

export interface EstadoConversacion {
    grupoPineado?: { id: number; nombre: string } | null
    varianteResuelta?: { packId: number; etiqueta: string; precio: number } | null
    motoConfirmada?: string | null
    /**
     * Pack SUELTO (kit sin grupo de variantes) que ya se le presentó al cliente
     * con su ficha y su foto. Evita repetir la bienvenida y reenviar la imagen
     * en los turnos siguientes. Equivalente a `grupoPineado` pero para packs.
     */
    packPresentado?: { id: number; nombre: string; precio: number } | null
    /**
     * Temas de negocio (`info_negocio.tema`) que YA se le contestaron al cliente
     * en esta conversación: "envios", "ubicacion", "medios de pago"...
     *
     * Es el antídoto contra el volcado repetido: `consultar_info_negocio` devolvía
     * el bloque oficial entero en cada turno sin saber si ya se había dicho, y el
     * modelo lo re-emitía porque la guía de la herramienta le gana a la regla de
     * "no repitas" del prompt. Con esta lista la herramienta cambia su guía y el
     * bloque MEMORIA DE ESTADO lo recuerda.
     */
    temasRespondidos?: string[]
    /**
     * Consulta que YA se derivó al equipo y sigue esperando respuesta humana.
     * Se limpia sola cuando un humano del equipo contesta en el chat.
     *
     * Antes no quedaba rastro del escalado: el turno siguiente arrancaba en
     * blanco y el bot hablaba por encima de una consulta que él mismo había
     * derivado (conv 3637, 08/09: escaló el escape para varillero S2, el
     * cliente insistió con "??" y contestó sobre otro kit).
     */
    escaladoPendiente?: { motivo: string; resumen: string; en: string } | null
    /**
     * Negativa de compatibilidad que YA se le dio al cliente en esta charla.
     *
     * Las herramientas de compat no tienen memoria: miran "moto + kit" y
     * devuelven el veredicto de la fila, y la guía le ordena al modelo copiar
     * la línea tal cual. Sin este rastro el cliente podía decir cualquier cosa
     * ("ya lo tengo modificado", "no importa, lo compro igual") y recibía la
     * MISMA negativa palabra por palabra (conv 3874, Wave NF).
     */
    negativaEntregada?: { moto: string; kit: string; detalle: string; en: string } | null
}

const VACIO: EstadoConversacion = {}

/**
 * Un escalado deja de pesar en la memoria pasado un dia: si el equipo nunca
 * contesto en el chat (lo resolvio por afuera, el cliente cambio de tema),
 * no queremos que el bot siga mudo para siempre por una consulta de anteayer.
 */
const ESCALADO_PENDIENTE_VIGENCIA_MS = 24 * 60 * 60 * 1000

/**
 * La negativa pesa una semana. Es más que el escalado a propósito: el cliente
 * que se va a mandar a alesar el motor vuelve a los días, y volver a recibir el
 * "no le va" cuando escribe de nuevo es justo el destrato que evitamos.
 */
const NEGATIVA_VIGENCIA_MS = 7 * 24 * 60 * 60 * 1000

/** Clave canónica de un tema para comparar sin duplicar por mayúsculas/acentos. */
export function normalizarTema(tema: string): string {
    return normalizarTexto(tema)
}

/** Une temas sin duplicados, preservando el orden en que se fueron respondiendo. */
export function unirTemas(previos: string[] | null | undefined, nuevos: string[]): string[] {
    const salida: string[] = []
    const vistos = new Set<string>()
    for (const t of [...(previos || []), ...nuevos]) {
        const clave = normalizarTema(t)
        if (!clave || vistos.has(clave)) continue
        vistos.add(clave)
        salida.push(clave)
    }
    return salida
}

function vigente(en: Date | null, ventanaMs: number): boolean {
    if (!en) return false
    return Date.now() - new Date(en).getTime() < ventanaMs
}

function escaladoVigente(en: Date | null): boolean {
    return vigente(en, ESCALADO_PENDIENTE_VIGENCIA_MS)
}

export async function cargarEstadoConversacion(clave?: string): Promise<EstadoConversacion> {
    if (!clave) return { ...VACIO }
    try {
        const filas = await prisma.$queryRaw<
            {
                grupo_pineado_id: number | null
                grupo_pineado_nombre: string | null
                variante_pack_id: number | null
                variante_etiqueta: string | null
                variante_precio: any
                moto_confirmada: string | null
                pack_presentado_id: number | null
                pack_presentado_nombre: string | null
                pack_presentado_precio: any
                temas_respondidos: string[] | null
                escalado_pendiente_motivo: string | null
                escalado_pendiente_resumen: string | null
                escalado_pendiente_en: Date | null
                negativa_moto: string | null
                negativa_kit: string | null
                negativa_detalle: string | null
                negativa_en: Date | null
            }[]
        >`
            SELECT grupo_pineado_id, grupo_pineado_nombre, variante_pack_id,
                   variante_etiqueta, variante_precio, moto_confirmada,
                   pack_presentado_id, pack_presentado_nombre, pack_presentado_precio,
                   COALESCE(temas_respondidos, '{}') AS temas_respondidos,
                   escalado_pendiente_motivo, escalado_pendiente_resumen, escalado_pendiente_en,
                   negativa_moto, negativa_kit, negativa_detalle, negativa_en
            FROM chat_conversacion_estado
            WHERE clave = ${clave}
            LIMIT 1
        `
        const f = filas?.[0]
        if (!f) return { ...VACIO }

        return {
            grupoPineado: f.grupo_pineado_id
                ? { id: f.grupo_pineado_id, nombre: f.grupo_pineado_nombre || "" }
                : null,
            varianteResuelta: f.variante_pack_id
                ? {
                      packId: f.variante_pack_id,
                      etiqueta: f.variante_etiqueta || "",
                      precio: Number(f.variante_precio) || 0
                  }
                : null,
            motoConfirmada: f.moto_confirmada || null,
            packPresentado: f.pack_presentado_id
                ? {
                      id: f.pack_presentado_id,
                      nombre: f.pack_presentado_nombre || "",
                      precio: Number(f.pack_presentado_precio) || 0
                  }
                : null,
            temasRespondidos: f.temas_respondidos || [],
            escaladoPendiente: escaladoVigente(f.escalado_pendiente_en)
                ? {
                      motivo: f.escalado_pendiente_motivo || "otro",
                      resumen: f.escalado_pendiente_resumen || "",
                      en: (f.escalado_pendiente_en || new Date()).toISOString()
                  }
                : null,
            negativaEntregada:
                f.negativa_moto && vigente(f.negativa_en, NEGATIVA_VIGENCIA_MS)
                    ? {
                          moto: f.negativa_moto,
                          kit: f.negativa_kit || "",
                          detalle: f.negativa_detalle || "",
                          en: (f.negativa_en || new Date()).toISOString()
                      }
                    : null
        }
    } catch (err) {
        console.warn("[estado] no se pudo leer chat_conversacion_estado:", (err as any)?.message)
        return { ...VACIO }
    }
}

/**
 * Aplica un patch (merge) al estado. Solo pisa los campos presentes en `patch`.
 * No-op si no hay `clave` o si la tabla no existe.
 */
export async function guardarEstadoConversacion(
    clave: string | undefined,
    patch: EstadoConversacion
): Promise<void> {
    if (!clave) return
    if (
        patch.grupoPineado === undefined &&
        patch.varianteResuelta === undefined &&
        patch.motoConfirmada === undefined &&
        patch.packPresentado === undefined &&
        patch.temasRespondidos === undefined &&
        patch.escaladoPendiente === undefined &&
        patch.negativaEntregada === undefined
    ) {
        return
    }

    try {
        const actual = await cargarEstadoConversacion(clave)
        const merged: EstadoConversacion = {
            grupoPineado: patch.grupoPineado !== undefined ? patch.grupoPineado : actual.grupoPineado,
            varianteResuelta:
                patch.varianteResuelta !== undefined ? patch.varianteResuelta : actual.varianteResuelta,
            motoConfirmada:
                patch.motoConfirmada !== undefined ? patch.motoConfirmada : actual.motoConfirmada,
            packPresentado:
                patch.packPresentado !== undefined ? patch.packPresentado : actual.packPresentado,
            // Los temas se ACUMULAN (nunca se pisan): lo que ya se contestó no
            // se "des-contesta" en un turno posterior.
            temasRespondidos: unirTemas(actual.temasRespondidos, patch.temasRespondidos || []),
            escaladoPendiente:
                patch.escaladoPendiente !== undefined ? patch.escaladoPendiente : actual.escaladoPendiente,
            negativaEntregada:
                patch.negativaEntregada !== undefined ? patch.negativaEntregada : actual.negativaEntregada
        }

        await prisma.$executeRawUnsafe(
            `INSERT INTO chat_conversacion_estado
                (clave, grupo_pineado_id, grupo_pineado_nombre, variante_pack_id, variante_etiqueta, variante_precio, moto_confirmada, pack_presentado_id, pack_presentado_nombre, pack_presentado_precio, temas_respondidos, escalado_pendiente_motivo, escalado_pendiente_resumen, escalado_pendiente_en, negativa_moto, negativa_kit, negativa_detalle, negativa_en, actualizado_en)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
             ON CONFLICT (clave) DO UPDATE SET
                grupo_pineado_id = EXCLUDED.grupo_pineado_id,
                grupo_pineado_nombre = EXCLUDED.grupo_pineado_nombre,
                variante_pack_id = EXCLUDED.variante_pack_id,
                variante_etiqueta = EXCLUDED.variante_etiqueta,
                variante_precio = EXCLUDED.variante_precio,
                moto_confirmada = EXCLUDED.moto_confirmada,
                pack_presentado_id = EXCLUDED.pack_presentado_id,
                pack_presentado_nombre = EXCLUDED.pack_presentado_nombre,
                pack_presentado_precio = EXCLUDED.pack_presentado_precio,
                temas_respondidos = EXCLUDED.temas_respondidos,
                escalado_pendiente_motivo = EXCLUDED.escalado_pendiente_motivo,
                escalado_pendiente_resumen = EXCLUDED.escalado_pendiente_resumen,
                escalado_pendiente_en = EXCLUDED.escalado_pendiente_en,
                negativa_moto = EXCLUDED.negativa_moto,
                negativa_kit = EXCLUDED.negativa_kit,
                negativa_detalle = EXCLUDED.negativa_detalle,
                negativa_en = EXCLUDED.negativa_en,
                actualizado_en = NOW()`,
            clave,
            merged.grupoPineado?.id ?? null,
            merged.grupoPineado?.nombre ?? null,
            merged.varianteResuelta?.packId ?? null,
            merged.varianteResuelta?.etiqueta ?? null,
            merged.varianteResuelta?.precio ?? null,
            merged.motoConfirmada ?? null,
            merged.packPresentado?.id ?? null,
            merged.packPresentado?.nombre ?? null,
            merged.packPresentado?.precio ?? null,
            merged.temasRespondidos ?? [],
            merged.escaladoPendiente?.motivo ?? null,
            merged.escaladoPendiente?.resumen ?? null,
            merged.escaladoPendiente?.en ? new Date(merged.escaladoPendiente.en) : null,
            merged.negativaEntregada?.moto ?? null,
            merged.negativaEntregada?.kit ?? null,
            merged.negativaEntregada?.detalle ?? null,
            merged.negativaEntregada?.en ? new Date(merged.negativaEntregada.en) : null
        )
    } catch (err) {
        console.warn("[estado] no se pudo guardar chat_conversacion_estado:", (err as any)?.message)
    }
}

/**
 * ¿El mensaje del cliente es solo una insistencia, sin contenido nuevo? ("??",
 * "hola?", "ahi?", "y?"). Se usa para no gastar un turno de modelo cuando hay
 * un escalado esperando respuesta del equipo: la insistencia se contesta sola
 * cuando el compañero responde.
 */
export function esInsistenciaSinContenido(mensaje: string): boolean {
    const texto = normalizarTexto(mensaje || "")
    if (!texto) return true
    if (texto.length > 24) return false
    const insistencias = new Set([
        "",
        "y",
        "y bien",
        "ahi",
        "ahi estas",
        "estas",
        "estas ahi",
        "hola",
        "hola hola",
        "holaa",
        "buenas",
        "alo",
        "hey",
        "che",
        "sigues ahi",
        "seguis ahi",
        "me contestas",
        "no me contestas",
        "hay alguien",
        "alguien ahi",
        "respondeme",
        "contesta",
        "contestame",
        "esperando",
        "sigo esperando"
    ])
    return insistencias.has(texto)
}

/**
 * Cierra el escalado pendiente si un humano del equipo ya contestó en el chat
 * después de que se escaló: a partir de ahí la charla es del compañero y la
 * memoria no tiene que seguir arrastrando el pendiente.
 */
export async function cerrarEscaladoPendienteSiRespondioHumano(
    clave: string | undefined,
    ultimaRespuestaHumanaMs: number | null
): Promise<void> {
    if (!clave || !ultimaRespuestaHumanaMs) return
    const estado = await cargarEstadoConversacion(clave)
    if (!estado.escaladoPendiente) return
    if (Date.parse(estado.escaladoPendiente.en) > ultimaRespuestaHumanaMs) return
    await guardarEstadoConversacion(clave, { escaladoPendiente: null })
}

/** Borra el estado de una conversación (reinicio de chat). */
export async function limpiarEstadoConversacion(clave?: string): Promise<void> {
    if (!clave) return
    try {
        await prisma.$executeRawUnsafe(`DELETE FROM chat_conversacion_estado WHERE clave = $1`, clave)
    } catch {
        /* no-op */
    }
}

/** Bloque que se inyecta al contexto del modelo. Vacío si no hay nada firme. */
export function formatearMemoriaEstado(estado: EstadoConversacion): string {
    const lineas: string[] = []

    if (estado.grupoPineado?.nombre) {
        lineas.push(`- Combo ya elegido por el cliente: "${estado.grupoPineado.nombre}". Ya recibió la ficha y la foto. No vuelvas a listar opciones, no repitas la ficha completa ni reenvíes la foto, no preguntes cuál combo busca.`)
    }
    if (estado.packPresentado?.nombre) {
        const precio = estado.packPresentado.precio ? ` (${formatearPrecioAR(estado.packPresentado.precio)})` : ""
        lineas.push(
            `- Kit ya presentado al cliente: "${estado.packPresentado.nombre}"${precio}. Ya recibió la ficha completa, el precio y la foto. Si da su moto o hace una consulta puntual, confirmá corto — NO repitas la ficha, la lista de "qué incluye", el precio ya dado ni reenvíes la foto. Contestá lo que preguntó antes de cerrar.`
        )
    }
    if (estado.motoConfirmada) {
        lineas.push(`- Moto ya confirmada compatible: "${estado.motoConfirmada}". No la vuelvas a preguntar ni consultes compatibilidad de nuevo.`)
    }
    if (estado.varianteResuelta?.etiqueta) {
        const precio = estado.varianteResuelta.precio
            ? ` (${formatearPrecioAR(estado.varianteResuelta.precio)})`
            : ""
        lineas.push(
            `- Variante YA resuelta: "${estado.varianteResuelta.etiqueta}"${precio}. El producto y el precio final están 100% determinados. No vuelvas a preguntar la moto ni la variante, ni re-consultes lo ya resuelto. Contestá lo que el cliente haya preguntado y cerrá.`
        )
    }
    if (estado.temasRespondidos && estado.temasRespondidos.length > 0) {
        lineas.push(
            `- Temas que YA le contestaste en esta charla: ${estado.temasRespondidos.join(", ")}. Si el cliente vuelve a tocar uno de esos temas sin preguntar nada nuevo (te da un dato, aclara, corrige), NO re-expliques ese tema: ni el mismo texto, ni reformulado con otras palabras, ni "resumido". Respondé en UN renglón, natural, diciéndole qué significa ese dato para él (que llega igual, que no cambia nada, que queda anotado). Solo si hace una pregunta nueva sobre el tema, contestá esa pregunta y nada más.`
        )
    }

    if (estado.negativaEntregada?.moto) {
        lineas.push(
            `- A este cliente YA le dijiste que el kit no le va a la "${estado.negativaEntregada.moto}", con su motivo. No se lo repitas ni se lo reformules por ningun motivo. Si vuelve sobre ese tema (insiste, aclara algo de su moto, dice que la mando a modificar), ejecuta escalar_a_humano(motivo: 'compatibilidad_dudosa') y guarda silencio sobre ese punto: lo sigue el equipo.`
        )
    }

    if (estado.escaladoPendiente?.resumen) {
        lineas.push(
            `- Consulta YA derivada al equipo y todavia SIN respuesta humana: "${estado.escaladoPendiente.resumen}". Un compañero la va a contestar. No la contestes vos, no la re-preguntes y no prometas nada sobre eso (ni "ya te averiguo", ni "te aviso"). Si el cliente vuelve sobre esa consulta o insiste (\"??\", \"hola?\", \"y?\"), ejecutá escalar_a_humano y guardá silencio total. Solo respondé si pregunta algo NUEVO y distinto que sí podés resolver con las herramientas.`
        )
    }

    if (lineas.length === 0) return ""
    return "### MEMORIA DE ESTADO DE ESTA CONVERSACION (no la contradigas ni repreguntes lo ya resuelto):\n" + lineas.join("\n")
}
