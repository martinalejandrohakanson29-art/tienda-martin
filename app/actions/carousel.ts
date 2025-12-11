"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function getCarouselItems() {
    return await prisma.carouselItem.findMany({
        orderBy: { order: "asc" },
    })
}

// 👇 Actualizado para recibir URL y TIPO
export async function createCarouselItem(data: { mediaUrl: string; mediaUrlMobile?: string; mediaType: string; order?: number }) {
    const item = await prisma.carouselItem.create({
        data: {
            ...data,
            mediaUrlMobile: data.mediaUrlMobile || "" // Aseguramos que no sea null
        },
    })
    revalidatePath("/")
    revalidatePath("/admin")
    return item
}

export async function deleteCarouselItem(id: string) {
    await prisma.carouselItem.delete({
        where: { id },
    })
    revalidatePath("/")
    revalidatePath("/admin")
}

export async function updateCarouselOrder(items: { id: string; order: number }[]) {
    for (const item of items) {
        await prisma.carouselItem.update({
            where: { id: item.id },
            data: { order: item.order },
        })
    }
    revalidatePath("/")
    revalidatePath("/admin")
}

