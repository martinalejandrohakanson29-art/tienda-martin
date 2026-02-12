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

// Función para obtener ventas por fecha con sus ítems
export async function obtenerVentasPorFecha(fechaStr: string) {
  try {
    const inicioDia = new Date(fechaStr);
    inicioDia.setHours(0, 0, 0, 0);

    const finDia = new Date(fechaStr);
    finDia.setHours(23, 59, 59, 999);

    const ventas = await prisma.venta.findMany({
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
      data: ventas.map(v => ({
        ...v,
        total: Number(v.total),
        createdAt: v.createdAt.toISOString()
      })) 
    };
  } catch (error) {
    console.error("Error al obtener ventas:", error);
    return { success: false, error: "Error al cargar el listado" };
  }
}

export async function crearVentaMostrador(data: {
  cliente: string,
  vendedor: string,
  total: number,
  items: any[],
  metodo_pago: string,
  dni?: string,
  telefono?: string,
  info?: string,
  cupon?: string,
  transaccionId?: string,
  de?: string,
  para?: string
}) {
  try {
    const venta = await prisma.venta.create({
      data: {
        cliente: data.cliente,
        vendedor: data.vendedor,
        total: data.total,
        metodo_pago: data.metodo_pago,
        dni: data.dni,
        telefono: data.telefono,
        info: data.info,
        cupon: data.cupon,
        transaccionId: data.transaccionId,
        de: data.de,
        para: data.para,
        items: {
          create: data.items.map(item => ({
            productoId: item.id, 
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
