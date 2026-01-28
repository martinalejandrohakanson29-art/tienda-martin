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
            // 1. Identificamos el envío. Si no hay shipping_id, usamos el order_id como respaldo.
            const shippingId = String(data.shipping_id || data.id || data.order_id);
            
            if (!shippingId || shippingId === 'undefined') {
                console.error("Webhook: Se recibió un envío sin ID válido", data);
                continue;
            }

            // 2. Procesamos fechas y estados
            const rawPayBefore = data.pay_before || data.shipping_option?.estimated_delivery_time?.pay_before;
            const payBefore = rawPayBefore ? new Date(rawPayBefore) : null;
            
            // Dato clave: Fecha de impresión de ML
            const mlFirstPrinted = data.date_first_printed ? new Date(data.date_first_printed) : null;
            
            // El pedido se considera "preparado" si ya tiene fecha de impresión 
            // o si el estado es 'ready_to_ship' (que es lo que manda tu n8n)
            const esPreparado = 
                mlFirstPrinted !== null || 
                data.status === 'ready_to_ship' || 
                ['ready_for_pickup', 'printed'].includes(data.substatus);

            let itemsDetalle = data.datos_json || [];
            if (typeof itemsDetalle === 'string') {
                try {
                    itemsDetalle = JSON.parse(itemsDetalle);
                } catch (e) {
                    itemsDetalle = [];
                }
            }

            await prisma.$transaction(async (tx) => {
                // Buscamos si ya existe para ver si tiene una fecha previa
                const registroExistente = await tx.etiquetaML.findUnique({
                    where: { id: shippingId },
                    select: { fechaPreparado: true }
                });

                // LÓGICA DE FECHA (FECHA PREPARADO):
                let nuevaFechaPreparado = registroExistente?.fechaPreparado || null;
                
                // Si ML nos manda la fecha real de impresión, esa manda sobre todo.
                if (mlFirstPrinted) {
                    nuevaFechaPreparado = mlFirstPrinted;
                } 
                // Si no hay fecha oficial pero detectamos que está listo y no teníamos fecha, 
                // usamos la hora actual del servidor como backup.
                else if (!nuevaFechaPreparado && esPreparado) {
                    nuevaFechaPreparado = new Date();
                }

                // Guardamos/Actualizamos la etiqueta
                await tx.etiquetaML.upsert({
                    where: { id: shippingId },
                    update: {
                        orderId: String(data.order_id),
                        status: data.status || "PENDIENTE", // <--- IMPORTANTE: Ahora sí actualiza el estado
                        substatus: data.substatus || null,
                        resumen: data.resumen,
                        logisticType: data.logistic_type,
                        payBefore: payBefore,
                        fechaPreparado: nuevaFechaPreparado 
                    },
                    create: {
                        id: shippingId,
                        orderId: String(data.order_id),
                        status: data.status || "PENDIENTE",
                        substatus: data.substatus || null,
                        resumen: data.resumen,
                        logisticType: data.logistic_type,
                        payBefore: payBefore,
                        fechaPreparado: nuevaFechaPreparado
                    }
                });

                // Actualizamos los items vinculados
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
