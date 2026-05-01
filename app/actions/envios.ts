// app/actions/envios.ts
"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { crearVentaMostrador } from "./ventas-mostrador"

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
        // AJUSTE DE ZONA HORARIA (Argentina UTC-3) para cubrir todo el día de forma segura
        const startOfDay = new Date(`${fecha}T03:00:00Z`);

        const endOfDay = new Date(`${fecha}T03:00:00Z`);
        endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
        endOfDay.setUTCMilliseconds(-1); // 02:59:59.999 del día siguiente UTC

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
export async function getVentasRegistracion(fecha?: string) {
    try {
        const where: any = {};

        if (fecha && fecha !== "undefined" && fecha !== "null") {
            // AJUSTE DE ZONA HORARIA (Argentina UTC-3) para cubrir todo el día de forma segura
            const startOfDay = new Date(`${fecha}T03:00:00Z`);

            const endOfDay = new Date(`${fecha}T03:00:00Z`);
            endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
            endOfDay.setUTCMilliseconds(-1);

            where.createdAt = {
                gte: startOfDay,
                lte: endOfDay
            };
        }

        const ventas = await prisma.ventaMLRegistracion.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 500 // Ampliamos el límite por las dudas
        });

        // Buscamos cuáles de estas ya están registradas en la tabla Venta
        const orderIds = ventas.map(v => v.orderId);
        const ventasRegistradas = await prisma.venta.findMany({
            where: { mlIdVenta: { in: orderIds } },
            select: { mlIdVenta: true }
        });
        const setRegistradas = new Set(ventasRegistradas.map(v => v.mlIdVenta));

        // Enriquecemos con datos de la vista de costos (receta)
        const ventasEnriquecidas = await Promise.all(ventas.map(async (venta) => {
            const viewResult: any[] = await prisma.$queryRaw`
                SELECT ids_articulos, receta_detallada 
                FROM vista_costos_productos 
                WHERE mla = ${venta.mla} 
                AND variation_id IS NOT DISTINCT FROM ${venta.variation}
                LIMIT 1
            `;

            return {
                ...venta,
                registrada: setRegistradas.has(venta.orderId),
                ids_articulos: viewResult.length > 0 ? viewResult[0].ids_articulos : null,
                receta_detallada: viewResult.length > 0 ? viewResult[0].receta_detallada : null
            };
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
                where: { orderId: { in: ids } }
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

/**
 * Registra una lista de ventas de MercadoLibre en el ERP (ventas-mostrador)
 */
export async function registrarVentasML(
    ids: string[],
    solicitarFactura: boolean = false,
    tipoComprobante: number = 6,
    docTipo: number = 99,
    docNro: string = "0",
    condicionIva: number = 5,
    razonSocial?: string
) {
    try {
        if (!ids || ids.length === 0) return { success: false, error: "No hay IDs seleccionados" };

        // 1. Buscamos el Punto de Venta "MercadoLibre"
        const pv = await prisma.puntoVenta.findFirst({
            where: {
                OR: [
                    { nombre: { contains: "MercadoLibre", mode: 'insensitive' } },
                    { nombre: { contains: "mercadopago (ML)", mode: 'insensitive' } }
                ]
            }
        });

        if (!pv) {
            return { success: false, error: "No se encontró el punto de venta 'MercadoLibre'" };
        }

        // 2. Obtenemos las ventas a registrar
        const ventasRes = await getVentasRegistracion();
        if (!ventasRes.success) return { success: false, error: "No se pudieron obtener las ventas de registración" };

        const todasLasVentas = ventasRes.data || [];
        const ventasAProcesar = todasLasVentas.filter(v => ids.includes(v.orderId));

        if (ventasAProcesar.length === 0) return { success: false, error: "No se encontraron las ventas seleccionadas" };

        let procesados = 0;
        let errores = 0;

        for (const v of ventasAProcesar) {
            try {
                // Preparar items
                const idsArticulos = v.ids_articulos?.split(/[+,]/).map((id: string) => id.trim()).filter(Boolean) || [];
                const recetaDetallada = v.receta_detallada?.split('|').map((s: string) => s.trim()) || [];

                const netoTotal = Number(v.neto || 0);
                const brutoTotal = Number(v.bruto || 0);
                const interes = brutoTotal - netoTotal;

                let items: any[] = [];

                if (idsArticulos.length > 0) {
                    // Si hay IDs de artículos, los usamos
                    // Buscamos los nombres y precios actuales para distribuir el neto proporcionalmente
                    const articulosInfo = await prisma.articuloMostrador.findMany({
                        where: { id: { in: idsArticulos } }
                    });

                    // Usamos un Map para búsquedas más eficientes
                    const articulosMap = new Map(articulosInfo.map(a => [a.id, a]));

                    // Calculamos el total basándonos en todos los elementos del kit (incluyendo duplicados si los hubiera)
                    const totalPreciosBase = idsArticulos.reduce((sum: number, idArt: string) => {
                        const info = articulosMap.get(idArt);
                        return sum + Number(info?.precio || 0);
                    }, 0);

                    items = idsArticulos.map((idArt: string, idx: number) => {
                        const info = articulosMap.get(idArt);
                        const nombre = info?.nombre || recetaDetallada[idx] || `Producto ML ${v.mla}`;
                        const precioBase = info ? Number(info.precio) : 0;

                        // Distribuimos el neto proporcionalmente al precio base, o equitativamente si no hay precios
                        let precioUnit = 0;
                        if (totalPreciosBase > 0) {
                            precioUnit = (precioBase / totalPreciosBase) * netoTotal;
                        } else {
                            precioUnit = netoTotal / idsArticulos.length;
                        }

                        return {
                            productoId: idArt,
                            nombre: nombre,
                            cantidad: 1, // En ML las cantidades suelen venir ya multiplicadas en la receta o ser 1
                            precio_unit: precioUnit,
                            subtotal: precioUnit
                        };
                    });
                } else {
                    // Si no hay receta, usamos un item genérico con el MLA
                    items = [{
                        productoId: null,
                        nombre: `Venta MercadoLibre ${v.mla}${v.variation ? ' - Var: ' + v.variation : ''}`,
                        cantidad: 1,
                        precio_unit: netoTotal,
                        subtotal: netoTotal
                    }];
                }

                const res = await crearVentaMostrador({
                    cliente: razonSocial || v.nombre || "Cliente MercadoLibre",
                    vendedor: "Sistema MercadoLibre",
                    total: netoTotal,
                    interes: interes,
                    totalFinal: brutoTotal,
                    items: items,
                    metodo_pago: "MercadoLibre",
                    info: `Neto ML: $${netoTotal.toLocaleString('es-AR')}`,
                    cupon: v.orderId,          // ID Venta en campo cupon
                    de: v.orderId,             // ID Venta en campo de
                    transaccionId: v.shippingId, // ID Envío en campo transaccionId (para que se vea en la columna Trans.)
                    para: v.shippingId,        // ID Envío en campo para
                    mlIdVenta: v.orderId,
                    mlIdEnvio: v.shippingId,
                    mlMla: v.mla,
                    puntoVentaId: pv.id,
                    eventoOffline: false,
                    solicitarFactura: solicitarFactura,
                    tipoComprobante: tipoComprobante,
                    docTipo: docTipo,
                    docNro: docNro,
                    condicionIva: condicionIva
                });

                if (res.success) {
                    procesados++;
                    // Si son muchas facturas, damos un respiro al servidor/AFIP
                    if (solicitarFactura && ventasAProcesar.length > 5) {
                        await new Promise(resolve => setTimeout(resolve, 1500));
                    }
                } else {
                    console.error(`Error procesando venta ${v.shippingId}:`, res.error);
                    errores++;
                }
            } catch (err) {
                console.error(`Error fatal procesando venta ${v.shippingId}:`, err);
                errores++;
            }
        }

        // 3. Ya no limpiamos las ventas, para que sigan figurando como registradas
        // if (procesados > 0) {
        //     await limpiarVentasRegistracion(ids);
        // }

        revalidatePath('/admin/mercadolibre/despachados');
        revalidatePath('/admin/ventas-mostrador');

        return {
            success: true,
            message: `Proceso finalizado. Registrados: ${procesados}, Errores: ${errores}`
        };

    } catch (error: any) {
        console.error("Error en registrarVentasML:", error);
        return { success: false, error: error.message || "Error en el servidor" };
    }
}
