// app/actions/imports.ts
"use server"
import { prisma } from "@/lib/prisma"

/**
 * Limpia todos los pedidos de compra pendientes.
 */
export async function clearPendingOrders() {
    try {
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

        // 1. Mapeo inicial de todos los productos (tal cual vienen de la DB)
        let mappedData = products.map(p => {
            const ventas = p.ventas?.salesLast30 || 0;
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

        // --- 2. LÓGICA DE SUMA CRUZADA (AJUSTE INTERNO) ---
        
        const skusOrigen = ["485797", "485801"];
        const skusDestino = ["483329", "483374"];

        // Calculamos la suma total de ventas de los dos productos "origen"
        const ventasExtraTotales = mappedData
            .filter(item => skusOrigen.includes(item.sku))
            .reduce((total, item) => total + item.salesLast30, 0);

        // Aplicamos esa suma a cada uno de los productos "destino"
        mappedData = mappedData.map(item => {
            if (skusDestino.includes(item.sku)) {
                const nuevasVentas = item.salesLast30 + ventasExtraTotales;
                const nuevaVelocidad = nuevasVentas / 1; // Mantenemos lógica de velocidad = ventas / 1
                
                // Recalculamos la cobertura con las nuevas ventas
                const nuevaCobertura = nuevaVelocidad > 0 
                    ? Number((item.stockExternal / nuevaVelocidad).toFixed(1)) 
                    : (item.stockExternal > 0 ? 999 : 0);

                return {
                    ...item,
                    salesLast30: nuevasVentas,
                    salesVelocity: nuevaVelocidad,
                    monthsCoverage: nuevaCobertura
                };
            }
            return item;
        });

        // 3. Filtramos para ocultar los SKUs de origen en la tabla
        const finalData = mappedData.filter(item => !skusOrigen.includes(item.sku));

        return {
            data: finalData,
            lastUpdate: lastVentasUpdate?.updatedAt || null
        }
    } catch (error) {
        console.error("Error obteniendo productos:", error)
        return { data: [], lastUpdate: null }
    }
}
