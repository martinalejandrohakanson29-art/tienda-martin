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
            
            // Prioridad: venta.fecha > globalFecha > Hoy
            const fechaStr = venta.fecha || globalFecha;
            
            let createdAt: Date;
            if (fechaStr && typeof fechaStr === 'string' && fechaStr.includes('-')) {
                // Si viene YYYY-MM-DD, forzamos 12:00 UTC para que caiga en el rango del día
                createdAt = new Date(`${fechaStr}T12:00:00Z`);
            } else {
                createdAt = new Date();
            }

            console.log(`[Webhook Registracion] Procesando envío ${shippingId}. Fecha original: ${venta.fecha || 'N/A'}. Global: ${globalFecha || 'N/A'}. Usando createdAt: ${createdAt.toISOString()}`);

            const packId = venta.packId || venta.pack_id ? String(venta.packId || venta.pack_id) : null;

            return prisma.ventaMLRegistracion.upsert({
                where: { shippingId },
                update: {
                    orderId: String(venta.orderId || venta.ventaId),
                    packId: packId,
                    mla: String(venta.mla),
                    categoria: venta.categoria || "Desconocido",
                    nombre: venta.nombre || null,
                    neto: venta.neto ? Number(venta.neto) : null,
                    bruto: venta.bruto ? Number(venta.bruto) : null,
                    variation: venta.variation || null,
                    createdAt: createdAt // Actualizamos la fecha para el filtrado correcto
                },
                create: {
                    shippingId,
                    orderId: String(venta.orderId || venta.ventaId),
                    packId: packId,
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
            message: `${ventasData.length} ventas procesadas y guardadas correctamente` 
        });

    } catch (error: any) {
        console.error("Error en webhook registracion:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
