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
        
        // n8n puede enviar { fecha: '...', ventas: [...] } o directamente el array
        const ventasData = Array.isArray(body) ? body : (body.ventas || [body]);
        const globalFecha = body.fecha;

        if (ventasData.length === 0) {
            return NextResponse.json({ success: true, message: "No hay datos para procesar" });
        }

        // Procesamos cada venta recibida
        const operations = ventasData.map((venta: any) => {
            const shippingId = String(venta.shippingId || venta.envioId);
            
            // Usamos la fecha de la venta individual, la global del body, o hoy si no hay ninguna
            const fechaStr = venta.fecha || globalFecha;
            
            // Si hay una fecha, forzamos el createdAt a las 12:00 de ese día 
            // para que caiga siempre dentro del rango gte(03:00) y lte(02:59+1d)
            const createdAt = fechaStr ? new Date(`${fechaStr}T12:00:00Z`) : new Date();

            return prisma.ventaMLRegistracion.upsert({
                where: { shippingId },
                update: {
                    orderId: String(venta.orderId || venta.ventaId),
                    mla: String(venta.mla),
                    categoria: venta.categoria || "Desconocido",
                    nombre: venta.nombre || null,
                    neto: venta.neto ? Number(venta.neto) : null,
                    bruto: venta.bruto ? Number(venta.bruto) : null,
                    variation: venta.variation || null,
                    createdAt: createdAt // Forzamos la fecha para el filtrado
                },
                create: {
                    shippingId,
                    orderId: String(venta.orderId || venta.ventaId),
                    mla: String(venta.mla),
                    categoria: venta.categoria || "Desconocido",
                    nombre: venta.nombre || null,
                    neto: venta.neto ? Number(venta.neto) : null,
                    bruto: venta.bruto ? Number(venta.bruto) : null,
                    variation: venta.variation || null,
                    createdAt: createdAt
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
