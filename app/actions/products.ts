"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { Product } from "@prisma/client"

// 1. Obtener todos los productos (ordenados por fecha)
export async function getProducts() {
    return await prisma.product.findMany({
        orderBy: { createdAt: "desc" },
    })
}

// 2. Obtener solo los DESTACADOS (Grandes) - Límite 8
export async function getFeaturedProducts() {
    return await prisma.product.findMany({
        where: { isFeatured: true },
        orderBy: { createdAt: "desc" },
    })
}

// 3. 👇 NUEVO: Obtener VIDRIERA / ÚLTIMOS INGRESOS (Chicos) - Límite 10
export async function getHomeShowcaseProducts() {
    return await prisma.product.findMany({
        where: { showOnHome: true },
        take: 10, // Traemos máximo 10
        orderBy: { updatedAt: "desc" }, // Ordenamos por "recién actualizado/creado"
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

// --- VALIDACIONES ---

async function checkFeaturedLimit() {
    const count = await prisma.product.count({
        where: { isFeatured: true }
    })
    if (count >= 8) {
        throw new Error("¡Límite alcanzado! Ya tienes 8 destacados. Quita uno antes de agregar otro.")
    }
}

// 👇 NUEVA VALIDACIÓN: Límite para la vidriera
async function checkShowcaseLimit() {
    const count = await prisma.product.count({
        where: { showOnHome: true }
    })
    if (count >= 10) {
        throw new Error("¡Límite de Vidriera alcanzado! Ya tienes 10 productos en 'Últimos Ingresos'. Desmarca alguno antiguo.")
    }
}

// --- CREAR / EDITAR / BORRAR ---

export async function createProduct(data: Omit<Product, "id" | "createdAt" | "updatedAt" | "views">) {
    // Validamos límites antes de guardar
    if (data.isFeatured) {
        await checkFeaturedLimit()
    }
    if (data.showOnHome) {
        await checkShowcaseLimit()
    }

    // Transformamos título a mayúsculas
    const dataToSave = {
        ...data,
        title: data.title.toUpperCase(),
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
    // Validamos límites si se está activando alguno de los switches
    if (data.isFeatured) {
        const currentProduct = await prisma.product.findUnique({ where: { id } })
        // Solo verificamos si ANTES no era destacado y AHORA sí lo es
        if (currentProduct && !currentProduct.isFeatured) {
            await checkFeaturedLimit()
        }
    }

    if (data.showOnHome) {
        const currentProduct = await prisma.product.findUnique({ where: { id } })
        // Solo verificamos si ANTES no estaba en vidriera y AHORA sí
        if (currentProduct && !currentProduct.showOnHome) {
            await checkShowcaseLimit()
        }
    }

    // Transformamos a mayúsculas si viene el título
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
