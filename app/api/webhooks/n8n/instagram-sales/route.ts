// app/api/webhooks/n8n/instagram-sales/route.ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Función para convertir precios en texto "387000" o "1.200,50" a número
function parsePrice(priceStr: any): number {
    if (typeof priceStr === "number") return priceStr;
    if (!priceStr) return 0;
    // Quitamos puntos de miles y cambiamos la coma decimal por punto
    const clean = String(priceStr).replace(/\./g, "").replace(",", ".");
    return parseFloat(clean);
}

export async function POST(req: Request) {
    try {
        // Verificación de seguridad (Token)
        const authHeader = req.headers.get("authorization")
        if (authHeader !== `Bearer ${process.env.N8N_SECRET_TOKEN}`) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const data = await req.json()

        // Usamos una transacción para que se cree la venta y sus ítems como un solo bloque
        const result = await prisma.$transaction(async (tx) => {
            // 1. Crear o actualizar la venta base
            const sale = await tx.instagramSale.upsert({
                where: { id_comprobante: String(data.id_comprobante) },
                update: {
                    total: parsePrice(data.monto_total),
                    metodo_pago: data.metodo_pago,
                    cliente: data.cliente,
                    numero_comprobante: data.numero_comprobante,
                    // CORRECCIÓN: Cargamos el envío también en el update
                    envio: data.envio ? parsePrice(data.envio) : 0, 
                    // Borramos ítems viejos para evitar duplicados si se re-envía
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

            // 2. Cargar los artículos si vienen en el JSON
            if (data.articulos && Array.isArray(data.articulos)) {
                // Filtramos los que vienen con 'detalle' nulo para no cargar basura
                const validItems = data.articulos.filter((art: any) => art.detalle !== null);
                
                if (validItems.length > 0) {
                    await tx.instagramSaleItem.createMany({
                        data: validItems.map((art: any) => ({
                            saleId: sale.id,
                            detalle: art.detalle,
                            cantidad: String(art.cantidad),
                            // CORRECCIÓN: Agregamos el mapeo del precio total del artículo
                            precio_total: parsePrice(art.precio_total) 
                        }))
                    })
                }
            }
            return sale;
        });

        return NextResponse.json({ success: true, id: result.id })
    } catch (error: any) {
        console.error("Error en Carga Unificada IG:", error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
