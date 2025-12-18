"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { Product } from "@prisma/client"

// 1. Obtener todos (ordenados por TU orden personalizado, y luego por fecha)
export async function getProducts() {
    return await prisma.product.findMany({
        orderBy: [
            { order: "asc" },      // Primero por orden (1, 2, 3...)
            { createdAt: "desc" }  // Luego por fecha
        ],
    })
}

// 2. Destacados (Grandes)
export async function getFeaturedProducts() {
    return await prisma.product.findMany({
        where: { isFeatured: true },
        orderBy: [
            { order: "asc" },      // 👇 Respetamos tu orden manual
            { createdAt: "desc" }
        ],
    })
}

// 3. Vidriera (Chicos)
export async function getHomeShowcaseProducts() {
    return await prisma.product.findMany({
        where: { showOnHome: true },
        take: 10,
        orderBy: [
            { order: "asc" },      // 👇 Respetamos tu orden manual
            { updatedAt: "desc" }
        ],
    })
}

export async function getProduct(id: string) {
    return await prisma.product.findUnique({ where: { id } })
}

export async function incrementProductView(id: string) {
    await prisma.product.update({
        where: { id },
        data: { views: { increment: 1 } }
    })
}

// --- VALIDACIONES ---

async function checkFeaturedLimit() {
    const count = await prisma.product.count({ where: { isFeatured: true } })
    if (count >= 8) throw new Error("¡Límite alcanzado! Ya tienes 8 destacados.")
}

async function checkShowcaseLimit() {
    const count = await prisma.product.count({ where: { showOnHome: true } })
    if (count >= 10) throw new Error("¡Límite de Vidriera alcanzado! Ya tienes 10 productos.")
}

// --- CREAR / EDITAR / BORRAR ---

export async function createProduct(data: Omit<Product, "id" | "createdAt" | "updatedAt" | "views">) {
    if (data.isFeatured) await checkFeaturedLimit()
    if (data.showOnHome) await checkShowcaseLimit()

    const dataToSave = {
        ...data,
        title: data.title.toUpperCase(),
        // Si no viene orden, lo dejamos en 0 o lo manejamos como venga
    }

    const product = await prisma.product.create({ data: dataToSave })
    
    revalidatePaths()
    return product
}

export async function updateProduct(id: string, data: Partial<Omit<Product, "id" | "createdAt" | "updatedAt">>) {
    // Validaciones de límites...
    if (data.isFeatured) {
        const current = await prisma.product.findUnique({ where: { id } })
        if (current && !current.isFeatured) await checkFeaturedLimit()
    }
    if (data.showOnHome) {
        const current = await prisma.product.findUnique({ where: { id } })
        if (current && !current.showOnHome) await checkShowcaseLimit()
    }

    const dataToUpdate = { ...data }
    if (dataToUpdate.title) dataToUpdate.title = dataToUpdate.title.toUpperCase()

    const product = await prisma.product.update({
        where: { id },
        data: dataToUpdate,
    })
    
    revalidatePaths()
    return product
}

export async function deleteProduct(id: string) {
    await prisma.product.delete({ where: { id } })
    revalidatePaths()
}

export async function getUniqueCategories() {
  try {
    const products = await prisma.product.findMany({
      where: { stock: { gt: 0 } },
      select: { category: true }
    })
    return Array.from(new Set(products.map(p => p.category))).sort()
  } catch (error) {
    return []
  }
}

function revalidatePaths() {
    revalidatePath("/admin/products")
    revalidatePath("/shop")
    revalidatePath("/")
}
