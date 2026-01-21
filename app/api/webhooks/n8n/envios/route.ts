import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get("authorization");
        if (authHeader !== `Bearer ${process.env.N8N_SECRET_TOKEN}`) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        }

        const data = await req.json();

        // data.shipping_id y data.datos_json vienen de tu nodo 'Code in JavaScript2' de n8n
        await prisma.$transaction(async (tx) => {
            // 1. Guardar o actualizar la cabecera del envío
            await tx.etiquetaML.upsert({
                where: { id: String(data.shipping_id) },
                update: {
                    orderId: String(data.order_id),
                    substatus: data.substatus,
                    resumen: data.resumen,
                    // Aquí puedes mapear el logistic.type que viene del nodo Switch de n8n
                },
                create: {
                    id: String(data.shipping_id),
                    orderId: String(data.order_id),
                    substatus: data.substatus,
                    resumen: data.resumen,
                    status: "PENDIENTE"
                }
            });

            // 2. Limpiar ítems anteriores y cargar los nuevos detallados
            await tx.etiquetaMLItem.deleteMany({
                where: { etiquetaId: String(data.shipping_id) }
            });

            const itemOperations = data.datos_json.map((item: any) => ({
                etiquetaId: String(data.shipping_id),
                mla: String(item.mla),
                title: item.nombre,
                quantity: Number(item.cantidad),
                variation: String(item.variante)
            }));

            await tx.etiquetaMLItem.createMany({
                data: itemOperations
            });
        });

        return NextResponse.json({ success: true, message: "Etiqueta registrada" });
    } catch (error: any) {
        console.error("Error en webhook envíos:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
