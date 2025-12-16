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

export async function incrementProductView(id: string) {
    await prisma.product.update({
        where: { id },
        data: {
            views: { increment: 1 }
        }
    })
}

async function checkFeaturedLimit() {
    const count = await prisma.product.count({
        where: { isFeatured: true }
    })
    if (count >= 8) {
        throw new Error("¡Límite alcanzado! Ya tienes 8 destacados. Quita uno antes de agregar otro.")
    }
}

export async function createProduct(data: Omit<Product, "id" | "createdAt" | "updatedAt" | "views">) {
    if (data.isFeatured) {
        await checkFeaturedLimit()
    }

    // 👇 TRANSFORMACIÓN A MAYÚSCULAS AQUÍ
    const dataToSave = {
        ...data,
        title: data.title.toUpperCase(), // Forzamos mayúsculas
        price: data.price,
    }

    const product = await prisma.product.create({
        data: dataToSave,
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

    // 👇 TRANSFORMACIÓN A MAYÚSCULAS AQUÍ TAMBIÉN
    const dataToUpdate = { ...data }
    if (dataToUpdate.title) {
        dataToUpdate.title = dataToUpdate.title.toUpperCase()
    }

    const product = await prisma.product.update({
        where: { id },
        data: dataToUpdate,
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

export async function getUniqueCategories() {
  try {
    const products = await prisma.product.findMany({
      where: { stock: { gt: 0 } },
      select: { category: true }
    })
    
    const uniqueCategories = Array.from(new Set(products.map(p => p.category)))
    return uniqueCategories.sort()
  } catch (error) {
    return []
  }
}
