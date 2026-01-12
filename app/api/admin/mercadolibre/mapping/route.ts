import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Forzamos que la ruta sea siempre dinámica para obtener datos en tiempo real
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
    try {
        // 1. Verificación de seguridad mediante el token secreto
        const authHeader = req.headers.get("authorization")
        if (authHeader !== `Bearer ${process.env.N8N_SECRET_TOKEN}`) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        // 2. Consultamos la tabla KitComponent
        // Se elimina el filtro 'isNot: null' ya que la relación es obligatoria en el schema
        const mapping = await prisma.kitComponent.findMany({
            select: {
                mla: true,
                variant: true,
                supplierProductSku: true,
                quantityPerKit: true,
                supplierProduct: {
                    select: {
                        name: true
                    }
                }
            }
        })

        // 3. Formateamos la respuesta para que sea fácil de procesar en n8n
        const response = mapping.map(item => ({
            mla: item.mla,
            variant: item.variant,
            sku: item.supplierProductSku,
            qty: item.quantityPerKit,
            productName: item.supplierProduct.name // Al ser relación obligatoria, el nombre siempre existe
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
