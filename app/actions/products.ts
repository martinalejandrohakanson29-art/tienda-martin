"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { Product } from "@prisma/client"

// Función auxiliar para ordenar: 
// Si order es 0 (o nulo), lo mandamos al final (como si fuera 9999).
// Si tiene número (1, 2, 3...), lo respetamos.
function sortProductsByPriority(products: Product[]) {
    return products.sort((a, b) => {
        // Truco: Si es 0, lo convertimos en un número gigante para que se vaya al fondo
        const orderA = a.order === 0 ? 999999 : a.order
        const orderB = b.order === 0 ? 999999 : b.order
        
        // Comparamos los órdenes
        if (orderA !== orderB) {
            return orderA - orderB
        }
        
        // Si tienen el mismo orden (ej: ambos son 0), desempatamos por fecha (el más nuevo arriba)
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
}

// 1. Obtener todos los productos (Tienda general)
export async function getProducts() {
    // Traemos todos
    const products = await prisma.product.findMany({
        orderBy: { createdAt: "desc" }, // Traemos por fecha base
    })
    
    // Aplicamos nuestro ordenamiento inteligente
    return sortProductsByPriority(products)
}

// 2. Obtener solo los DESTACADOS (Grandes)
export async function getFeaturedProducts() {
    const products = await prisma.product.findMany({
        where: { isFeatured: true },
        // No limitamos aquí con 'take' para poder ordenar todo el conjunto primero
    })

    // Ordenamos con nuestra lógica (1 va primero, 0 al final)
    const sorted = sortProductsByPriority(products)

    // Devolvemos solo los primeros 8
    return sorted.slice(0, 8)
}

// 3. Vidriera / Últimos Ingresos (Chicos)
export async function getHomeShowcaseProducts() {
    const products = await prisma.product.findMany({
        where: { showOnHome: true },
    })

    // Ordenamos con nuestra lógica
    const sorted = sortProductsByPriority(products)

    // Devolvemos solo los primeros 10
    return sorted.slice(0, 10)
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
    if (data.isFeatured) await checkFeaturedLimit()
    if (data.showOnHome) await checkShowcaseLimit()

    const dataToSave = {
        ...data,
        title: data.title.toUpperCase(),
        // Convertimos el string vacío a 0 si hace falta, aunque ya debería venir bien
        order: data.order ? Number(data.order) : 0
    }

    const product = await prisma.product.create({
        data: dataToSave,
    })
    
    revalidatePaths()
    return product
}

export async function updateProduct(id: string, data: Partial<Omit<Product, "id" | "createdAt" | "updatedAt">>) {
    if (data.isFeatured) {
        const currentProduct = await prisma.product.findUnique({ where: { id } })
        if (currentProduct && !currentProduct.isFeatured) {
            await checkFeaturedLimit()
        }
    }

    if (data.showOnHome) {
        const currentProduct = await prisma.product.findUnique({ where: { id } })
        if (currentProduct && !currentProduct.showOnHome) {
            await checkShowcaseLimit()
        }
    }

    const dataToUpdate = { ...data }
    if (dataToUpdate.title) {
        dataToUpdate.title = dataToUpdate.title.toUpperCase()
    }
    // Aseguramos que order sea número si viene en la data
    if (dataToUpdate.order !== undefined) {
        dataToUpdate.order = Number(dataToUpdate.order)
    }

    const product = await prisma.product.update({
        where: { id },
        data: dataToUpdate,
    })
    
    revalidatePaths()
    return product
}

export async function deleteProduct(id: string) {
    await prisma.product.delete({
        where: { id },
    })
    
    revalidatePaths()
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

function revalidatePaths() {
    revalidatePath("/admin/products")
    revalidatePath("/shop")
    revalidatePath("/")
}
