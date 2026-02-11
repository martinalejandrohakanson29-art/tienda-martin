"use server"

import { prisma } from "@/lib/prisma"

// Función para buscar productos en nuestra nueva tabla
export async function buscarArticulosMostrador(query: string) {
  if (!query || query.length < 2) return [];

  try {
    const resultados = await prisma.articuloMostrador.findMany({
      where: {
        OR: [
          { nombre: { contains: query, mode: 'insensitive' } }, // Busca por nombre (ignora mayúsculas)
          { id: { contains: query, mode: 'insensitive' } }      // También busca por el ID de tu Sheet
        ]
      },
      take: 10 // Solo traemos los primeros 10 para que sea ultra rápido
    });

    return resultados;
  } catch (error) {
    console.error("Error buscando artículos:", error);
    return [];
  }
}
