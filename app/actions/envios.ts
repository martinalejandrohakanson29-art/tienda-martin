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
                // Ajustamos el SQL para manejar "Sin variante" como NULL
                const variationToSearch = (item.variation === "Sin variante" || !item.variation) ? null : item.variation;

                const datosVista: any[] = await prisma.$queryRaw`
                    SELECT titulo, ids_articulos 
                    FROM vista_costos_productos 
                    WHERE mla = ${item.mla} 
                    AND (
                        variation_id = ${variationToSearch} 
                        OR (variation_id IS NULL AND ${variationToSearch} IS NULL)
                        OR (variation_id = '' AND ${variationToSearch} IS NULL)
                    )
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
