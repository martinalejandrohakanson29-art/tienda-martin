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

        // --- 1. LÓGICA PARA STOCK Y VENTAS ---
        const salesAndStockOps = items.map((item: any) => {
            const skuVal = String(item.sku || item.SKU || item.id_articulo);
            
            // IMPORTANTE: Primero aseguramos que el SupplierProduct existe para evitar el error de FK
            const ensureProduct = prisma.supplierProduct.upsert({
                where: { sku: skuVal },
                update: {}, // Si existe, no cambiamos nada
                create: { 
                    sku: skuVal, 
                    name: item.articulo || item.name || "Producto nuevo de sincronización" 
                }
            });

            if (item.VENTAS_ML !== undefined) {
                return [
                    ensureProduct,
                    prisma.importVentas.upsert({
                        where: { sku: skuVal },
                        update: { salesLast30: Number(item.VENTAS_ML), updatedAt: new Date() },
                        create: { sku: skuVal, salesLast30: Number(item.VENTAS_ML) }
                    })
                ]
            }
            if (item.STOCK_ACTUAL !== undefined) {
                return [
                    ensureProduct,
                    prisma.importStock.upsert({
                        where: { sku: skuVal },
                        update: { stockExternal: Number(item.STOCK_ACTUAL), updatedAt: new Date() },
                        create: { sku: skuVal, stockExternal: Number(item.STOCK_ACTUAL) }
                    })
                ]
            }
            return null;
        }).filter(Boolean).flat();

        // --- 2. LÓGICA PARA FUTUROS INGRESOS (PurchaseOrders) ---
        if (items[0].carrito_id) {
            const firstItem = items[0];
            const [day, month, year] = firstItem.fecha_arribo.split('/');
            const formattedDate = new Date(`${year}-${month}-${day}`);

            const purchaseOrder = await prisma.purchaseOrder.upsert({
                where: { id: firstItem.carrito_id },
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

            await prisma.purchaseOrderItem.deleteMany({
                where: { purchaseOrderId: purchaseOrder.id }
            });

            // Usamos connectOrCreate para asegurar que el producto existe antes de crear el ítem
            const itemOperations = items.map((item: any) => {
                const skuVal = String(item.id_articulo);
                return prisma.purchaseOrderItem.create({
                    data: {
                        purchaseOrder: { connect: { id: purchaseOrder.id } },
                        supplierProduct: {
                            connectOrCreate: {
                                where: { sku: skuVal },
                                create: { 
                                    sku: skuVal, 
                                    name: item.articulo || "Producto Importado" 
                                }
                            }
                        },
                        quantity: parseInt(item.cantidad),
                    }
                });
            });

            await prisma.$transaction(itemOperations);
        }

        if (salesAndStockOps.length > 0) {
            await prisma.$transaction(salesAndStockOps as any);
        }

        return NextResponse.json({ success: true, message: "Datos procesados correctamente" })
    } catch (error: any) {
        console.error("Error en webhook:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
