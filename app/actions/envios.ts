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
 * Marca un envío como despachado de forma manual
 */
export async function marcarComoDespachado(id: string) {
    try {
        await prisma.etiquetaML.update({
            where: { id: id },
            data: { 
                status: 'shipped',
                fechaPreparado: new Date() // Usamos esta fecha para el reporte diario
            }
        });

        revalidatePath('/admin/mercadolibre/envios');
        revalidatePath('/admin/mercadolibre/despachados');

        return { success: true };
    } catch (error: any) {
        console.error("Error al marcar como despachado:", error);
        return { success: false, error: error.message || "Error al actualizar el estado" };
    }
}

/**
 * Obtiene las etiquetas que aún están en proceso operativo
 * (Esta función alimenta la tabla general de envíos)
 */
export async function getEtiquetasML() {
    try {
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

        const allMlas = Array.from(new Set(etiquetas.flatMap(e => e.items.map(i => i.mla))));
        const todosLosComponentes = allMlas.length > 0
            ? await prisma.composicionKits.findMany({ where: { mla: { in: allMlas } } })
            : [];

        const etiquetasEnriquecidas = etiquetas.map((envio) => {
            const itemsConAgregados = envio.items.map((item) => {
                const variation = item.variation ?? null;
                const componentes = todosLosComponentes.filter(c =>
                    c.mla === item.mla &&
                    (c.nombre_variante === '0' || c.variation_id === variation)
                );
                if (componentes.length > 0) {
                    const ids = componentes.map(c => c.id_articulo);
                    const nombres = componentes.map(c => c.nombre_articulo || 'Sin descripción');
                    return { ...item, agregadoInfo: { ids_articulos: ids.join(', '), nombres_articulos: nombres.join(' | ') } };
                }
                return { ...item, agregadoInfo: null };
            });
            return { ...envio, items: itemsConAgregados };
        });

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
        const startOfDay = new Date(`${fecha}T00:00:00-03:00`);
        const endOfDay = new Date(`${fecha}T23:59:59.999-03:00`);

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

        const allMlas = Array.from(new Set(etiquetas.flatMap(e => e.items.map(i => i.mla))));
        const todosLosComponentes = allMlas.length > 0
            ? await prisma.composicionKits.findMany({ where: { mla: { in: allMlas } } })
            : [];

        const etiquetasEnriquecidas = etiquetas.map((envio) => {
            const itemsConAgregados = envio.items.map((item) => {
                const variation = item.variation ?? null;
                const componentes = todosLosComponentes.filter(c =>
                    c.mla === item.mla &&
                    (c.nombre_variante === '0' || c.variation_id === variation)
                );
                if (componentes.length > 0) {
                    const ids = componentes.map(c => c.id_articulo);
                    const nombres = componentes.map(c => c.nombre_articulo || 'Sin descripción');
                    return { ...item, agregadoInfo: { ids_articulos: ids.join(', '), nombres_articulos: nombres.join(' | ') } };
                }
                return { ...item, agregadoInfo: null };
            });
            return { ...envio, items: itemsConAgregados };
        });

        return { success: true, data: etiquetasEnriquecidas };
    } catch (error) {
        console.error("Error al obtener preparados:", error);
        return { success: false, data: [] };
    }
}

/**
 * Obtiene las ventas pendientes de registración desde la tabla temporal
 */
