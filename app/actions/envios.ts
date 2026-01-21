// app/actions/envios.ts
"use server"

import { prisma } from "@/lib/prisma"

export async function getEtiquetasML() {
    try {
        const etiquetas = await prisma.etiquetaML.findMany({
            include: {
                items: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        const etiquetasEnriquecidas = await Promise.all(etiquetas.map(async (envio) => {
            const itemsConAgregados = await Promise.all(envio.items.map(async (item) => {
                // Modificamos la query para traer también los nombres (descripciones) de los artículos
                const datosVista: any[] = await prisma.$queryRaw`
                    SELECT 
                        ids_articulos,
                        (
                            SELECT STRING_AGG(descripcion, ' | ')
                            FROM costos_articulos
                            WHERE id_articulo = ANY(STRING_TO_ARRAY(v.ids_articulos, ', '))
                        ) as nombres_articulos
                    FROM vista_costos_productos v
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
        console.error("Error al obtener etiquetas enriquecidas:", error);
        return { success: false, data: [] };
    }
}
