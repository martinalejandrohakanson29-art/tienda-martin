"use server"

import { prisma } from "@/lib/prisma"

export async function obtenerTodosLosArticulos() {
  try {
    const articulos = await prisma.articuloMostrador.findMany({
      orderBy: { nombre: 'asc' }
    });
    return articulos.map(art => ({
      ...art,
      precio: Number(art.precio)
    }));
  } catch (error) {
    console.error("Error al obtener artículos:", error);
    return [];
  }
}

export async function crearVentaMostrador(data: {
  cliente: string,
  vendedor: string,
  total: number,
  items: any[]
}) {
  try {
    const venta = await prisma.venta.create({
      data: {
        cliente: data.cliente,
        vendedor: data.vendedor,
        total: data.total,
        metodo_pago: "Efectivo",
        items: {
          create: data.items.map(item => ({
            nombre: item.nombre,
            cantidad: item.cantidad,
            precio_unit: item.precio_unit,
            subtotal: item.subtotal
          }))
        }
      }
    });

    return { success: true, id: venta.id };
  } catch (error) {
    console.error("Error al crear venta:", error);
    return { success: false, error: "No se pudo guardar la venta" };
  }
}
