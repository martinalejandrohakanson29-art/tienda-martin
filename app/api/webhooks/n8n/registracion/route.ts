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

        // Mapeo del logisticType real (ya guardado en EtiquetaML cuando el pedido pasó por "Preparados")
        // a la categoría que usa esta pantalla. Corrige que n8n manda "Colecta" fijo para todo lo que
        // viene de la rama de "preparados", sin importar si en realidad es Flex.
        const CATEGORIA_POR_LOGISTIC_TYPE: Record<string, string> = {
            self_service: "Flex",
            cross_docking: "Colecta",
            fulfillment: "Full"
        };

        // Procesamos cada venta recibida
        const operations = ventasData.map(async (venta: any) => {
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

            const orderId = String(venta.orderId || venta.ventaId);

            const cantidad = venta.cantidad != null ? Math.max(1, parseInt(String(venta.cantidad)) || 1) : null;

            // Si el envío ya pasó por "Preparados" conocemos su logisticType real (Flex/Colecta);
            // si no existe (típico de Full, que ML despacha desde su depósito) respetamos lo que mandó n8n.
            const etiqueta = await prisma.etiquetaML.findUnique({
                where: { id: shippingId },
                select: { logisticType: true }
            });
            const categoria = (etiqueta?.logisticType && CATEGORIA_POR_LOGISTIC_TYPE[etiqueta.logisticType])
                || venta.categoria
                || "Desconocido";

            return prisma.ventaMLRegistracion.upsert({
                where: { orderId },
                update: {
                    shippingId,
                    packId: packId,
                    mla: String(venta.mla),
                    categoria,
                    nombre: venta.nombre || null,
                    neto: venta.neto ? Number(venta.neto) : null,
                    bruto: venta.bruto ? Number(venta.bruto) : null,
                    cantidad: cantidad,
                    variation: venta.variation || null,
                    createdAt: createdAt
                    // Nota: no tocamos "estado"/"ventaId" acá a propósito, para no pisar
                    // una venta que ya fue reclamada/registrada si n8n reenvía el mismo pedido.
                },
                create: {
                    orderId,
                    shippingId,
                    packId: packId,
                    mla: String(venta.mla),
                    categoria,
                    nombre: venta.nombre || null,
                    neto: venta.neto ? Number(venta.neto) : null,
                    bruto: venta.bruto ? Number(venta.bruto) : null,
                    cantidad: cantidad,
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
