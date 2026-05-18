"use server"

import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth-guard"
import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"

export async function getUsers() {
    await requireSuperAdmin()
    return await prisma.user.findMany({
        select: {
            id: true,
            username: true,
            name: true,
            role: true,
            isActive: true,
            createdAt: true,
        },
        orderBy: { createdAt: "asc" },
    })
}

export async function createUser(data: {
    username: string
    password: string
    name?: string
    role: string
}) {
    await requireSuperAdmin()

    if (!data.username || !data.password) {
        return { error: "Usuario y contraseña son obligatorios" }
    }
    if (data.password.length < 6) {
        return { error: "La contraseña debe tener al menos 6 caracteres" }
    }

    const existing = await prisma.user.findUnique({ where: { username: data.username } })
    if (existing) {
        return { error: "El nombre de usuario ya existe" }
    }

    const hashed = await bcrypt.hash(data.password, 10)
    await prisma.user.create({
        data: {
            username: data.username,
            password: hashed,
            name: data.name || null,
            role: data.role as any,
        },
    })

    revalidatePath("/admin/usuarios")
    return { success: true }
}

export async function updateUser(
    id: string,
    data: { username?: string; name?: string; role?: string; isActive?: boolean }
) {
    await requireSuperAdmin()

    // Proteger el último SUPER_ADMIN activo
    if (data.isActive === false || (data.role && data.role !== "SUPER_ADMIN")) {
        const user = await prisma.user.findUnique({ where: { id } })
        if (user?.role === "SUPER_ADMIN") {
            const count = await prisma.user.count({ where: { role: "SUPER_ADMIN", isActive: true } })
            if (count <= 1) {
                return { error: "No se puede modificar al único Super Administrador activo" }
            }
        }
    }

    if (data.username) {
        const existing = await prisma.user.findFirst({
            where: { username: data.username, NOT: { id } },
        })
        if (existing) {
            return { error: "El nombre de usuario ya existe" }
        }
    }

    await prisma.user.update({
        where: { id },
        data: {
            ...(data.username && { username: data.username }),
            ...(data.name !== undefined && { name: data.name || null }),
            ...(data.role && { role: data.role as any }),
            ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
    })

    revalidatePath("/admin/usuarios")
    return { success: true }
}

export async function updatePassword(id: string, newPassword: string) {
    await requireSuperAdmin()

    if (!newPassword || newPassword.length < 6) {
        return { error: "La contraseña debe tener al menos 6 caracteres" }
    }

    const hashed = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({ where: { id }, data: { password: hashed } })

    revalidatePath("/admin/usuarios")
    return { success: true }
}

export async function deleteUser(id: string) {
    await requireSuperAdmin()

    const user = await prisma.user.findUnique({ where: { id } })
    if (user?.role === "SUPER_ADMIN") {
        const count = await prisma.user.count({ where: { role: "SUPER_ADMIN" } })
        if (count <= 1) {
            return { error: "No se puede eliminar al único Super Administrador" }
        }
    }

    await prisma.user.delete({ where: { id } })
    revalidatePath("/admin/usuarios")
    return { success: true }
}
