// app/actions/envios.ts
"use server"

import { prisma } from "@/lib/prisma"

export async function getEtiquetasML() {
    try {
        // 1. Obtenemos las etiquetas e ítems como siempre
        const etiquetas = await prisma.etiquetaML.findMany({
            include: {
                items: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // 2. Enriquecemos cada ítem con los datos de la vista_costos_productos
        const etiquetasEnriquecidas = await Promise.all(etiquetas.map(async (envio) => {
            const itemsConAgregados = await Promise.all(envio.items.map(async (item) => {
                // USAMOS "IS NOT DISTINCT FROM" para comparar el variation_id.
                // Esto reemplaza el "OR variation_id IS NULL..." y evita el error de tipos.
                const datosVista: any[] = await prisma.$queryRaw`
                    SELECT titulo, ids_articulos 
                    FROM vista_costos_productos 
                    WHERE mla = ${item.mla} 
                    AND variation_id IS NOT DISTINCT FROM ${item.variation}
                    LIMIT 1
                `;

                return {
                    ...item,
                    agregadoInfo: datosVista.length > 0 ? datosVista[0] : null
                };
            }));

            return {
                ...envio,
                items: itemsConAgregados
            };
        }));

        return { success: true, data: etiquetasEnriquecidas };
    } catch (error) {
        // Ahora el log te dará más detalle si ocurre algo distinto
        console.error("Error al obtener etiquetas enriquecidas:", error);
        return { success: false, data: [] };
    }
}
