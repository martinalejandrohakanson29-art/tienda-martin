// app/api/webhooks/n8n/importaciones/route.ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get("authorization")
        if (authHeader !== `Bearer ${process.env.N8N_SECRET_TOKEN}`) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { items } = await req.json()

        if (!items || items.length === 0) {
            return NextResponse.json({ error: "No hay items" }, { status: 400 })
        }

        // --- LÓGICA PARA STOCK Y VENTAS (Lo que ya tenías) ---
        const salesAndStockOps = items.map((item: any) => {
            const skuVal = String(item.sku || item.SKU || item.id_articulo);
            
            if (item.VENTAS_ML !== undefined) {
                return prisma.importVentas.upsert({
                    where: { sku: skuVal },
                    update: { salesLast30: Number(item.VENTAS_ML), updatedAt: new Date() },
                    create: { sku: skuVal, salesLast30: Number(item.VENTAS_ML) }
                })
            }
            if (item.STOCK_ACTUAL !== undefined) {
                return prisma.importStock.upsert({
                    where: { sku: skuVal },
                    update: { stockExternal: Number(item.STOCK_ACTUAL), updatedAt: new Date() },
                    create: { sku: skuVal, stockExternal: Number(item.STOCK_ACTUAL) }
                })
            }
            return null;
        }).filter(Boolean);

        // --- LÓGICA PARA FUTUROS INGRESOS (Nueva sección) ---
        // Verificamos si el primer item tiene carrito_id (indica que es un ingreso de mercadería)
        if (items[0].carrito_id) {
            const firstItem = items[0];
            
            // Convertimos la fecha de "17/12/2025" a formato que la base de datos entienda
            const [day, month, year] = firstItem.fecha_arribo.split('/');
            const formattedDate = new Date(`${year}-${month}-${day}`);

            // 1. Creamos o actualizamos la Orden de Compra (Cabecera)
            const purchaseOrder = await prisma.purchaseOrder.upsert({
                where: { id: firstItem.carrito_id }, // Usamos carrito_id como ID único
                update: {
                    supplier: firstItem.proveedor,
                    arrivalDate: formattedDate,
                    status: "PENDIENTE",
                    totalItems: items.length,
                    updatedAt: new Date()
                },
                create: {
                    id: firstItem.carrito_id,
                    externalId: firstItem.carrito_numero,
                    supplier: firstItem.proveedor,
                    arrivalDate: formattedDate,
                    status: "PENDIENTE",
                    totalItems: items.length
                }
            });

            // 2. Limpiamos items viejos de esta orden para no duplicar si n8n re-envía
            await prisma.purchaseOrderItem.deleteMany({
                where: { purchaseOrderId: purchaseOrder.id }
            });

            // 3. Preparamos la creación de los nuevos items
            const itemOperations = items.map((item: any) => {
                return prisma.purchaseOrderItem.create({
                    data: {
                        purchaseOrderId: purchaseOrder.id,
                        supplierProductSku: String(item.id_articulo),
                        quantity: parseInt(item.cantidad),
                    }
                });
            });

            await prisma.$transaction(itemOperations);
        }

        // Ejecutamos también las operaciones de stock/ventas si existieran
        if (salesAndStockOps.length > 0) {
            await prisma.$transaction(salesAndStockOps as any);
        }

        return NextResponse.json({ success: true, message: "Ingreso de mercadería guardado" })
    } catch (error: any) {
        console.error("Error en webhook:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
