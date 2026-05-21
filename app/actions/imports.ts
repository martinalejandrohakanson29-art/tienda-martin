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

export async function getSupplierProducts(dateFrom?: string, dateTo?: string) {
    try {
        // Rango de fechas: por defecto últimos 30 días
        const to = dateTo ? new Date(dateTo) : new Date()
        to.setHours(23, 59, 59, 999)
        const from = dateFrom ? new Date(dateFrom) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)
        from.setHours(0, 0, 0, 0)

        const daysInRange = Math.max(1, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)))

        // Días reales con datos disponibles: evita subestimar si el sistema tiene menos historial que el rango seleccionado
        const firstVenta = await prisma.venta.findFirst({
            where: { tipoVenta: { not: 'PEDIDO' } },
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true }
        })
        const systemStart = firstVenta?.createdAt ?? from
        const daysSinceStart = Math.max(1, Math.round((to.getTime() - systemStart.getTime()) / (1000 * 60 * 60 * 24)))
        const effectiveDays = Math.min(daysInRange, daysSinceStart)

        const products = await prisma.supplierProduct.findMany({
            include: {
                stock: true,
                purchaseItems: {
                    where: { purchaseOrder: { status: "PENDIENTE" } },
                    include: { purchaseOrder: true }
                }
            },
            orderBy: { sku: 'asc' }
        })

        // Ventas del mostrador en el rango: VentaItem.productoId === SupplierProduct.sku
        const salesData = await prisma.ventaItem.groupBy({
            by: ['productoId'],
            _sum: { cantidad: true },
            where: {
                productoId: { not: null },
                venta: {
                    createdAt: { gte: from, lte: to },
                    tipoVenta: { not: 'PEDIDO' }
                }
            }
        })

        const salesMap = new Map<string, number>()
        for (const s of salesData) {
            if (s.productoId) salesMap.set(s.productoId, s._sum.cantidad ?? 0)
        }

        const lastVenta = await prisma.venta.findFirst({
            where: { createdAt: { gte: from, lte: to }, tipoVenta: { not: 'PEDIDO' } },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true }
        })

        // 1. Mapeo inicial
        let mappedData = products.map(p => {
            const salesInRange = salesMap.get(p.sku) ?? 0
            // Normalizar a velocidad mensual según el rango real seleccionado
            const velocity = (salesInRange / effectiveDays) * 30
            const stock = p.stock?.stockExternal || 0
            const coverage = velocity > 0
                ? Number((stock / velocity).toFixed(1))
                : (stock > 0 ? 999 : 0)

            const futureArrivals: Record<string, { quantity: number, supplier: string }> = {}
            p.purchaseItems.forEach(item => {
                const po = item.purchaseOrder
                const orderKey = po.externalId || po.id
                futureArrivals[orderKey] = { quantity: item.quantity, supplier: po.supplier }
            })

            return {
                id: p.id,
                sku: p.sku,
                name: p.name,
                salesLast30: salesInRange,
                stockExternal: stock,
                salesVelocity: velocity,
                monthsCoverage: coverage,
                futureArrivals
            }
        })

        // 2. Suma cruzada entre SKUs relacionados
        const skusOrigen = ["485797", "485801"]
        const skusDestino = ["483329", "483374"]

        const ventasExtraTotales = mappedData
            .filter(item => skusOrigen.includes(item.sku))
            .reduce((total, item) => total + item.salesLast30, 0)

        mappedData = mappedData.map(item => {
            if (skusDestino.includes(item.sku)) {
                const nuevasVentas = item.salesLast30 + ventasExtraTotales
                const nuevaVelocidad = (nuevasVentas / effectiveDays) * 30
                const nuevaCobertura = nuevaVelocidad > 0
                    ? Number((item.stockExternal / nuevaVelocidad).toFixed(1))
                    : (item.stockExternal > 0 ? 999 : 0)

                return {
                    ...item,
                    salesLast30: nuevasVentas,
                    salesVelocity: nuevaVelocidad,
                    monthsCoverage: nuevaCobertura
                }
            }
            return item
        })

        // 3. Ocultar SKUs origen de la tabla
        const finalData = mappedData.filter(item => !skusOrigen.includes(item.sku))

        return {
            data: finalData,
            lastUpdate: lastVenta?.createdAt || null,
            effectiveDays
        }
    } catch (error) {
        console.error("Error obteniendo productos:", error)
        return { data: [], lastUpdate: null, effectiveDays: 30 }
    }
}
