"use server"

import { prisma } from "@/lib/prisma"

// Obtener la tabla maestra de importaciones
export async function getSupplierProducts() {
    try {
        const products = await prisma.supplierProduct.findMany({
            orderBy: {
                sku: 'asc' // Ordenar por código
            }
        })
        
        // Serializamos los Decimales para que no rompan el cliente
        return products.map(p => ({
            ...p,
            priceExternal: p.priceExternal ? Number(p.priceExternal) : 0,
            salesVelocity: p.salesVelocity ? Number(p.salesVelocity) : 0,
            monthsCoverage: p.monthsCoverage ? Number(p.monthsCoverage) : 0
        }))
    } catch (error) {
        console.error("Error obteniendo productos de proveedores:", error)
        return []
    }
}
