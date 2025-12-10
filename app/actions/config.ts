"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { Config } from "@prisma/client"

export async function getConfig() {
    const config = await prisma.config.findFirst()
    if (!config) {
        return await prisma.config.create({
            data: {},
        })
    }
    return config
}

export async function updateConfig(data: Partial<Omit<Config, "id" | "createdAt" | "updatedAt">>) {
    const config = await getConfig()
    const updated = await prisma.config.update({
        where: { id: config.id },
        data,
    })
    revalidatePath("/")
    revalidatePath("/admin")
    return updated
}
