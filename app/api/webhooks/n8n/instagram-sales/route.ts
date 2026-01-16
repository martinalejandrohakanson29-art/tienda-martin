// app/api/webhooks/n8n/instagram-sales/route.ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

function parseDate(dateStr: string): Date {
    // Si por algún motivo llega vacío, devolvemos la fecha actual para que no falle
    if (!dateStr) return new Date();
    const [day, month, year] = dateStr.split("/").map(Number);
    return new Date(year, month - 1, day);
}

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get("authorization")
        if (authHeader !== `Bearer ${process.env.N8N_SECRET_TOKEN}`) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const data = await req.json()

        // 💡 CORRECCIÓN: Buscamos tanto en minúscula como en mayúscula para evitar el error
        const id_comprobante = String(data.id_comprobante || data.Id_comprobante);
        const fecha_str = data.fecha || data.Fecha;
        const total = data.total || data.Total || 0;
        const cliente = data.cliente || data.Cliente || "Sin nombre";
        const vendedor = data.vendedor || data.Vendedor || "MARTIN";

        const sale = await prisma.instagramSale.upsert({
            where: { id_comprobante: id_comprobante },
            update: {
                total: total,
                cliente: cliente,
                vendedor: vendedor,
                updatedAt: new Date()
            },
            create: {
                id_comprobante: id_comprobante,
                numero_comprobante: data.numero_comprobante || "",
                fecha: parseDate(fecha_str),
                total: total,
                cliente: cliente,
                dni: data.dni || "",
                vendedor: vendedor,
                forma_comprobante: data.forma_comprobante || "Factura",
            }
        })

        return NextResponse.json({ success: true, id: sale.id })
    } catch (error: any) {
        console.error("Error en Webhook IG Sales:", error);
        return NextResponse.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 })
    }
}
