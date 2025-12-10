"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { Product } from "@prisma/client"

export async function getProducts() {
    return await prisma.product.findMany({
        orderBy: { createdAt: "desc" },
    })
}

// 👇 NUEVA FUNCIÓN: Solo trae los destacados para la Home
export async function getFeaturedProducts() {
    return await prisma.product.findMany({
        where: { isFeatured: true },
        orderBy: { createdAt: "desc" },
    })
}

export async function getProduct(id: string) {
    return await prisma.product.findUnique({
        where: { id },
    })
}

// Función auxiliar para verificar el límite de 8
async function checkFeaturedLimit() {
    const count = await prisma.product.count({
        where: { isFeatured: true }
    })
    if (count >= 8) {
        throw new Error("¡Ya tienes 8 productos destacados! Quita uno antes de agregar otro.")
    }
}

export async function createProduct(data: Omit<Product, "id" | "createdAt" | "updatedAt">) {
    // Si intentan crear uno ya destacado, verificamos el límite
    if (data.isFeatured) {
        await checkFeaturedLimit()
    }

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
    // Si se está activando el destacado (true), verificamos el límite
    // Pero primero revisamos si el producto YA era destacado para no contar doble
    if (data.isFeatured) {
        const currentProduct = await prisma.product.findUnique({ where: { id } })
        if (currentProduct && !currentProduct.isFeatured) {
            await checkFeaturedLimit()
        }
    }

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
