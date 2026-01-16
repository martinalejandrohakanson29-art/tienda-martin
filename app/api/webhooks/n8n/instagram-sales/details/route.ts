// app/api/webhooks/n8n/instagram-sales/details/route.ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Función para limpiar precios "115.000,00" -> 115000
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

        const data = await req.json();
        const { id_comprobante, metodo_pago, monto_total, envio, articulos } = data;

        // 1. Buscar la venta base por el ID de comprobante
        const sale = await prisma.instagramSale.findUnique({
            where: { id_comprobante: String(id_comprobante) }
        });

        if (!sale) {
            return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
        }

        // 2. Limpiar detalles previos para evitar duplicados si se re-ejecuta el workflow
        await prisma.instagramSalePaymentGroup.deleteMany({
            where: { saleId: sale.id }
        });

        // 3. Crear el grupo de pago y sus artículos (Relación nested)
        const updatedSale = await prisma.instagramSalePaymentGroup.create({
            data: {
                saleId: sale.id,
                metodo_pago: metodo_pago,
                monto_total: parsePrice(monto_total),
                envio: parsePrice(envio),
                articulos: {
                    create: articulos.map((art: any) => ({
                        tipo: art.tipo,
                        cantidad: art.cantidad,
                        detalle: art.detalle,
                        marca: art.marca,
                        precio_neto: parsePrice(art.precio_neto),
                        iva: parsePrice(art.iva),
                        precio_total: parsePrice(art.precio_total),
                    }))
                }
            }
        });

        return NextResponse.json({ success: true, paymentGroupId: updatedSale.id });
    } catch (error: any) {
        console.error("Error cargando detalles IG:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
