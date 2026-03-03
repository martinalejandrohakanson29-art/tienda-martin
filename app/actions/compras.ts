"use server"

import { prisma } from "@/lib/prisma"

export async function obtenerTodosLosArticulos() {
  try {
    const articulos = await prisma.articuloMostrador.findMany({
      orderBy: { nombre: 'asc' }
    });
    return articulos.map(art => ({
      ...art,
      precio: Number(art.precio) // Traemos el precio referencial para mostrar, aunque luego en la compra es "costo"
    }));
  } catch (error) {
    console.error("Error al obtener artículos:", error);
    return [];
  }
}

export async function obtenerComprasPorFecha(fechaStr: string) {
  try {
    const inicioDia = new Date(fechaStr);
    inicioDia.setHours(0, 0, 0, 0);

    const finDia = new Date(fechaStr);
    finDia.setHours(23, 59, 59, 999);

    const compras = await prisma.compra.findMany({
      where: {
        createdAt: {
          gte: inicioDia,
          lte: finDia,
        },
      },
      include: {
        items: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return { 
      success: true, 
      data: compras.map(c => ({
        ...c,
        total: Number(c.total),
        createdAt: c.createdAt.toISOString()
      })) 
    };
  } catch (error) {
    console.error("Error al obtener compras:", error);
    return { success: false, error: "Error al cargar el listado de compras" };
  }
}

export async function crearCompra(data: {
  proveedor: string,
  comprador: string,
  total: number,
  items: any[],
  metodo_pago: string,
  info?: string,
  comprobante?: string,
}) {
  try {
    // Usamos una transacción para garantizar que la compra se cree y el stock se actualice en simultáneo
    await prisma.$transaction(async (tx) => {
      // 1. Crear el registro de la compra
      const compra = await tx.compra.create({
        data: {
          proveedor: data.proveedor,
          comprador: data.comprador,
          total: data.total,
          metodo_pago: data.metodo_pago,
          info: data.info,
          comprobante: data.comprobante,
          items: {
            create: data.items.map(item => ({
              productoId: item.id, 
              nombre: item.nombre,
              cantidad: item.cantidad,
              costo_unit: item.costo_unit,
              subtotal: item.subtotal
            }))
          }
        }
      });

      // 2. IMPACTAR EL STOCK EN LA BASE DE DATOS
      for (const item of data.items) {
        if (item.id) {
          await tx.articuloMostrador.update({
            where: { id: item.id },
            data: {
              stock: { increment: item.cantidad } // Sumanos la cantidad comprada al stock existente
            }
          });
        }
      }
    });

    return { success: true };
  } catch (error) {
    console.error("Error al crear la compra e impactar el stock:", error);
    return { success: false, error: "No se pudo guardar la compra ni actualizar el stock" };
  }
}
