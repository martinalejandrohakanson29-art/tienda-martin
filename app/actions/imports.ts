// app/actions/imports.ts
"use server"
import { prisma } from "@/lib/prisma"

export async function getSupplierProducts() {
    try {
        // 1. Traemos los productos
        const products = await prisma.supplierProduct.findMany({
            include: {
                ventas: true, 
                stock: true,
                purchaseItems: {
                    where: { purchaseOrder: { status: "PENDIENTE" } },
                    include: { purchaseOrder: true }
                }
            },
            orderBy: { sku: 'asc' }
        })

        // 2. Buscamos la fecha de la última actualización de ventas/stock
        const lastVentasUpdate = await prisma.importVentas.findFirst({
            orderBy: { updatedAt: 'desc' },
            select: { updatedAt: true }
        })

        const mappedData = products.map(p => {
            const ventas = p.ventas?.salesLast30 || 0;
            const velocity = Number(p.ventas?.salesVelocity || 0);
            const stock = p.stock?.stockExternal || 0;
            const coverage = velocity > 0 
                ? Number((stock / velocity).toFixed(1)) 
                : (stock > 0 ? 999 : 0);

            const futureArrivals: Record<string, { quantity: number, supplier: string }> = {};
            p.purchaseItems.forEach(item => {
                const po = item.purchaseOrder;
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
                futureArrivals 
            }
        })

        return {
            data: mappedData,
            lastUpdate: lastVentasUpdate?.updatedAt || null
        }
    } catch (error) {
        console.error("Error obteniendo productos:", error)
        return { data: [], lastUpdate: null }
    }
}
