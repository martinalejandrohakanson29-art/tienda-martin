"use server"

import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { revalidatePath } from "next/cache"

export async function getNotificationRules() {
    await requireSuperAdmin()
    return await prisma.notificationRule.findMany({
        include: {
            targetUser: { select: { username: true } },
            sourceUser: { select: { username: true } },
        },
        orderBy: { createdAt: "desc" },
    })
}

export async function createNotificationRule(data: {
    name: string
    eventType: string
    sourceUserId?: string
    targetUserId: string
}) {
    await requireSuperAdmin()

    if (!data.name || !data.eventType || !data.targetUserId) {
        return { error: "Completá todos los campos obligatorios" }
    }

    await prisma.notificationRule.create({
        data: {
            name: data.name,
            eventType: data.eventType,
            sourceUserId: data.sourceUserId || null,
            targetUserId: data.targetUserId,
        },
    })

    revalidatePath("/admin/usuarios")
    return { success: true }
}

export async function updateNotificationRule(
    id: string,
    data: {
        name?: string
        eventType?: string
        sourceUserId?: string | null
        targetUserId?: string
        isActive?: boolean
    }
) {
    await requireSuperAdmin()

    await prisma.notificationRule.update({
        where: { id },
        data: {
            ...(data.name && { name: data.name }),
            ...(data.eventType && { eventType: data.eventType }),
            ...(data.sourceUserId !== undefined && { sourceUserId: data.sourceUserId }),
            ...(data.targetUserId && { targetUserId: data.targetUserId }),
            ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
    })

    revalidatePath("/admin/usuarios")
    return { success: true }
}

export async function deleteNotificationRule(id: string) {
    await requireSuperAdmin()
    await prisma.notificationRule.delete({ where: { id } })
    revalidatePath("/admin/usuarios")
    return { success: true }
}
