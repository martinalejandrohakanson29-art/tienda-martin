"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { CarouselItem } from "@prisma/client"

export async function getCarouselItems() {
    return await prisma.carouselItem.findMany({
        orderBy: { order: "asc" },
    })
}

export async function createCarouselItem(data: { imageUrl: string; order?: number }) {
    const item = await prisma.carouselItem.create({
        data,
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
