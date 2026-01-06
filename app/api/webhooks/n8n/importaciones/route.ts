import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Forzamos que esta ruta sea dinámica (siempre ejecute lógica)
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
    try {
        // 1. SEGURIDAD: Verificar que sea n8n quien llama
        const authHeader = req.headers.get("authorization")
        if (authHeader !== `Bearer ${process.env.N8N_SECRET_TOKEN}`) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // 2. Recibir los datos (Array de productos)
        const body = await req.json()
        const { items } = body // Esperamos un objeto { "items": [ ... ] }

        if (!Array.isArray(items)) {
            return NextResponse.json({ error: "Formato inválido. Se espera un array 'items'." }, { status: 400 })
        }

        console.log(`📡 Recibiendo ${items.length} items de n8n...`)

        // 3. PROCESAMIENTO MASIVO (Batch Transaction)
        // Usamos una transacción para que sea ultra rápido
        const operations = items.map((item: any) => {
            // Mapeamos las columnas de tu CSV/n8n a la Base de Datos
            return prisma.supplierProduct.upsert({
                where: { 
                    sku: String(item.CODIGO_SISTEMA || item.sku) // Buscamos por SKU
                },
                // Si NO existe, lo creamos:
                create: {
                    sku: String(item.CODIGO_SISTEMA || item.sku),
                    name: String(item.ARTICULO || item.name || "Sin Nombre"),
                    supplier: String(item.PROVEEDOR || item.supplier || "Desconocido"),
                    stockExternal: Number(item.STOCK_ACTUAL || 0),
                    salesLast30: Number(item.VENTAS_ML || 0),
                    salesVelocity: Number(item.PROMEDIO_CONSUMO || 0),
                    monthsCoverage: Number(item.MESES_STOCK || 0)
                },
                // Si YA existe, solo actualizamos los números:
                update: {
                    stockExternal: Number(item.STOCK_ACTUAL || 0),
                    salesLast30: Number(item.VENTAS_ML || 0),
                    salesVelocity: Number(item.PROMEDIO_CONSUMO || 0),
                    monthsCoverage: Number(item.MESES_STOCK || 0),
                    updatedAt: new Date() // Marcamos que se actualizó hoy
                }
            })
        })

        // Ejecutamos todo junto
        await prisma.$transaction(operations)

        return NextResponse.json({ 
            success: true, 
            message: `Procesados ${items.length} productos correctamente.` 
        })

    } catch (error: any) {
        console.error("❌ Error en webhook n8n:", error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
