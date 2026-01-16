import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get("authorization")
        if (authHeader !== `Bearer ${process.env.N8N_SECRET_TOKEN}`) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const data = await req.json()

        // Usamos upsert para que si la venta ya existe, solo se actualice
        const sale = await prisma.instagramSale.upsert({
            where: { id_comprobante: String(data.id_comprobante) },
            update: {
                total: data.monto_total,
                metodo_pago: data.metodo_pago,
                // Borramos ítems viejos para recargarlos (limpieza)
                articulos: { deleteMany: {} } 
            },
            create: {
                id_comprobante: String(data.id_comprobante),
                numero_comprobante: data.numero_comprobante,
                cliente: data.cliente,
                total: data.monto_total,
                metodo_pago: data.metodo_pago,
                envio: data.envio || 0,
                dni: data.dni || ""
            }
        })

        // Cargamos los artículos si vienen en el JSON
        if (data.articulos && Array.isArray(data.articulos)) {
            await prisma.instagramSaleItem.createMany({
                data: data.articulos
                    .filter((art: any) => art.detalle) // Filtramos los que vienen null
                    .map((art: any) => ({
                        saleId: sale.id,
                        detalle: art.detalle,
                        cantidad: String(art.cantidad)
                    }))
            })
        }

        return NextResponse.json({ success: true, id: sale.id })
    } catch (error: any) {
        console.error("Error en Carga Unificada IG:", error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
