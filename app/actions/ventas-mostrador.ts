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
        interes: Number(v.interes),
        totalFinal: Number(v.totalFinal),
        createdAt: v.createdAt.toISOString()
      })) 
    };
  } catch (error) {
    console.error("Error al obtener ventas:", error);
    return { success: false, error: "Error al cargar el listado" };
  }
}

export async function marcarVentaComoRegistrada(id: string) {
  try {
    await prisma.venta.update({
      where: { id },
      data: { registrada: true }
    });
    return { success: true };
  } catch (error) {
    console.error("Error al marcar venta:", error);
    return { success: false, error: "No se pudo actualizar la venta" };
  }
}

export async function crearVentaMostrador(data: {
  cliente: string,
  vendedor: string,
  total: number,
  interes: number,
  totalFinal: number,
  items: any[],
  metodo_pago: string,
  dni?: string,
  telefono?: string,
  info?: string,
  cupon?: string,
  transaccionId?: string,
  de?: string,
  para?: string,
  email?: string,
  eventoOffline?: boolean
}) {
  try {
    const venta = await prisma.venta.create({
      data: {
        cliente: data.cliente,
        vendedor: data.vendedor,
        total: data.total,
        interes: data.interes,
        totalFinal: data.totalFinal,
        metodo_pago: data.metodo_pago,
        dni: data.dni,
        telefono: data.telefono,
        info: data.info,
        cupon: data.cupon,
        transaccionId: data.transaccionId,
        de: data.de,
        para: data.para,
        email: data.email,
        eventoOffline: data.eventoOffline ?? false,
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

// --- NUEVAS FUNCIONES PARA EDICIÓN Y AUDITORÍA ---

export async function actualizarVentaMostrador(ventaId: string, data: any, usuario: string, detalleCambios: string) {
  try {
    // Usamos una transacción para asegurar que si algo falla, no se guarde a medias
    await prisma.$transaction(async (tx) => {
      // 1. Borramos los items actuales para reemplazarlos limpios por los nuevos
      await tx.ventaItem.deleteMany({
        where: { ventaId: ventaId }
      });

      // 2. Actualizamos la venta y creamos los nuevos items
      await tx.venta.update({
        where: { id: ventaId },
        data: {
          cliente: data.cliente,
          total: data.total,
          interes: data.interes,
          totalFinal: data.totalFinal,
          metodo_pago: data.metodo_pago,
          dni: data.dni,
          telefono: data.telefono,
          info: data.info,
          cupon: data.cupon,
          transaccionId: data.transaccionId,
          de: data.de,
          para: data.para,
          email: data.email,
          eventoOffline: data.eventoOffline,
          items: {
            create: data.items.map((item: any) => ({
              productoId: item.id, 
              nombre: item.nombre,
              cantidad: item.cantidad,
              precio_unit: item.precio_unit,
              subtotal: item.subtotal
            }))
          }
        }
      });

      // 3. Dejamos el registro de qué se cambió
      await tx.ventaAuditoria.create({
        data: {
          ventaId: ventaId,
          usuario: usuario,
          accion: "EDICION_VENTA",
          detalle: detalleCambios
        }
      });
    });

    return { success: true };
  } catch (error) {
    console.error("Error al actualizar venta:", error);
    return { success: false, error: "No se pudo modificar la venta" };
  }
}

export async function obtenerHistorialVenta(ventaId: string) {
  try {
    const historial = await prisma.ventaAuditoria.findMany({
      where: { ventaId: ventaId },
      orderBy: { createdAt: 'desc' }
    });
    return { success: true, data: historial };
  } catch (error) {
    console.error("Error al obtener historial:", error);
    return { success: false, error: "No se pudo cargar el historial" };
  }
}
