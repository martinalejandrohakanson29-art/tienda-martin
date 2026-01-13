// app/actions/imports.ts
"use server"
import { prisma } from "@/lib/prisma"

export async function getSupplierProducts() {
    try {
        const products = await prisma.supplierProduct.findMany({
            include: {
                ventas: true, 
                stock: true,
                // Traemos los ítems de órdenes de compra que están pendientes
                purchaseItems: {
                    where: {
                        purchaseOrder: {
                            status: "PENDIENTE"
                        }
                    },
                    include: {
                        purchaseOrder: true
                    }
                }
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

            // Mapeamos los ingresos futuros: { "1408": 300, "1414": 50 }
            const futureArrivals: Record<string, { quantity: number, supplier: string }> = {};
            
            p.purchaseItems.forEach(item => {
                const po = item.purchaseOrder;
                // Usamos externalId (el nro visual) o el id como respaldo
                const orderKey = po.externalId || po.id;
                
                futureArrivals[orderKey] = {
                    quantity: item.quantity,
                    supplier: po.supplier
                };
            });

            return {
                id: p.id,
                sku: p.sku,
                name: p.name,
                salesLast30: ventas,
                stockExternal: stock,
                salesVelocity: velocity,
                monthsCoverage: coverage,
                futureArrivals // <-- Enviamos este nuevo objeto a la tabla
            }
        })
    } catch (error) {
        console.error("Error obteniendo productos:", error)
        return []
    }
}
