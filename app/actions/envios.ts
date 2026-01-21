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
                // 1. Buscamos los IDs en la vista técnica usando el MLA y Variante
                const viewResult: any[] = await prisma.$queryRaw`
                    SELECT ids_articulos 
                    FROM vista_costos_productos 
                    WHERE mla = ${item.mla} 
                    AND variation_id IS NOT DISTINCT FROM ${item.variation}
                    LIMIT 1
                `;

                if (viewResult.length > 0 && viewResult[0].ids_articulos) {
                    // 2. Limpiamos los IDs (quitamos espacios extras) y aseguramos que sea un array de strings
                    const ids: string[] = viewResult[0].ids_articulos.split(',').map((id: string) => id.trim());
                    
                    // 3. Buscamos las descripciones de esos IDs específicos en la tabla de costos
                    const articulos = await prisma.costosArticulos.findMany({
                        where: { id_articulo: { in: ids } },
                        select: { id_articulo: true, descripcion: true }
                    });
                    
                    // 4. Mapeamos cada ID con su nombre exacto (Agregamos el tipo : string para evitar el error de build)
                    const nombres = ids.map((id: string) => {
                        const art = articulos.find(a => a.id_articulo === id);
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
