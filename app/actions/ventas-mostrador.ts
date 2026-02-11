"use server"

import { prisma } from "@/lib/prisma"

/**
 * Trae todos los artículos del mostrador de una sola vez
 * para cargarlos en la memoria del navegador.
 */
export async function obtenerTodosLosArticulos() {
  try {
    const articulos = await prisma.articuloMostrador.findMany({
      orderBy: {
        nombre: 'asc'
      }
    });
    // Convertimos los campos Decimal a números para que el navegador no tenga problemas
    return articulos.map(art => ({
      ...art,
      precio: Number(art.precio)
    }));
  } catch (error) {
    console.error("Error al obtener artículos:", error);
    return [];
  }
}
