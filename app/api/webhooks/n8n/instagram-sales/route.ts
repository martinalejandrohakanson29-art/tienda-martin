// app/api/webhooks/n8n/instagram-sales/route.ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

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

        const result = await prisma.$transaction(async (tx) => {
            const sale = await tx.instagramSale.upsert({
                where: { id_comprobante: String(data.id_comprobante) },
                update: {
                    total: parsePrice(data.monto_total),
                    metodo_pago: data.metodo_pago,
                    cliente: data.cliente,
                    numero_comprobante: data.numero_comprobante,
                    envio: data.envio ? parsePrice(data.envio) : 0, 
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

            const itemsToCreate = [];

            // 1. Mapeamos artículos FILTRANDO los que valen $0 (regalos)
            if (data.articulos && Array.isArray(data.articulos)) {
                const validItems = data.articulos.filter((art: any) => {
                    const precio = parsePrice(art.precio_total);
                    return art.detalle !== null && precio > 0; // <--- FILTRO CLAVE
                });

                validItems.forEach((art: any) => {
                    itemsToCreate.push({
                        saleId: sale.id,
                        detalle: art.detalle,
                        cantidad: String(art.cantidad),
                        precio_total: parsePrice(art.precio_total) 
                    });
                });
            }

            // 2. Agregamos el envío como un artículo especial si existe
            const montoEnvio = data.envio ? parsePrice(data.envio) : 0;
            if (montoEnvio > 0) {
                itemsToCreate.push({
                    saleId: sale.id,
                    detalle: "COSTO DE ENVIO",
                    cantidad: "1",
                    precio_total: montoEnvio
                });
            }

            if (itemsToCreate.length > 0) {
                await tx.instagramSaleItem.createMany({
                    data: itemsToCreate
                })
            }
            
            return sale;
        });

        return NextResponse.json({ success: true, id: result.id })
    } catch (error: any) {
        console.error("Error en Carga Unificada IG:", error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
