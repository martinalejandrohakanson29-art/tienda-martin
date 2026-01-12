"use server"
import { prisma } from "@/lib/prisma"

export async function getSupplierProducts() {
    try {
        const products = await prisma.supplierProduct.findMany({
            include: {
                ventas: true, // Traemos las ventas de su tabla
                stock: true   // Traemos el stock de su tabla
            },
            orderBy: { sku: 'asc' }
        })
        
        return products.map(p => {
            const ventas = p.ventas?.salesLast30 || 0;
            const velocity = Number(p.ventas?.salesVelocity || 0);
            const stock = p.stock?.stockExternal || 0;
            
            // Cálculo de cobertura al vuelo
            const coverage = velocity > 0 ? Number((stock / velocity).toFixed(2)) : 0;

            return {
                id: p.id,
                sku: p.sku,
                name: p.name,
                supplier: p.supplier || "-", // Lo mostramos pero ya no es crítico
                salesLast30: ventas,
                stockExternal: stock,
                salesVelocity: velocity,
                monthsCoverage: coverage
            }
        })
    } catch (error) {
        console.error("Error:", error)
        return []
    }
}
