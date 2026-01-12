import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
    try {
        const authHeader = req.headers.get("authorization")
        // Verifica que el token coincida exactamente con lo que configuramos en n8n
        if (authHeader !== `Bearer ${process.env.N8N_SECRET_TOKEN}`) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const mapping = await prisma.kitComponent.findMany({
            include: {
                supplierProduct: {
                    select: {
                        name: true
                    }
                }
            }
        })

        // SOLUCIÓN: Filtramos los items donde el producto ya no existe (null)
        const response = mapping
            .filter(item => item.supplierProduct !== null) 
            .map(item => ({
                mla: item.mla,
                variant: item.variant,
                sku: item.supplierProductSku,
                qty: item.quantityPerKit,
                productName: item.supplierProduct?.name || "Producto no encontrado"
            }))

        console.log(`📡 API Mapping: Enviando ${response.length} relaciones a n8n.`)
        return NextResponse.json(response)

    } catch (error: any) {
        console.error("❌ Error en API Mapping:", error)
        return NextResponse.json(
            { error: "Error interno del servidor", details: error.message }, 
            { status: 500 }
        )
    }
}
