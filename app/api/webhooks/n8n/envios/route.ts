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
        // Convertimos a array si n8n envía un solo objeto o una lista
        const enviosInput = Array.isArray(body) ? body : [body];

        for (const data of enviosInput) {
            // Buscamos el ID del envío (pueden venir como shipping_id o id)
            const shippingId = String(data.shipping_id || data.id);
            
            if (!shippingId || shippingId === 'undefined') {
                console.warn("Se omitió un registro por falta de shipping_id");
                continue;
            }

            // Extracción robusta del campo pay_before basada en tu JSON
            const rawPayBefore = data.pay_before || data.shipping_option?.estimated_delivery_time?.pay_before;
            const payBefore = rawPayBefore ? new Date(rawPayBefore) : null;

            // DETERMINAR SI EL PEDIDO ESTÁ "PREPARADO"
            // 'ready_for_pickup' (Colecta) o 'printed' (Flex) indican que el paquete ya está listo
            const esPreparado = ['ready_for_pickup', 'printed'].includes(data.substatus);

            // Procesamiento de itemsDetalle
            let itemsDetalle = data.datos_json || [];
            if (typeof itemsDetalle === 'string') {
                try {
                    itemsDetalle = JSON.parse(itemsDetalle);
                } catch (e) {
                    itemsDetalle = [];
                }
            }

            await prisma.$transaction(async (tx) => {
                // BUSCAR SI YA EXISTE EL REGISTRO PARA VERIFICAR LA FECHA DE PREPARACIÓN
                const registroExistente = await tx.etiquetaML.findUnique({
                    where: { id: shippingId },
                    select: { fechaPreparado: true }
                });

                // LÓGICA DE ASIGNACIÓN DE FECHA (SOLO LA PRIMERA VEZ)
                let nuevaFechaPreparado = registroExistente?.fechaPreparado || null;
                
                // Si el pedido está listo y aún no tiene fecha grabada, se le asigna el momento actual
                if (esPreparado && !nuevaFechaPreparado) {
                    nuevaFechaPreparado = new Date();
                }

                await tx.etiquetaML.upsert({
                    where: { id: shippingId },
                    update: {
                        orderId: String(data.order_id),
                        substatus: data.substatus,
                        resumen: data.resumen,
                        logisticType: data.logistic_type,
                        payBefore: payBefore,
                        fechaPreparado: nuevaFechaPreparado // Guardamos la fecha inmutable
                    },
                    create: {
                        id: shippingId,
                        orderId: String(data.order_id),
                        substatus: data.substatus,
                        resumen: data.resumen,
                        status: "PENDIENTE",
                        logisticType: data.logistic_type,
                        payBefore: payBefore,
                        fechaPreparado: nuevaFechaPreparado
                    }
                });

                await tx.etiquetaMLItem.deleteMany({
                    where: { etiquetaId: shippingId }
                });

                const itemOperations = itemsDetalle.map((item: any) => ({
                    etiquetaId: shippingId,
                    mla: String(item.mla),
                    title: item.nombre,
                    quantity: Number(item.cantidad),
                    variation: item.variante && item.variante !== "Sin variante" ? String(item.variante) : null
                }));

                await tx.etiquetaMLItem.createMany({
                    data: itemOperations
                });
            });
        }

        return NextResponse.json({ success: true, message: `${enviosInput.length} etiquetas procesadas` });
    } catch (error: any) {
        console.error("Error en webhook envíos:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
