"use server"

import { prisma } from "@/lib/prisma"

/**
 * Obtiene las etiquetas que aún están en proceso operativo (Pendientes, Impresas, etc.)
 */
export async function getEtiquetasML() {
    try {
        // Obtenemos las etiquetas filtrando las que ya cumplieron su ciclo operativo
        const etiquetas = await prisma.etiquetaML.findMany({
            where: {
                NOT: [
                    {
                        AND: [
                            { logisticType: 'cross_docking' }, // Colecta
                            { substatus: 'picked_up' }       // Ya retirado
                        ]
                    },
                    {
                        AND: [
                            { logisticType: 'self_service' }, // Flex
                            { substatus: 'out_for_delivery' } // Ya en reparto
                        ]
                    },
                    {
                        // Excluimos también si el estado general ya es entregado o cancelado
                        status: { in: ['delivered', 'cancelled'] }
                    }
                ]
            },
            include: {
                items: true
            },
            orderBy: {
                createdAt: 'desc'
            }
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
                    const ids: string[] = viewResult[0].ids_articulos
                        .split(/[+,]/)
                        .map((id: string) => id.trim())
                        .filter(Boolean);
                    
                    const articulos = await prisma.costosArticulos.findMany({
                        where: { id_articulo: { in: ids } },
                        select: { id_articulo: true, descripcion: true }
                    });
                    
                    const nombres = ids.map((id: string) => {
                        const art = articulos.find((a) => a.id_articulo === id);
                        return art?.descripcion || "Sin descripción";
                    });

                    return {
                        ...item,
                        agregadoInfo: {
                            ids_articulos: ids.join(', '),
                            nombres_articulos: nombres.join(' | ')
                        }
                    };
                }

                return { ...item, agregadoInfo: null };
            }));

            return {
                ...envio,
                items: itemsConAgregados
            };
        }));

        return { success: true, data: etiquetasEnriquecidas };
    } catch (error) {
        console.error("Error al obtener etiquetas enriquecidas:", error);
        return { success: false, data: [] };
    }
}

/**
 * Obtiene los pedidos que fueron despachados en una fecha específica
 */
export async function getEtiquetasDespachadas(fecha: string) {
    try {
        const startOfDay = new Date(fecha);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(fecha);
        endOfDay.setHours(23, 59, 59, 999);

        const etiquetas = await prisma.etiquetaML.findMany({
            where: {
                updatedAt: {
                    gte: startOfDay,
                    lte: endOfDay
                },
                OR: [
                    { AND: [{ logisticType: 'cross_docking' }, { substatus: 'picked_up' }] }, // Colecta retirada
                    { AND: [{ logisticType: 'self_service' }, { substatus: 'out_for_delivery' }] }, // Flex en reparto
                    { status: 'delivered' } // Entregas finales
                ]
            },
            include: {
                items: true
            },
            orderBy: {
                updatedAt: 'desc'
            }
        });

        // Enriquecemos con la info técnica de los artículos (IDs internos y descripciones)
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
                    const ids: string[] = viewResult[0].ids_articulos
                        .split(/[+,]/)
                        .map((id: string) => id.trim())
                        .filter(Boolean);
                    
                    const articulos = await prisma.costosArticulos.findMany({
                        where: { id_articulo: { in: ids } },
                        select: { id_articulo: true, descripcion: true }
                    });
                    
                    const nombres = ids.map((id: string) => {
                        const art = articulos.find((a) => a.id_articulo === id);
                        return art?.descripcion || "Sin descripción";
                    });

                    return {
                        ...item,
                        agregadoInfo: {
                            ids_articulos: ids.join(', '),
                            nombres_articulos: nombres.join(' | ')
                        }
                    };
                }

                return { ...item, agregadoInfo: null };
            }));

            return {
                ...envio,
                items: itemsConAgregados
            };
        }));

        return { success: true, data: etiquetasEnriquecidas };
    } catch (error) {
        console.error("Error al obtener despachados:", error);
        return { success: false, data: [] };
    }
}
