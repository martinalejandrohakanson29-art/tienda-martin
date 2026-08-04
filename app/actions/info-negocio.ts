"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guard"

export type InfoNegocio = {
    id: number
    tema: string
    respuesta: string
    fuente: string | null
    creado_en: Date
}

export async function getInfoNegocio(): Promise<InfoNegocio[]> {
    await requireAdmin()
    return prisma.$queryRaw<InfoNegocio[]>`
        SELECT id, tema, respuesta, fuente, creado_en FROM info_negocio ORDER BY creado_en DESC
    `
}

export type InfoNegocioInput = {
    id?: number
    tema: string
    respuesta: string
}

export async function guardarInfoNegocio(data: InfoNegocioInput) {
    await requireAdmin()
    const tema = data.tema.trim().toLowerCase()
    const respuesta = data.respuesta.trim()
    if (!tema || !respuesta) throw new Error("Tema y respuesta son obligatorios")

    if (data.id) {
        await prisma.$executeRaw`
            UPDATE info_negocio
            SET tema = ${tema}, respuesta = ${respuesta}, fuente = 'admin'
            WHERE id = ${data.id}
        `
    } else {
        // El workflow toma la fila mas reciente por tema (ORDER BY creado_en DESC
        // LIMIT 1), asi que si ya hay una para este tema la actualizamos en vez de
        // acumular filas viejas que quedarian "tapadas" para siempre.
        const existente = await prisma.$queryRaw<{ id: number }[]>`
            SELECT id FROM info_negocio WHERE LOWER(tema) = ${tema} LIMIT 1
        `
        if (existente.length > 0) {
            await prisma.$executeRaw`
                UPDATE info_negocio
                SET respuesta = ${respuesta}, fuente = 'admin', creado_en = now()
                WHERE id = ${existente[0].id}
            `
        } else {
            await prisma.$executeRaw`
                INSERT INTO info_negocio (tema, respuesta, fuente) VALUES (${tema}, ${respuesta}, 'admin')
            `
        }
    }

    revalidatePath("/admin/chatwoot/conocimiento")
}

export async function eliminarInfoNegocio(id: number) {
    await requireAdmin()
    await prisma.$executeRaw`DELETE FROM info_negocio WHERE id = ${id}`
    revalidatePath("/admin/chatwoot/conocimiento")
}
