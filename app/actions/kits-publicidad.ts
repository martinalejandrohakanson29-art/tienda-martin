"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guard"

export type Kit = {
    id: number
    nombre: string
    keywords: string | null
    detalle: string | null
    precio: string | null
    envio: string | null
    mensaje_bienvenida: string
    foto_url: string | null
    plantillas_bienvenida: string | null
    activo: boolean
    creado_en: Date
}

export type KitInput = {
    id?: number
    nombre: string
    keywords: string
    detalle: string
    precio: string
    envio: string
    mensajeBienvenida: string
    fotoUrl: string
    plantillasBienvenida: string
    activo: boolean
}

function parseKeywords(keywords: string | null | undefined): string[] {
    if (!keywords) return []
    return [...new Set(keywords.split(",").map((k) => k.trim()).filter(Boolean))]
}

// precios_stock es la tabla que ya usa el workflow de n8n para responder preguntas
// de precio/stock (ver n8n-workflows/workflow_mateo.json). Cada alias del kit se
// inserta como una fila propia para que el agente encuentre el dato sin importar
// con qué palabra el cliente lo nombre en una pregunta de seguimiento.
async function sincronizarPreciosStock(
    kitId: number,
    nombre: string,
    keywords: string,
    precio: string,
    envio: string,
    detalle: string
) {
    const fuente = `admin-kit-${kitId}`
    await prisma.$executeRaw`DELETE FROM precios_stock WHERE fuente = ${fuente}`

    const alias = [...new Set([nombre.trim(), ...parseKeywords(keywords)])].filter(Boolean)
    for (const producto of alias) {
        await prisma.$executeRaw`
            INSERT INTO precios_stock (producto, precio, stock, detalle, fuente)
            VALUES (${producto}, ${precio}, ${envio}, ${detalle}, ${fuente})
        `
    }
}

export async function getKits(): Promise<Kit[]> {
    await requireAdmin()
    try {
        return await prisma.$queryRaw<Kit[]>`
            SELECT id, nombre, keywords, detalle, precio, envio, mensaje_bienvenida, foto_url, plantillas_bienvenida, activo, creado_en
            FROM kits_publicidad
            ORDER BY creado_en DESC
        `
    } catch (error) {
        console.error("Error al leer kits_publicidad (¿ya corriste el CREATE TABLE?):", error)
        throw new Error(
            "No se pudo leer la tabla kits_publicidad. Si es la primera vez, corré el SQL de la nota " +
            "'Nota - Kits Publicidad' en n8n-workflows/workflow_mateo.json una vez en tu Postgres."
        )
    }
}

export async function guardarKit(data: KitInput) {
    await requireAdmin()

    const nombre = data.nombre.trim()
    const mensajeBienvenida = data.mensajeBienvenida.trim()
    const fotoUrl = data.fotoUrl.trim() || null
    if (!nombre || !mensajeBienvenida) {
        throw new Error("Nombre y mensaje predefinido son obligatorios")
    }

    let kitId = data.id

    if (kitId) {
        await prisma.$executeRaw`
            UPDATE kits_publicidad
            SET nombre = ${nombre},
                keywords = ${data.keywords},
                detalle = ${data.detalle},
                precio = ${data.precio},
                envio = ${data.envio},
                mensaje_bienvenida = ${mensajeBienvenida},
                foto_url = ${fotoUrl},
                plantillas_bienvenida = ${data.plantillasBienvenida},
                activo = ${data.activo}
            WHERE id = ${kitId}
        `
    } else {
        const inserted = await prisma.$queryRaw<{ id: number }[]>`
            INSERT INTO kits_publicidad (nombre, keywords, detalle, precio, envio, mensaje_bienvenida, foto_url, plantillas_bienvenida, activo)
            VALUES (${nombre}, ${data.keywords}, ${data.detalle}, ${data.precio}, ${data.envio}, ${mensajeBienvenida}, ${fotoUrl}, ${data.plantillasBienvenida}, ${data.activo})
            RETURNING id
        `
        kitId = inserted[0].id
    }

    await sincronizarPreciosStock(kitId!, nombre, data.keywords, data.precio, data.envio, data.detalle)

    revalidatePath("/admin/chatwoot/conocimiento")
    return { success: true, id: kitId }
}

export async function eliminarKit(id: number) {
    await requireAdmin()
    await prisma.$executeRaw`DELETE FROM kits_publicidad WHERE id = ${id}`
    await prisma.$executeRaw`DELETE FROM precios_stock WHERE fuente = ${`admin-kit-${id}`}`
    revalidatePath("/admin/chatwoot/conocimiento")
}

export async function alternarActivo(id: number, activo: boolean) {
    await requireAdmin()
    await prisma.$executeRaw`UPDATE kits_publicidad SET activo = ${activo} WHERE id = ${id}`
    revalidatePath("/admin/chatwoot/conocimiento")
}
