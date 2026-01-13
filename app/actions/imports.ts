// app/actions/imports.ts
"use server"
import { prisma } from "@/lib/prisma"

export async function getSupplierProducts() {
    try {
        const products = await prisma.supplierProduct.findMany({
            include: {
                ventas: true, 
                stock: true   
            },
            orderBy: { sku: 'asc' }
        })
        
        return products.map(p => {
            const ventas = p.ventas?.salesLast30 || 0;
            const velocity = Number(p.ventas?.salesVelocity || 0);
            const stock = p.stock?.stockExternal || 0;
           const coverage = velocity > 0 
    ? Number((stock / velocity).toFixed(1)) 
    : (stock > 0 ? 999 : 0);

            return {
                id: p.id,
                sku: p.sku,
                name: p.name,
                // El campo 'supplier' ya no vendrá en 'p', así que no lo incluimos
                salesLast30: ventas,
                stockExternal: stock,
                salesVelocity: velocity,
                monthsCoverage: coverage
            }
        })
    } catch (error) {
        console.error("Error obteniendo productos:", error)
        return []
    }
}
