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
        // Usamos Promise.all para procesar todo en paralelo y ser más rápidos
        const etiquetasEnriquecidas = await Promise.all(etiquetas.map(async (envio) => {
            const itemsConAgregados = await Promise.all(envio.items.map(async (item) => {
                // Buscamos en la vista usando mla y variation_id
                // variation_id en la vista corresponde a item.variation en nuestra tabla
                const datosVista: any[] = await prisma.$queryRaw`
                    SELECT titulo, ids_articulos 
                    FROM vista_costos_productos 
                    WHERE mla = ${item.mla} 
                    AND (variation_id = ${item.variation} OR variation_id IS NULL AND ${item.variation} IS NULL)
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
