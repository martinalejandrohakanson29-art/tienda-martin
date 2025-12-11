"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function getConfig() {
    const config = await prisma.config.findFirst()
    return config
}

export async function updateConfig(data: any) {
    const existingConfig = await prisma.config.findFirst()

    if (existingConfig) {
        const config = await prisma.config.update({
            where: { id: existingConfig.id },
            data: { ...data },
        })
        
        // 👇 CAMBIO CRUCIAL: Agregamos "layout" como segundo parámetro
        revalidatePath("/", "layout") 
        
        return config
    } else {
        const config = await prisma.config.create({
            data: { ...data }
        })
        
        // 👇 AQUÍ TAMBIÉN
        revalidatePath("/", "layout")
        
        return config
    }
}
