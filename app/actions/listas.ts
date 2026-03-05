"use server"

import { prisma } from "@/lib/prisma"

// Función para obtener todos los artículos para la vista de listas
export async function obtenerArticulosParaListas() {
  try {
    const articulos = await prisma.articuloMostrador.findMany({
      orderBy: { nombre: 'asc' }
    });
    
    return {
      success: true,
      data: articulos.map(art => ({
        id: art.id,
        nombre: art.nombre,
        precio: Number(art.precio),
        stock: art.stock
      }))
    };
  } catch (error) {
    console.error("Error al obtener artículos para listas:", error);
    return { success: false, error: "No se pudieron cargar los artículos." };
  }
}

// Función para editar un artículo desde la tabla de listas
export async function actualizarArticuloDesdeLista(id: string, nombre: string, precio: number, stock: number) {
  try {
    await prisma.articuloMostrador.update({
      where: { id },
      data: {
        nombre,
        precio,
        stock
      }
    });

    return { success: true };
  } catch (error) {
    console.error("Error al actualizar artículo:", error);
    return { success: false, error: "Ocurrió un error al guardar los cambios." };
  }
}
