// app/api/webhooks/n8n/envios/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get("authorization");
        if (authHeader !== `Bearer ${process.env.N8N_SECRET_TOKEN}`) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        }

        const body = await req.json();
        const enviosInput = Array.isArray(body) ? body : [body];

        for (const data of enviosInput) {
            const shippingId = String(data.shipping_id || data.id);
            
            if (!shippingId || shippingId === 'undefined') {
                continue;
            }

            const rawPayBefore = data.pay_before || data.shipping_option?.estimated_delivery_time?.pay_before;
            const payBefore = rawPayBefore ? new Date(rawPayBefore) : null;

            // CAPTURAMOS EL DATO OFICIAL DE MERCADO LIBRE
            const mlFirstPrinted = data.date_first_printed ? new Date(data.date_first_printed) : null;
            
            // LÓGICA DE DETECCIÓN MEJORADA:
            // Es preparado si: viene el substatus de ML, el status general es 'ready_to_ship' o ya tenemos fecha de impresión.
            const esPreparado = 
                ['ready_for_pickup', 'printed'].includes(data.substatus) || 
                data.status === 'ready_to_ship' || 
                mlFirstPrinted !== null;

            let itemsDetalle = data.datos_json || [];
            if (typeof itemsDetalle === 'string') {
                try {
                    itemsDetalle = JSON.parse(itemsDetalle);
                } catch (e) {
                    itemsDetalle = [];
                }
            }

            await prisma.$transaction(async (tx) => {
                const registroExistente = await tx.etiquetaML.findUnique({
                    where: { id: shippingId },
                    select: { fechaPreparado: true }
                });

                // LÓGICA DE FECHA PERFECCIONADA:
                let nuevaFechaPreparado = registroExistente?.fechaPreparado || null;
                
                // 1. Prioridad Máxima: Si ML nos manda la fecha real de impresión, usamos esa.
                if (mlFirstPrinted) {
                    nuevaFechaPreparado = mlFirstPrinted;
                } 
                // 2. Backup: Si no hay fecha oficial pero el pedido está listo y no teníamos fecha grabada, usamos la hora actual.
                else if (!nuevaFechaPreparado && esPreparado) {
                    nuevaFechaPreparado = new Date();
                }

                await tx.etiquetaML.upsert({
                    where: { id: shippingId },
                    update: {
                        orderId: String(data.order_id),
                        substatus: data.substatus || null, // Evitamos errores si no viene
                        resumen: data.resumen,
                        logisticType: data.logistic_type,
                        payBefore: payBefore,
                        fechaPreparado: nuevaFechaPreparado 
                    },
                    create: {
                        id: shippingId,
                        orderId: String(data.order_id),
                        substatus: data.substatus || null,
                        resumen: data.resumen,
                        status: "PENDIENTE",
                        logisticType: data.logistic_type,
                        payBefore: payBefore,
                        fechaPreparado: nuevaFechaPreparado
                    }
                });

                await tx.etiquetaMLItem.deleteMany({ where: { etiquetaId: shippingId } });
                const itemOperations = itemsDetalle.map((item: any) => ({
                    etiquetaId: shippingId,
                    mla: String(item.mla),
                    title: item.nombre,
                    quantity: Number(item.cantidad),
                    variation: item.variante && item.variante !== "Sin variante" ? String(item.variante) : null
                }));
                await tx.etiquetaMLItem.createMany({ data: itemOperations });
            });
        }

        return NextResponse.json({ success: true, message: `${enviosInput.length} etiquetas procesadas` });
    } catch (error: any) {
        console.error("Error en webhook envíos:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
