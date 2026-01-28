// app/actions/envios.ts
"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

/**
 * Llama al workflow de n8n para iniciar la descarga y actualización de etiquetas
 */
export async function actualizarPedidos() {
    try {
        const webhookUrl = process.env.N8N_GENERATE_ETIQUETAS_URL;
        
        if (!webhookUrl) {
            throw new Error("La URL de n8n no está configurada en las variables de entorno");
        }

        const response = await fetch(webhookUrl.trim(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                source: 'nextjs_admin_panel', 
                action: 'manual_refresh',
                timestamp: new Date().toISOString()
            })
        });

        if (!response.ok) {
            throw new Error(`Error en n8n: ${response.statusText}`);
        }

        revalidatePath('/admin/mercadolibre/envios');

        return { success: true, message: "Sincronización iniciada correctamente" };
    } catch (error: any) {
        console.error("Error al llamar a n8n:", error);
        return { success: false, error: error.message || "Error al conectar con n8n" };
    }
}

/**
 * Llama al workflow de n8n para generar el PDF de las etiquetas seleccionadas
 */
export async function imprimirEtiquetas(ids: string[]) {
    try {
        const webhookUrl = process.env.N8N_IMPRESION_WEBHOOK;

        if (!webhookUrl) {
            throw new Error("La variable N8N_IMPRESION_WEBHOOK no está configurada");
        }

        const response = await fetch(webhookUrl.trim(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                ids: ids,
                action: 'print_batch',
                timestamp: new Date().toISOString()
            })
        });

        if (!response.ok) {
            throw new Error(`Error generando PDF en n8n: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Pdf = buffer.toString('base64');

        return { success: true, pdfBase64: base64Pdf };

    } catch (error: any) {
        console.error("Error al imprimir etiquetas:", error);
        return { success: false, error: error.message || "Error al generar el PDF" };
    }
}

/**
 * Obtiene las etiquetas que aún están en proceso operativo
 */
export async function getEtiquetasML() {
    try {
        const etiquetas = await prisma.etiquetaML.findMany({
            where: {
                NOT: [
                    { AND: [{ logisticType: 'cross_docking' }, { substatus: 'picked_up' }] },
                    { AND: [{ logisticType: 'self_service' }, { substatus: 'out_for_delivery' }] },
                    { status: { in: ['delivered', 'cancelled'] } }
                ]
            },
            include: { items: true },
            orderBy: { createdAt: 'desc' }
        });

        const etiquetasEnriquecidas = await Promise.all(etiquetas.map(async (envio) => {
            const itemsConAgregados = await Promise.all(envio.items.map(async (item) => {
                const viewResult: any[] = await prisma.$queryRaw`
                    SELECT ids_articulos 
                    FROM vista_costos_productos 
                    WHERE mla = ${item.mla} 
                    AND variation_id IS NOT DISTINCT FROM ${item.variation}
                    LIMIT 1
                `;

                if (viewResult.length > 0 && viewResult[0].ids_articulos) {
                    const ids: string[] = viewResult[0].ids_articulos.split(/[+,]/).map((id: string) => id.trim()).filter(Boolean);
                    const articulos = await prisma.costosArticulos.findMany({
                        where: { id_articulo: { in: ids } },
                        select: { id_articulo: true, descripcion: true }
                    });
                    const nombres = ids.map((id: string) => articulos.find((a) => a.id_articulo === id)?.descripcion || "Sin descripción");
                    return { ...item, agregadoInfo: { ids_articulos: ids.join(', '), nombres_articulos: nombres.join(' | ') } };
                }
                return { ...item, agregadoInfo: null };
            }));
            return { ...envio, items: itemsConAgregados };
        }));

        return { success: true, data: etiquetasEnriquecidas };
    } catch (error) {
        console.error("Error al obtener etiquetas:", error);
        return { success: false, data: [] };
    }
}

/**
 * Reporte Diario de Pedidos Preparados
 * LÓGICA HIBRIDA: Usa 'fechaPreparado' (dato real de ML) y hace fallback a 'updatedAt'
 * para registros antiguos que no tienen el dato nuevo.
 */
export async function getEtiquetasPreparadas(fecha: string) {
    try {
        // AJUSTE DE ZONA HORARIA (Argentina UTC-3)
        const startOfDay = new Date(fecha); 
        startOfDay.setUTCHours(3, 0, 0, 0); 

        const endOfDay = new Date(fecha);
        endOfDay.setDate(endOfDay.getDate() + 1); 
        endOfDay.setUTCHours(2, 59, 59, 999); 

        const etiquetas = await prisma.etiquetaML.findMany({
            where: {
                AND: [
                    // Excluimos cancelados siempre
                    { NOT: { status: 'cancelled' } },
                    {
                        OR: [
                            // Opción A: Tiene fecha oficial y coincide con el rango
                            { 
                                fechaPreparado: { gte: startOfDay, lte: endOfDay } 
                            },
                            // Opción B (Fallback): NO tiene fecha oficial (es null) y su updatedAt coincide
                            { 
                                fechaPreparado: null,
                                updatedAt: { gte: startOfDay, lte: endOfDay }
                            }
                        ]
                    }
                ]
            },
            include: { items: true },
            orderBy: { 
                // Usamos updatedAt para ordenar uniformemente registros nuevos y viejos
                updatedAt: 'desc' 
            }
        });

        const etiquetasEnriquecidas = await Promise.all(etiquetas.map(async (envio) => {
            const itemsConAgregados = await Promise.all(envio.items.map(async (item) => {
                const viewResult: any[] = await prisma.$queryRaw`
                    SELECT ids_articulos FROM vista_costos_productos WHERE mla = ${item.mla} AND variation_id IS NOT DISTINCT FROM ${item.variation} LIMIT 1
                `;
                if (viewResult.length > 0 && viewResult[0].ids_articulos) {
                    const ids: string[] = viewResult[0].ids_articulos.split(/[+,]/).map((id: string) => id.trim()).filter(Boolean);
                    const articulos = await prisma.costosArticulos.findMany({ where: { id_articulo: { in: ids } }, select: { id_articulo: true, descripcion: true } });
                    const nombres = ids.map((id: string) => articulos.find((a) => a.id_articulo === id)?.descripcion || "Sin descripción");
                    return { ...item, agregadoInfo: { ids_articulos: ids.join(', '), nombres_articulos: nombres.join(' | ') } };
                }
                return { ...item, agregadoInfo: null };
            }));
            return { ...envio, items: itemsConAgregados };
        }));

        return { success: true, data: etiquetasEnriquecidas };
    } catch (error) {
        console.error("Error al obtener preparados:", error);
        return { success: false, data: [] };
    }
}
