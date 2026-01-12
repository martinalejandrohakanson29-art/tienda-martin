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
            const ventasVal = Number(item.VENTAS_ML || 0);
            const velocityVal = Number(item.PROMEDIO_CONSUMO || 0);

            // Solo hacemos upsert en la tabla de VENTAS
            return prisma.importVentas.upsert({
                where: { sku: skuVal },
                update: {
                    salesLast30: ventasVal,
                    salesVelocity: velocityVal,
                    updatedAt: new Date()
                },
                create: {
                    sku: skuVal,
                    salesLast30: ventasVal,
                    salesVelocity: velocityVal
                }
            })
        })

        await prisma.$transaction(operations)
        return NextResponse.json({ success: true, message: "Ventas actualizadas" })
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
