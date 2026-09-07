import { prisma } from "@/lib/prisma"
import { formatearPrecioAR } from "./texto"

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
}

const VACIO: EstadoConversacion = {}

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
            }[]
        >`
            SELECT grupo_pineado_id, grupo_pineado_nombre, variante_pack_id,
                   variante_etiqueta, variante_precio, moto_confirmada,
                   pack_presentado_id, pack_presentado_nombre, pack_presentado_precio
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
        patch.packPresentado === undefined
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
                patch.packPresentado !== undefined ? patch.packPresentado : actual.packPresentado
        }

        await prisma.$executeRawUnsafe(
            `INSERT INTO chat_conversacion_estado
                (clave, grupo_pineado_id, grupo_pineado_nombre, variante_pack_id, variante_etiqueta, variante_precio, moto_confirmada, pack_presentado_id, pack_presentado_nombre, pack_presentado_precio, actualizado_en)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
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
            merged.packPresentado?.precio ?? null
        )
    } catch (err) {
        console.warn("[estado] no se pudo guardar chat_conversacion_estado:", (err as any)?.message)
    }
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
            `- Kit ya presentado al cliente: "${estado.packPresentado.nombre}"${precio}. Ya recibió la ficha completa y la foto. Si da su moto o hace una consulta puntual, confirmá corto y andá al cierre — NO repitas la ficha, la lista de "qué incluye" ni reenvíes la foto.`
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
            `- Variante YA resuelta: "${estado.varianteResuelta.etiqueta}"${precio}. El producto y el precio final están 100% determinados: pasá directo al cierre. No preguntes la moto, la variante ni consultes nada más.`
        )
    }

    if (lineas.length === 0) return ""
    return "### MEMORIA DE ESTADO DE ESTA CONVERSACION (no la contradigas ni repreguntes lo ya resuelto):\n" + lineas.join("\n")
}
