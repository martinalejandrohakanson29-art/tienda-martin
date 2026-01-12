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
        
        const operations = items.map((item: any) => {
            const skuVal = String(item.sku || item.SKU || item.CODIGO_SISTEMA);
            
            // Si el item trae ventas, actualizamos ImportVentas
            if (item.VENTAS_ML !== undefined) {
                return prisma.importVentas.upsert({
                    where: { sku: skuVal },
                    update: {
                        salesLast30: Number(item.VENTAS_ML || 0),
                        salesVelocity: Number(item.PROMEDIO_CONSUMO || 0),
                        updatedAt: new Date()
                    },
                    create: {
                        sku: skuVal,
                        salesLast30: Number(item.VENTAS_ML || 0),
                        salesVelocity: Number(item.PROMEDIO_CONSUMO || 0),
                    }
                })
            }

            // SI EL ITEM TRAE STOCK, ACTUALIZAMOS ImportStock
            if (item.STOCK_ACTUAL !== undefined) {
                return prisma.importStock.upsert({
                    where: { sku: skuVal },
                    update: {
                        stockExternal: Number(item.STOCK_ACTUAL || 0),
                        updatedAt: new Date()
                    },
                    create: {
                        sku: skuVal,
                        stockExternal: Number(item.STOCK_ACTUAL || 0),
                    }
                })
            }
        }).filter(Boolean); // Eliminamos operaciones nulas

        await prisma.$transaction(operations)
        return NextResponse.json({ success: true, message: "Datos procesados correctamente" })
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
