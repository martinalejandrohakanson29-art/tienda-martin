"use server"

import { prisma } from "@/lib/prisma"

/**
 * Función para buscar productos de forma flexible.
 * Ahora separa las palabras y permite encontrarlas en cualquier orden.
 */
export async function buscarArticulosMostrador(query: string) {
  // Si no hay texto o es muy corto, no buscamos nada para ahorrar recursos
  if (!query || query.trim().length < 2) return [];

  // 1. Limpiamos espacios de más y dividimos la búsqueda en palabras individuales
  // Ejemplo: "leva varillero" -> ["leva", "varillero"]
  const palabras = query.trim().split(/\s+/).filter(p => p.length > 0);

  try {
    const resultados = await prisma.articuloMostrador.findMany({
      where: {
        // 2. Usamos AND para que TODAS las palabras que escribas deban estar presentes
        AND: palabras.map(palabra => ({
          OR: [
            // Que la palabra esté en el nombre (ej: "leva" coincide con "elevador")
            { nombre: { contains: palabra, mode: 'insensitive' } },
            // O que la palabra esté en el ID (por si buscás por código)
            { id: { contains: palabra, mode: 'insensitive' } }
          ]
        }))
      },
      // Traemos 15 resultados para darte un poco más de margen visual
      take: 15 
    });

    return resultados;
  } catch (error) {
    console.error("Error en la búsqueda flexible:", error);
    return [];
  }
}
