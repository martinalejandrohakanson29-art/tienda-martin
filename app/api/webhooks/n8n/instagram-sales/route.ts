import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Función para limpiar precios si vienen con puntos/comas
function parsePrice(priceStr: any): number {
    if (typeof priceStr === "number") return priceStr;
    if (!priceStr) return 0;
    const clean = String(priceStr).replace(/\./g, "").replace(",", ".");
    return parseFloat(clean);
}

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get("authorization")
        if (authHeader !== `Bearer ${process.env.N8N_SECRET_TOKEN}`) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const data = await req.json()

        // Usamos una transacción para asegurar que se cree la venta y sus ítems juntos
        const result = await prisma.$transaction(async (tx) => {
            // 1. Upsert de la venta principal
            const sale = await tx.instagramSale.upsert({
                where: { id_comprobante: String(data.id_comprobante) },
                update: {
                    total: parsePrice(data.monto_total),
                    metodo_pago: data.metodo_pago,
                    cliente: data.cliente,
                    numero_comprobante: data.numero_comprobante,
                    // Borramos ítems viejos para recargarlos si es una actualización
                    articulos: { deleteMany: {} } 
                },
                create: {
                    id_comprobante: String(data.id_comprobante),
                    numero_comprobante: data.numero_comprobante,
                    cliente: data.cliente,
                    total: parsePrice(data.monto_total),
                    metodo_pago: data.metodo_pago,
                    envio: data.envio ? parsePrice(data.envio) : 0,
                    dni: data.dni || ""
                }
            })

            // 2. Carga de artículos si vienen en el JSON
            if (data.articulos && Array.isArray(data.articulos)) {
                const validItems = data.articulos.filter((art: any) => art.detalle !== null);
                
                if (validItems.length > 0) {
                    await tx.instagramSaleItem.createMany({
                        data: validItems.map((art: any) => ({
                            saleId: sale.id,
                            detalle: art.detalle,
                            cantidad: String(art.cantidad)
                        }))
                    })
                }
            }
            return sale;
        });

        return NextResponse.json({ success: true, id: result.id })
    } catch (error: any) {
        console.error("Error en Carga IG:", error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
