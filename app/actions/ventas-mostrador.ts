"use server"

import { prisma } from "@/lib/prisma"

export async function obtenerTodosLosArticulos() {
  try {
    const articulos = await prisma.articuloMostrador.findMany({
      orderBy: { nombre: 'asc' },
      include: {
        auditorias: {
          where: { accion: "MODIFICACION_PRECIO_BASE" },
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        packItems: {
          include: {
            componente: true
          }
        }
      }
    });
    
    return articulos.map(art => ({
      ...art,
      precio: Number(art.precio),
      esPack: art.esPack || false,
      ultimaModificacion: art.auditorias && art.auditorias.length > 0 ? art.auditorias[0].createdAt.toISOString() : null,
      stock: (art.esPack && art.packItems)
              ? (art.packItems.length > 0 ? Math.min(...art.packItems.map(item => Math.floor(item.componente.stock / item.cantidad))) : 0)
              : art.stock
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
        createdAt: v.createdAt.toISOString(),
        items: v.items.map(i => ({
          ...i,
          precio_unit: Number(i.precio_unit),
          subtotal: Number(i.subtotal)
        }))
      }))
    };
  } catch (error) {
    console.error("Error al obtener ventas:", error);
    return { success: false, error: "Error al cargar el listado" };
  }
}

export async function obtenerVentasPorRango(fechaDesde: string, fechaHasta: string) {
  try {
    const inicioRango = new Date(fechaDesde);
    inicioRango.setHours(0, 0, 0, 0);

    const finRango = new Date(fechaHasta);
    finRango.setHours(23, 59, 59, 999);

    const ventas = await prisma.venta.findMany({
      where: {
        createdAt: {
          gte: inicioRango,
          lte: finRango,
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
        createdAt: v.createdAt.toISOString(),
        items: v.items.map(i => ({
          ...i,
          precio_unit: Number(i.precio_unit),
          subtotal: Number(i.subtotal)
        }))
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
    // Usamos transacción para asegurar que Venta y Stock se actualicen juntos
    const result = await prisma.$transaction(async (tx) => {
      const venta = await tx.venta.create({
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

      // --- NUEVO: Descontar stock de los artículos vendidos ---
      for (const item of data.items) {
        const articuloBase = await tx.articuloMostrador.findUnique({
          where: { id: item.id },
          include: { packItems: true }
        });

        if (articuloBase?.esPack && articuloBase.packItems.length > 0) {
          for (const packItem of articuloBase.packItems) {
            await tx.articuloMostrador.updateMany({
              where: { id: packItem.componenteId },
              data: { stock: { decrement: packItem.cantidad * item.cantidad } }
            });
          }
        } else {
          await tx.articuloMostrador.updateMany({
            where: { id: item.id },
            data: {
              stock: {
                decrement: item.cantidad
              }
            }
          });
        }
      }

      return venta;
    });

    return { success: true, id: result.id };
  } catch (error) {
    console.error("Error al crear venta:", error);
    return { success: false, error: "No se pudo guardar la venta" };
  }
}

// --- FUNCIONES PARA EDICIÓN Y AUDITORÍA ---

export async function actualizarVentaMostrador(ventaId: string, data: any, usuario: string, detalleCambios: string) {
  try {
    await prisma.$transaction(async (tx) => {
      // --- NUEVO: 1. Obtener los items actuales para revertir el stock ---
      const oldItems = await tx.ventaItem.findMany({
        where: { ventaId: ventaId }
      });

      // Revertir el stock (sumar lo que se había restado originalmente)
      for (const oldItem of oldItems) {
        if (oldItem.productoId) {
          const articuloBase = await tx.articuloMostrador.findUnique({
            where: { id: oldItem.productoId },
            include: { packItems: true }
          });
          if (articuloBase?.esPack && articuloBase.packItems.length > 0) {
            for (const packItem of articuloBase.packItems) {
              await tx.articuloMostrador.updateMany({
                where: { id: packItem.componenteId },
                data: { stock: { increment: packItem.cantidad * oldItem.cantidad } }
              });
            }
          } else {
            await tx.articuloMostrador.updateMany({
              where: { id: oldItem.productoId },
              data: { stock: { increment: oldItem.cantidad } }
            });
          }
        }
      }

      // 2. Borramos los items actuales para reemplazarlos limpios por los nuevos
      await tx.ventaItem.deleteMany({
        where: { ventaId: ventaId }
      });

      // 3. Actualizamos la venta y creamos los nuevos items
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

      // --- NUEVO: 4. Descontar el stock de los nuevos items ---
      for (const newItem of data.items) {
        const articuloBase = await tx.articuloMostrador.findUnique({
          where: { id: newItem.id },
          include: { packItems: true }
        });
        if (articuloBase?.esPack && articuloBase.packItems.length > 0) {
          for (const packItem of articuloBase.packItems) {
            await tx.articuloMostrador.updateMany({
              where: { id: packItem.componenteId },
              data: { stock: { decrement: packItem.cantidad * newItem.cantidad } }
            });
          }
        } else {
          await tx.articuloMostrador.updateMany({
            where: { id: newItem.id },
            data: { stock: { decrement: newItem.cantidad } }
          });
        }
      }

      // 5. Dejamos el registro de qué se cambió
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

// --- NUEVO: ACTUALIZAR PRECIO BASE DEL ARTÍCULO ---

export async function actualizarPrecioArticuloDB(articuloId: string, nuevoPrecio: number, usuario: string) {
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Buscamos el artículo para saber el precio anterior
      const articulo = await tx.articuloMostrador.findUnique({
        where: { id: articuloId }
      });

      if (!articulo) {
        throw new Error("El artículo no existe en la base de datos.");
      }

      const precioAnterior = Number(articulo.precio);

      // 2. Modificamos el precio
      await tx.articuloMostrador.update({
        where: { id: articuloId },
        data: {
          precio: nuevoPrecio
        }
      });

      // 3. Dejamos registro en la tabla de auditoría del artículo
      await tx.articuloAuditoria.create({
        data: {
          articuloId: articuloId,
          usuario: usuario,
          accion: "MODIFICACION_PRECIO_BASE",
          detalle: `Se cambió el precio de $${precioAnterior.toLocaleString('es-AR')} a $${nuevoPrecio.toLocaleString('es-AR')}`
        }
      });
    });

    return { success: true };
  } catch (error: any) {
    console.error("Error al actualizar precio base:", error);
    return { success: false, error: error.message || "Error al conectar con la base de datos" };
  }
}

/**
 * Sincroniza los artículos del mostrador con la base de datos
 * Esta función debe usarse antes de abrir el modal de edición para asegurar
 * que los precios iniciales sean correctos
 */
export async function sincronizarArticulosMostrador() {
  try {
    const articulos = await prisma.articuloMostrador.findMany({
      select: {
        id: true,
        nombre: true,
        precio: true,
        stock: true,
        esPack: true,
        packItems: { include: { componente: { select: { stock: true } } } }
      }
    });

    // Convertir Decimal a number para compatibilidad con el tipo Articulo
    const articulosConverted = articulos.map(art => ({
      id: art.id,
      nombre: art.nombre,
      precio: Number(art.precio),
      esPack: art.esPack || false,
      stock: (art.esPack && art.packItems)
              ? (art.packItems.length > 0 ? Math.min(...art.packItems.map(item => Math.floor(item.componente.stock / item.cantidad))) : 0)
              : art.stock
    }));

    return { success: true, data: articulosConverted };
  } catch (error) {
    console.error("Error al sincronizar artículos:", error);
    return { success: false, error: "No se pudo sincronizar los artículos" };
  }
}

export async function crearPackMostrador(data: { id: string, nombre: string, precio: number, componentes: { id: string, cantidad: number }[] }) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const pack = await tx.articuloMostrador.create({
        data: {
          id: data.id,
          nombre: data.nombre,
          precio: data.precio,
          esPack: true,
          stock: 0,
        }
      });
      
      if (data.componentes && data.componentes.length > 0) {
        await tx.packMostradorItem.createMany({
          data: data.componentes.map(c => ({
            packId: pack.id,
            componenteId: c.id,
            cantidad: c.cantidad
          }))
        });
      }
      return pack;
    });
    return { success: true, data: result };
  } catch (error) {
    console.error("Error al crear pack:", error);
    return { success: false, error: "No se pudo crear el pack" };
  }
}
