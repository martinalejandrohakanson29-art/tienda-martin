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
        return { success: true, data: etiquetas };
    } catch (error) {
        console.error("Error al obtener etiquetas:", error);
        return { success: false, data: [] };
    }
}
