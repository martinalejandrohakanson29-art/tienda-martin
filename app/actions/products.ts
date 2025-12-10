"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { Product } from "@prisma/client"

// Función normal para el Admin (trae todos)
export async function getProducts() {
    return await prisma.product.findMany({
        orderBy: { createdAt: "desc" },
    })
}

// 👇 NUEVA FUNCIÓN: Solo trae los "Destacados" (para la Home)
export async function getFeaturedProducts() {
    return await prisma.product.findMany({
        where: { isFeatured: true }, // El filtro clave
        orderBy: { createdAt: "desc" },
    })
}

export async function getProduct(id: string) {
    return await prisma.product.findUnique({
        where: { id },
    })
}

// Función auxiliar para limitar a 8
async function checkFeaturedLimit() {
    const count = await prisma.product.count({
        where: { isFeatured: true }
    })
    if (count >= 8) {
        throw new Error("¡Límite alcanzado! Ya tienes 8 destacados. Quita uno antes de agregar otro.")
    }
}

export async function createProduct(data: Omit<Product, "id" | "createdAt" | "updatedAt">) {
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
    // Si se activa el destacado, verificamos límite
    if (data.isFeatured) {
        const currentProduct = await prisma.product.findUnique({ where: { id } })
        // Solo verificamos si antes NO era destacado
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
