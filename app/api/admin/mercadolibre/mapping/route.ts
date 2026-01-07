import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Forzamos que la ruta sea siempre dinámica para traer datos frescos
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
    try {
        // 1. Verificamos seguridad (Token de n8n)
        const authHeader = req.headers.get("authorization")
        if (authHeader !== `Bearer ${process.env.N8N_SECRET_TOKEN}`) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        // 2. Consultamos todos los mapeos de la tabla KitComponent
        const mapping = await prisma.kitComponent.findMany({
            select: {
                mla: true,
                variant: true,
                supplierProductSku: true,
                quantityPerKit: true
            }
        })

        console.log(`📡 Enviando ${mapping.length} mapeos a n8n...`)
        return NextResponse.json(mapping)

    } catch (error: any) {
        console.error("❌ Error en API Mapping:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
