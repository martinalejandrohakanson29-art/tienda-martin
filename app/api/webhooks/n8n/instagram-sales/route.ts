import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Función para convertir fecha "16/01/2026" a objeto Date
function parseDate(dateStr: string): Date {
    const [day, month, year] = dateStr.split("/").map(Number);
    return new Date(year, month - 1, day);
}

export async function POST(req: Request) {
    try {
        // Validación de seguridad (Igual a tu webhook de importaciones)
        const authHeader = req.headers.get("authorization")
        if (authHeader !== `Bearer ${process.env.N8N_SECRET_TOKEN}`) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const data = await req.json()

        // El nodo de n8n enviará las ventas una por una o en array. 
        // Vamos a manejar el caso de una sola venta por cada llamada.
        const sale = await prisma.instagramSale.upsert({
            where: { id_comprobante: String(data.id_comprobante) },
            update: {
                total: data.total,
                cliente: data.cliente,
                vendedor: data.vendedor,
                updatedAt: new Date()
            },
            create: {
                id_comprobante: String(data.id_comprobante),
                numero_comprobante: data.numero_comprobante,
                fecha: parseDate(data.fecha),
                total: data.total,
                cliente: data.cliente,
                dni: data.dni || "",
                vendedor: data.vendedor,
                forma_comprobante: data.forma_comprobante,
            }
        })

        return NextResponse.json({ success: true, id: sale.id })
    } catch (error: any) {
        console.error("Error en Webhook IG Sales:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
