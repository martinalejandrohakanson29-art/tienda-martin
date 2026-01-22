import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get("authorization");
        if (authHeader !== `Bearer ${process.env.N8N_SECRET_TOKEN}`) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        }

        const data = await req.json();

        // Extracción robusta del campo pay_before
        // Intentamos primero desde la raíz (si n8n lo envía como parámetro plano) 
        // y luego desde la estructura anidada de ML
        const rawPayBefore = data.pay_before || data.shipping_option?.estimated_delivery_time?.pay_before;
        const payBefore = rawPayBefore ? new Date(rawPayBefore) : null;

        // Si datos_json llega como string, lo convertimos a objeto
        let itemsDetalle = data.datos_json;
        if (typeof itemsDetalle === 'string') {
            try {
                itemsDetalle = JSON.parse(itemsDetalle);
            } catch (e) {
                console.error("Error al parsear datos_json:", e);
                itemsDetalle = [];
            }
        }

        if (!Array.isArray(itemsDetalle)) {
            return NextResponse.json({ error: "datos_json debe ser una lista" }, { status: 400 });
        }

        await prisma.$transaction(async (tx) => {
            await tx.etiquetaML.upsert({
                where: { id: String(data.shipping_id) },
                update: {
                    orderId: String(data.order_id),
                    substatus: data.substatus,
                    resumen: data.resumen,
                    logisticType: data.logistic_type,
                    payBefore: payBefore // Aquí se guarda el dato enriquecido
                },
                create: {
                    id: String(data.shipping_id),
                    orderId: String(data.order_id),
                    substatus: data.substatus,
                    resumen: data.resumen,
                    status: "PENDIENTE",
                    logisticType: data.logistic_type,
                    payBefore: payBefore
                }
            });

            await tx.etiquetaMLItem.deleteMany({
                where: { etiquetaId: String(data.shipping_id) }
            });

            const itemOperations = itemsDetalle.map((item: any) => ({
                etiquetaId: String(data.shipping_id),
                mla: String(item.mla),
                title: item.nombre,
                quantity: Number(item.cantidad),
                variation: item.variante && item.variante !== "Sin variante" ? String(item.variante) : null
            }));

            await tx.etiquetaMLItem.createMany({
                data: itemOperations
            });
        });

        return NextResponse.json({ success: true, message: "Etiqueta registrada con fecha de despacho" });
    } catch (error: any) {
        console.error("Error en webhook envíos:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
