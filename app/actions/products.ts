"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { Product } from "@prisma/client"

export async function getProducts() {
    return await prisma.product.findMany({
        orderBy: { createdAt: "desc" },
    })
}

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

// 👇 NUEVA FUNCIÓN: Suma 1 visita al producto
export async function incrementProductView(id: string) {
    await prisma.product.update({
        where: { id },
        data: {
            views: { increment: 1 }
        }
    })
}

// ... (El resto de funciones createProduct, updateProduct, etc. déjalas igual)
// Solo asegúrate de incluir la función incrementProductView
async function checkFeaturedLimit() {
    const count = await prisma.product.count({
        where: { isFeatured: true }
    })
    if (count >= 8) {
        throw new Error("¡Límite alcanzado! Ya tienes 8 destacados. Quita uno antes de agregar otro.")
    }
}

export async function createProduct(data: Omit<Product, "id" | "createdAt" | "updatedAt" | "views">) { // Agregamos views a Omit
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
