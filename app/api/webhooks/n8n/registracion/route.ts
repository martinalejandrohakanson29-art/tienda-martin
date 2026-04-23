// app/api/webhooks/n8n/registracion/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get("authorization");
        if (authHeader !== `Bearer ${process.env.N8N_SECRET_TOKEN}`) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        }

        const body = await req.json();
        const ventasInput = Array.isArray(body) ? body : [body];

        if (ventasInput.length === 0) {
            return NextResponse.json({ success: true, message: "No hay datos para procesar" });
        }

        // Procesamos cada venta recibida
        const operations = ventasInput.map((venta: any) => {
            return prisma.ventaMLRegistracion.upsert({
                where: { shippingId: String(venta.shippingId || venta.envioId) },
                update: {
                    orderId: String(venta.orderId || venta.ventaId),
                    mla: String(venta.mla),
                    categoria: venta.categoria || "Desconocido",
                },
                create: {
                    shippingId: String(venta.shippingId || venta.envioId),
                    orderId: String(venta.orderId || venta.ventaId),
                    mla: String(venta.mla),
                    categoria: venta.categoria || "Desconocido",
                }
            });
        });

        await Promise.all(operations);

        return NextResponse.json({ 
            success: true, 
            message: `${ventasInput.length} ventas procesadas y guardadas correctamente` 
        });

    } catch (error: any) {
        console.error("Error en webhook registracion:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
