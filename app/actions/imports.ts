// app/actions/imports.ts
"use server"
import { prisma } from "@/lib/prisma"

/**
 * Limpia todos los pedidos de compra pendientes.
 * Se usa antes de sincronizar con n8n para evitar pedidos duplicados o antiguos.
 */
export async function clearPendingOrders() {
    try {
        // Al borrar la PurchaseOrder, Prisma borra automáticamente los items (onDelete: Cascade)
        await prisma.purchaseOrder.deleteMany({
            where: { status: "PENDIENTE" }
        })
        return { success: true }
    } catch (error) {
        console.error("Error al limpiar pedidos pendientes:", error)
        return { success: false }
    }
}

export async function getSupplierProducts() {
    try {
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

        const lastVentasUpdate = await prisma.importVentas.findFirst({
            orderBy: { updatedAt: 'desc' },
            select: { updatedAt: true }
        })

       const mappedData = products.map(p => {
    // Tomamos las ventas que n8n guardó en salesLast30
    const ventas = p.ventas?.salesLast30 || 0;
    
    // 👇 CAMBIO CLAVE: Calculamos la velocidad mensual directamente desde las ventas
    // Asumimos que "ventas" representa el periodo seleccionado (ej. 30 días)
    const velocity = ventas / 1; 

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
