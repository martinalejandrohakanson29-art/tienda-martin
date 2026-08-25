"use server"

import { prisma } from "@/lib/prisma"
import { requireVaultAccess } from "@/lib/auth-guard"
import { encryptSecret, decryptSecret } from "@/lib/vault-crypto"
import { revalidatePath } from "next/cache"

const PATH = "/admin/contrasenas"

// Nunca incluye passwordCifrada: la lista general no debe exponer el secreto,
// solo se descifra bajo demanda con revelarPassword().
const LISTADO_SELECT = {
    id: true,
    categoria: true,
    titulo: true,
    usuario: true,
    url: true,
    notas: true,
    createdAt: true,
    updatedAt: true,
    creadoPor: { select: { username: true } },
    editadoPor: { select: { username: true } },
}

export async function listarCredenciales() {
    await requireVaultAccess()
    return prisma.credencial.findMany({
        select: LISTADO_SELECT,
        orderBy: [{ categoria: "asc" }, { titulo: "asc" }],
    })
}

export async function crearCredencial(data: {
    categoria: string
    titulo: string
    usuario?: string
    password: string
    url?: string
    notas?: string
}) {
    const session = await requireVaultAccess()

    if (!data.categoria?.trim() || !data.titulo?.trim() || !data.password) {
        return { error: "Completá categoría, título y contraseña" }
    }

    await prisma.credencial.create({
        data: {
            categoria: data.categoria.trim(),
            titulo: data.titulo.trim(),
            usuario: data.usuario?.trim() || null,
            passwordCifrada: encryptSecret(data.password),
            url: data.url?.trim() || null,
            notas: data.notas?.trim() || null,
            creadoPorId: (session.user as any).id,
        },
    })

    revalidatePath(PATH)
    return { success: true }
}

export async function actualizarCredencial(
    id: string,
    data: {
        categoria: string
        titulo: string
        usuario?: string
        password?: string
        url?: string
        notas?: string
    }
) {
    const session = await requireVaultAccess()

    if (!data.categoria?.trim() || !data.titulo?.trim()) {
        return { error: "Completá categoría y título" }
    }

    await prisma.credencial.update({
        where: { id },
        data: {
            categoria: data.categoria.trim(),
            titulo: data.titulo.trim(),
            usuario: data.usuario?.trim() || null,
            ...(data.password ? { passwordCifrada: encryptSecret(data.password) } : {}),
            url: data.url?.trim() || null,
            notas: data.notas?.trim() || null,
            editadoPorId: (session.user as any).id,
        },
    })

    revalidatePath(PATH)
    return { success: true }
}

export async function eliminarCredencial(id: string) {
    await requireVaultAccess()
    try {
        await prisma.credencial.delete({ where: { id } })
    } catch {
        return { error: "No se pudo eliminar la credencial" }
    }
    revalidatePath(PATH)
    return { success: true }
}

export async function revelarPassword(id: string) {
    await requireVaultAccess()
    const credencial = await prisma.credencial.findUnique({
        where: { id },
        select: { passwordCifrada: true },
    })
    if (!credencial) return { error: "No encontrada" }
    return { password: decryptSecret(credencial.passwordCifrada) }
}
