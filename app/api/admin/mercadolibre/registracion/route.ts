// app/api/admin/mercadolibre/registracion/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const rangoDiaAR = (fecha: string) => ({
    gte: new Date(`${fecha}T00:00:00-03:00`),
    lte: new Date(`${fecha}T23:59:59.999-03:00`)
});

// La rama de búsqueda por fecha del workflow de n8n solo procesa ventas Full (las salidas
// Flex y Colecta de su Switch están desconectadas). Todo lo que no sea Full entra únicamente
// por la rama "preparados", con la lista que se manda acá. Por eso la lista se arma en el
// servidor a partir de la fecha elegida, y no con lo que esté mostrando la pestaña
// Preparados: esa vista depende de otro selector de fecha y del buscador compartido.
//
// Criterio contable: solo se factura lo efectivamente PREPARADO, así que se replica el mismo
// filtro que getEtiquetasPreparadas (preparadas ese día, sin canceladas ni 'ready_to_print').
// Las Full no necesitan estar acá: las trae la rama de búsqueda por fecha del workflow
// (ML las despacha desde su depósito, no pasan por preparación en el local).
async function armarPreparados(fecha: string) {
    const rango = rangoDiaAR(fecha);
    const etiquetas = await prisma.etiquetaML.findMany({
        where: {
            status: { notIn: ["cancelled", "canceled", "CANCELLED"] },
            orderId: { not: null },
            fechaPreparado: rango,
            OR: [
                { substatus: { not: "ready_to_print" } },
                { substatus: null }
            ]
        },
        include: { items: true }
    });

    return etiquetas.map((e) => ({
        shippingId: e.id,
        orderId: e.orderId,
        pack: e.packId,
        mla: e.items[0]?.mla,
        variation: e.items[0]?.variation
    }));
}

async function dispararWorkflow(url: string, action: string, fecha: string, preparados: any[]) {
    // El webhook de n8n responde con el último nodo, así que este fetch bloquea
    // hasta que el workflow termina de procesar.
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            action,
            preparados,
            fecha,
            timestamp: new Date().toISOString()
        })
    });

    if (!response.ok) {
        throw new Error(`Error en n8n: ${response.statusText}`);
    }

    return response.json();
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const action = body.action || "get_sales_to_register";
        // Día de hoy en Argentina como respaldo si el cliente no mandó fecha
        const fecha: string = body.fecha || new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

        const N8N_WEBHOOK_URL = process.env.N8N_REGISTRACION_VENTAS_URL || "https://n8n.revolucionmotos.tech/webhook/Registracion";

        const preparados = await armarPreparados(fecha);
        const data = await dispararWorkflow(N8N_WEBHOOK_URL, action, fecha, preparados);

        // Segunda pasada: la rama Full del workflow no manda "cantidad", así que esas ventas
        // quedan con cantidad null. Se las reenvía por la rama "preparados", que consulta la
        // orden en ML y sí la manda. El webhook receptor nunca pisa una cantidad ya conocida,
        // así que repetir el envío es inocuo.
        const sinCantidad = await prisma.ventaMLRegistracion.findMany({
            where: {
                createdAt: rangoDiaAR(fecha),
                cantidad: null,
                estado: { in: ["PENDIENTE", "ERROR"] }
            },
            select: { shippingId: true, orderId: true, packId: true, mla: true, variation: true }
        });

        if (sinCantidad.length > 0) {
            await dispararWorkflow(N8N_WEBHOOK_URL, action, fecha, sinCantidad.map((v) => ({
                shippingId: v.shippingId,
                orderId: v.orderId,
                pack: v.packId,
                mla: v.mla.trim(),
                variation: v.variation
            })));
        }

        return NextResponse.json(data);

    } catch (error: any) {
        console.error("Error en API Registracion:", error);
        return NextResponse.json(
            { error: error.message || "Error al conectar con n8n" },
            { status: 500 }
        );
    }
}