export async function getVentasRegistracion(fechaDesde?: string, fechaHasta?: string) {
    try {
        const where: any = {};

        const validDesde = fechaDesde && fechaDesde !== "undefined" && fechaDesde !== "null";
        const validHasta = fechaHasta && fechaHasta !== "undefined" && fechaHasta !== "null";

        if (validDesde || validHasta) {
            where.createdAt = {};
            if (validDesde) where.createdAt.gte = new Date(`${fechaDesde}T00:00:00-03:00`);
            if (validHasta) where.createdAt.lte = new Date(`${fechaHasta}T23:59:59.999-03:00`);
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

        // Buscamos etiquetas relacionadas para obtener títulos y cantidades
        const shippingIds = ventas.map(v => v.shippingId).filter(Boolean);
        const labels = await prisma.etiquetaML.findMany({
            where: { id: { in: shippingIds } },
            include: { items: true }
        });
        const labelsMap = new Map(labels.map(l => [l.id, l]));

        const allVentaMlas = Array.from(new Set(ventas.map(v => v.mla.trim())));
        const todosLosComponentes = allVentaMlas.length > 0
            ? await prisma.composicionKits.findMany({ where: { mla: { in: allVentaMlas } } })
            : [];

        const ventasEnriquecidas = ventas.map((venta) => {
            const label = labelsMap.get(venta.shippingId);
            const labelItem = label?.items.find(i => i.mla === venta.mla && (i.variation === venta.variation || (!i.variation && !venta.variation)));

            const variation = venta.variation ?? null;
            const componentes = todosLosComponentes.filter(c =>
                c.mla === venta.mla.trim() &&
                (c.nombre_variante === '0' || c.variation_id === variation)
            );

            const ids_articulos = componentes.length > 0
                ? componentes.map(c => c.id_articulo).join(', ')
                : null;
            const receta_detallada = componentes.length > 0
                ? componentes.map(c => c.nombre_articulo || 'Sin descripción').join(' | ')
                : null;

            return {
                ...venta,
                registrada: setRegistradas.has(venta.orderId),
                ids_articulos,
                receta_detallada,
                titulo: labelItem?.title || `Venta ML`,
                cantidad: (venta.cantidad && venta.cantidad > 0) ? venta.cantidad : (labelItem?.quantity || 1)
            };
        });

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
        let erroresDetalle: { orderId: string; shippingId: string; motivo: string }[] = [];

        for (const v of ventasAProcesar) {
            try {
                // Preparar items
                const idsArticulos = v.ids_articulos?.split(/[+,]/).map((id: string) => id.trim()).filter(Boolean) || [];
                const recetaDetallada = v.receta_detallada?.split('|').map((s: string) => s.trim()) || [];

                const netoTotal = Number(v.neto || 0);
                const brutoTotal = Number(v.bruto || 0);
                const interes = brutoTotal - netoTotal;
                const cantidadVenta = Math.max(1, Number(v.cantidad) || 1);

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

                    // netoTotal ya es el total de la orden (todas las unidades).
                    // precio_unit = parte proporcional del neto por 1 unidad de cada componente.
                    // cantidad = cantidadVenta → stock se descuenta correctamente por el nro de unidades vendidas.
                    items = idsArticulos.map((idArt: string, idx: number) => {
                        const info = articulosMap.get(idArt);
                        const nombre = info?.nombre || recetaDetallada[idx] || `Producto ML ${v.mla}`;
                        const precioBase = info ? Number(info.precio) : 0;

                        let precioUnit = 0;
                        if (totalPreciosBase > 0) {
                            precioUnit = (precioBase / totalPreciosBase) * (netoTotal / cantidadVenta);
                        } else {
                            precioUnit = netoTotal / idsArticulos.length / cantidadVenta;
                        }

                        return {
                            productoId: idArt,
                            nombre: nombre,
                            cantidad: cantidadVenta,
                            precio_unit: precioUnit,
                            subtotal: precioUnit * cantidadVenta
                        };
                    });
                } else {
                    console.error(`[REGISTRACION] La venta ${v.shippingId} no tiene receta vinculada (MLA: ${v.mla})`);
                    erroresDetalle.push({ orderId: v.orderId, shippingId: v.shippingId, motivo: `Sin receta vinculada (MLA: ${v.mla})` });
                    continue;
                }

                // Determinamos el nombre del cliente evitando que sea el título del producto
                let nombreCliente = razonSocial?.trim();

                // Si es Consumidor Final (99) y no se ingresó una razón social manual, 
                // forzamos "Consumidor Final" para evitar que se cuele el título del producto.
                if (!nombreCliente && docTipo === 99) {
                    nombreCliente = "Consumidor Final";
                }

                if (!nombreCliente) {
                    // Si no hay razón social manual ni es CF forzado, evaluamos el nombre que viene de la registración
                    const nombreRegistracion = v.nombre?.trim() || "";
                    const tituloProducto = (v as any).titulo?.trim() || "";
                    
                    // Lista de palabras que sugieren que el nombre es en realidad un producto
                    const suspiciousKeywords = ["Kit", "Cilindro", "Leva", "Motos", "Freno", "Disco", "Ruleman", "Piston", "Juego", "Escape", "Amortiguador", "Cubierta", "Llanta", "Espejo", "Faro", "Bateria"];
                    const lowerNombre = nombreRegistracion.toLowerCase();
                    const wordsCount = nombreRegistracion.split(' ').length;
                    
                    const matchesAnyItem = recetaDetallada.some((r: string) => r.toLowerCase().trim() === lowerNombre);
                    const containsKeywords = wordsCount > 3 && suspiciousKeywords.some((k: string) => lowerNombre.includes(k.toLowerCase()));
                    
                    if (!nombreRegistracion || 
                        nombreRegistracion === tituloProducto || 
                        matchesAnyItem || 
                        containsKeywords
                    ) {
                        nombreCliente = "Consumidor Final";
                    } else {
                        nombreCliente = nombreRegistracion;
                    }
                }

                const res = await crearVentaMostrador({
                    cliente: nombreCliente,
                    vendedor: "Sistema MercadoLibre",
                    total: netoTotal,
                    interes: interes,
                    totalFinal: brutoTotal,
                    items: items,
                    metodo_pago: "MercadoLibre",
                    info: `Neto ML: $${netoTotal.toLocaleString('es-AR')}`,
                    cupon: v.orderId,
                    de: v.orderId,
                    transaccionId: v.shippingId,
                    para: v.shippingId,
                    mlIdVenta: v.orderId,
                    mlIdEnvio: v.shippingId,
                    mlPackId: v.packId ?? undefined,
                    mlMla: v.mla,
                    puntoVentaId: pv.id,
                    eventoOffline: false,
                    solicitarFactura: solicitarFactura,
                    tipoComprobante: tipoComprobante,
                    docTipo: docTipo,
                    docNro: (docNro === "0" || !docNro) ? "" : docNro,
                    condicionIva: condicionIva,
                    mlDni: (docNro === "0" || !docNro) ? "" : docNro,
                    // Fecha original de la venta en ML para que quede registrada en el día correcto
                    fechaOriginal: v.createdAt ? new Date(v.createdAt) : undefined,
                });

                if (res.success) {
                    procesados++;
                    if (solicitarFactura && ventasAProcesar.length > 5) {
                        await new Promise(resolve => setTimeout(resolve, 1500));
                    }
                } else {
                    console.error(`Error procesando venta ${v.shippingId}:`, res.error);
                    erroresDetalle.push({ orderId: v.orderId, shippingId: v.shippingId, motivo: res.error || "Error desconocido" });
                }
            } catch (err: any) {
                console.error(`Error fatal procesando venta ${v.shippingId}:`, err);
                erroresDetalle.push({ orderId: v.orderId, shippingId: v.shippingId, motivo: err?.message || "Error fatal" });
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
            message: `Proceso finalizado. Registrados: ${procesados}${erroresDetalle.length > 0 ? `, Errores: ${erroresDetalle.length}` : ''}`,
            erroresDetalle,
        };

    } catch (error: any) {
        console.error("Error en registrarVentasML:", error);
        return { success: false, error: error.message || "Error en el servidor" };
    }
}
