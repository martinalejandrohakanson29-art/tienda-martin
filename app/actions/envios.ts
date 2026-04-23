// app/actions/envios.ts
"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

/**
 * Genera un PDF con los datos de un pedido de venta
 * Esta función se usa para generar el PDF de pedidos en /admin/erp/pedidos-venta
 */
export async function generarPedidoPDF(ventaId: string) {
    try {
        const webhookUrl = process.env.N8N_PEDIDO_PDF_WEBHOOK;

        if (!webhookUrl) {
            throw new Error("La variable N8N_PEDIDO_PDF_WEBHOOK no está configurada");
        }

        const response = await fetch(webhookUrl.trim(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ventaId: ventaId,
                action: 'generate_pedido_pdf',
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
        console.error("Error al generar PDF del pedido:", error);
        return { success: false, error: error.message || "Error al generar el PDF" };
    }
}

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
 * (Esta función alimenta la tabla general de envíos)
 */
export async function getEtiquetasML() {
    try {
        revalidatePath('/admin/mercadolibre/envios');

        const etiquetas = await prisma.etiquetaML.findMany({
            where: {
                status: { 
                    notIn: ['shipped', 'delivered', 'cancelled', 'canceled', 'closed'] 
                },
                NOT: { 
                    substatus: { in: ['picked_up', 'out_for_delivery', 'shipped', 'delivered'] } 
                }
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
 * LÓGICA FINAL: 
 * 1. Fecha Preparado: Coincide con el día filtrado.
 * 2. Status: NO cancelado.
 * 3. Substatus: NO 'ready_to_print' (debe estar listo de verdad).
 */
export async function getEtiquetasPreparadas(fecha: string) {
    try {
        // AJUSTE DE ZONA HORARIA (Argentina UTC-3) para cubrir todo el día
        const startOfDay = new Date(fecha); 
        startOfDay.setUTCHours(3, 0, 0, 0); 

        const endOfDay = new Date(fecha);
        endOfDay.setDate(endOfDay.getDate() + 1); 
        endOfDay.setUTCHours(2, 59, 59, 999); 

        const etiquetas = await prisma.etiquetaML.findMany({
            where: {
                AND: [
                    // 1. Filtro de seguridad: Nada cancelado
                    { 
                        status: { notIn: ['cancelled', 'canceled', 'CANCELLED'] } 
                    },
                    // 2. Filtro estricto: Solo si tiene fecha de preparado en el rango
                    { 
                        fechaPreparado: { 
                            gte: startOfDay, 
                            lte: endOfDay 
                        } 
                    },
                    // 3. FILTRO CORREGIDO: Excluir 'ready_to_print' pero PERMITIR los nulos
                    {
                        OR: [
                            { substatus: { not: 'ready_to_print' } },
                            { substatus: null }
                        ]
                    }
                ]
            },
            include: { items: true },
            // Ordenamos por la fecha real de preparación
            orderBy: { 
                fechaPreparado: 'desc' 
            }
        });

        // Lógica de enriquecimiento de items (Agregados)
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

/**
 * Obtiene las ventas pendientes de registración desde la tabla temporal
 */
export async function getVentasRegistracion() {
    try {
        const ventas = await prisma.ventaMLRegistracion.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100
        });

        // Enriquecemos con datos de la vista de costos (receta)
        const ventasEnriquecidas = await Promise.all(ventas.map(async (venta) => {
            const viewResult: any[] = await prisma.$queryRaw`
                SELECT ids_articulos, receta_detallada 
                FROM vista_costos_productos 
                WHERE mla = ${venta.mla} 
                LIMIT 1
            `;

            if (viewResult.length > 0) {
                return { 
                    ...venta, 
                    ids_articulos: viewResult[0].ids_articulos,
                    receta_detallada: viewResult[0].receta_detallada
                };
            }
            return { ...venta, ids_articulos: null, receta_detallada: null };
        }));

        return { 
            success: true, 
            data: ventasEnriquecidas
        };
    } catch (error) {
        console.error("Error al obtener ventas para registracion:", error);
        return { success: false, data: [] };
    }
}

/**
 * Limpia la tabla de registración (opcional, para después de procesar)
 */
export async function limpiarVentasRegistracion(ids?: string[]) {
    try {
        if (ids && ids.length > 0) {
            await prisma.ventaMLRegistracion.deleteMany({
                where: { shippingId: { in: ids } }
            });
        } else {
            await prisma.ventaMLRegistracion.deleteMany({});
        }
        return { success: true };
    } catch (error) {
        console.error("Error al limpiar ventas registracion:", error);
        return { success: false };
    }
}
