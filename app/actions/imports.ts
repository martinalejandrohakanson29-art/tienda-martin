// app/actions/imports.ts
"use server"
import { prisma } from "@/lib/prisma"

/**
 * Limpia todos los pedidos de compra pendientes.
 * Se usa antes de sincronizar con n8n para evitar pedidos duplicados o antiguos.
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

        // 1. Mapeo inicial de todos los productos
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

        // 2. Lógica interna: Sumar ventas y ocultar SKUs específicos
        const redistribucion = [
            { origen: "485797", destino: "483329" },
            { origen: "485801", destino: "483374" }
        ];

        redistribucion.forEach(({ origen, destino }) => {
            const itemOrigen = mappedData.find(i => i.sku === origen);
            const itemDestino = mappedData.find(i => i.sku === destino);

            if (itemOrigen && itemDestino) {
                // Sumamos las ventas del origen al destino
                itemDestino.salesLast30 += itemOrigen.salesLast30;
                
                // Recalculamos la velocidad y la cobertura del destino con las nuevas ventas
                itemDestino.salesVelocity = itemDestino.salesLast30 / 1;
                itemDestino.monthsCoverage = itemDestino.salesVelocity > 0 
                    ? Number((itemDestino.stockExternal / itemDestino.salesVelocity).toFixed(1)) 
                    : (itemDestino.stockExternal > 0 ? 999 : 0);
            }
        });

        // 3. Filtramos los SKUs que ya no queremos mostrar
        const skusAOcultar = redistribucion.map(r => r.origen);
        const finalData = mappedData.filter(item => !skusAOcultar.includes(item.sku));

        return {
            data: finalData,
            lastUpdate: lastVentasUpdate?.updatedAt || null
        }
    } catch (error) {
        console.error("Error obteniendo productos:", error)
        return { data: [], lastUpdate: null }
    }
}
