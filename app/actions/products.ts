"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { Product } from "@prisma/client"

export async function getProducts() {
    return await prisma.product.findMany({
        orderBy: { createdAt: "desc" },
    })
}

export async function getProduct(id: string) {
    return await prisma.product.findUnique({
        where: { id },
    })
}

export async function createProduct(data: Omit<Product, "id" | "createdAt" | "updatedAt">) {
    // Ensure price is a Decimal or compatible
    const product = await prisma.product.create({
        data: {
            ...data,
            price: data.price,
        },
    })
    revalidatePath("/admin/products")
    revalidatePath("/shop")
    revalidatePath("/")
    return product
}

export async function updateProduct(id: string, data: Partial<Omit<Product, "id" | "createdAt" | "updatedAt">>) {
    const product = await prisma.product.update({
        where: { id },
        data,
    })
    revalidatePath("/admin/products")
    revalidatePath("/shop")
    revalidatePath("/")
    return product
}

export async function deleteProduct(id: string) {
    await prisma.product.delete({
        where: { id },
    })
    revalidatePath("/admin/products")
    revalidatePath("/shop")
    revalidatePath("/")
}
