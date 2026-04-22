"use server"

import { prisma } from "@/lib/prisma"
import { s3Client } from "@/lib/s3"
import { 
  S3Client,
  PutObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function obtenerTodosLosArticulos() {
  try {
    const articulos = await prisma.articuloMostrador.findMany({
      orderBy: { nombre: 'asc' },
      include: {
        auditorias: {
          where: { accion: "MODIFICACION_PRECIO_BASE" },
          orderBy: { createdAt: 'desc' }
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
      ultimaModificacion: art.auditorias?.[0]?.createdAt?.toISOString() || null,
      stock: (art.esPack && art.packItems)
              ? (art.packItems.length > 0 ? Math.min(...art.packItems.map(item => Math.floor(item.componente.stock / item.cantidad))) : 0)
              : art.stock,
      packItems: art.packItems?.map(packItem => ({
        ...packItem,
        componente: {
          ...packItem.componente,
          precio: Number(packItem.componente.precio)
        }
      })) || []
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
        tipoVenta: { not: "PEDIDO" },
        createdAt: {
          gte: inicioDia,
          lte: finDia,
        },
      },
      include: {
        items: true,
        puntoVenta: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      success: true,
      data: ventas.map(v => ({
        ...v,
        puntoVenta: v.puntoVenta || null,
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
        tipoVenta: { not: "PEDIDO" },
        createdAt: {
          gte: inicioRango,
          lte: finRango,
        },
      },
      include: {
        items: true,
        puntoVenta: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      success: true,
      data: ventas.map(v => ({
        ...v,
        puntoVenta: v.puntoVenta || null,
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
  eventoOffline?: boolean,
  puntoVentaId?: string
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
          puntoVentaId: data.puntoVentaId || null,
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

// --- Función para guardar como pedido de venta ---
export async function guardarComoPedidoVenta(data: {
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
  eventoOffline?: boolean,
  puntoVentaId?: string
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
          tipoVenta: "PEDIDO", // Marcar como pedido de venta
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
          puntoVentaId: data.puntoVentaId || null,
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

      // --- Descontar stock de los artículos vendidos ---
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
    console.error("Error al guardar como pedido de venta:", error);
    return { success: false, error: "No se pudo guardar el pedido de venta" };
  }
}

// --- FUNCIONES PARA EDICIÓN Y AUDITORÍA ---

export async function actualizarVentaMostrador(ventaId: string, data: any, usuario: string, detalleCambios: string) {
  try {
    await prisma.$transaction(async (tx) => {
      // --- NUEVO: 1. Obtener los items actuales para revertir el stock ---
      const oldItems = await tx.ventaItem.findMany({
        where: { ventaId }
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
        where: { ventaId }
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
          puntoVentaId: data.puntoVentaId || null,
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

export async function eliminarVentaMostrador(ventaId: string, usuario: string) {
  try {
    // Usamos transacción para asegurar que Venta y sus items se eliminen juntos
    await prisma.$transaction(async (tx) => {
      // 1. Obtener los items actuales para registrar en auditoría
      const items = await tx.ventaItem.findMany({
        where: { ventaId }
      });

      // 2. Registrar auditoría de eliminación
      await tx.ventaAuditoria.create({
        data: {
          ventaId: ventaId,
          usuario: usuario,
          accion: "ELIMINACION_VENTA",
          detalle: `Venta eliminada por ${usuario}`
        }
      });

      // 3. Eliminar la venta (esto también eliminará los items relacionados debido a onDelete: Cascade)
      await tx.venta.delete({
        where: { id: ventaId }
      });
    });

    return { success: true };
  } catch (error) {
    console.error("Error al eliminar venta:", error);
    return { success: false, error: "No se pudo eliminar la venta" };
  }
}

// Funciones para pedidos de venta
export async function obtenerPedidosVenta(fechaDesde: string, fechaHasta: string, estadoPedido?: string) {
  try {
    const inicioRango = new Date(fechaDesde);
    inicioRango.setHours(0, 0, 0, 0);

    const finRango = new Date(fechaHasta);
    finRango.setHours(23, 59, 59, 999);

    const where: any = {
      tipoVenta: "PEDIDO",
      createdAt: {
        gte: inicioRango,
        lte: finRango,
      },
    };

    // Agregar filtro por estado si se proporciona
    if (estadoPedido) {
      where.estadoPedido = estadoPedido;
    }

    const ventas = await prisma.venta.findMany({
      where,
      include: {
        items: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return ventas.map(v => ({
      ...v,
      tipoVenta: v.tipoVenta || "PEDIDO",
      total: Number(v.total),
      interes: Number(v.interes),
      totalFinal: Number(v.totalFinal),
      createdAt: v.createdAt.toISOString(),
      dni: v.dni,
      telefono: v.telefono,
      info: v.info,
      cupon: v.cupon,
      transaccionId: v.transaccionId,
      de: v.de,
      para: v.para,
      email: v.email,
      eventoOffline: v.eventoOffline,
      puntoVentaId: v.puntoVentaId,
      items: v.items.map(i => ({
        ...i,
        productoId: i.productoId || null,
        precio_unit: Number(i.precio_unit),
        subtotal: Number(i.subtotal)
      }))
    }));
  } catch (error) {
    console.error("Error al obtener pedidos de venta:", error);
    return [];
  }
}

// Función para obtener un pedido por ID para editar
export async function obtenerPedidoPorId(ventaId: string) {
  try {
    const venta = await prisma.venta.findUnique({
      where: { id: ventaId },
      include: {
        items: true,
      },
    });

    if (!venta) {
      throw new Error("Pedido no encontrado");
    }

    return {
      ...venta,
      tipoVenta: venta.tipoVenta || "PEDIDO",
      total: Number(venta.total),
      interes: Number(venta.interes),
      totalFinal: Number(venta.totalFinal),
      createdAt: venta.createdAt.toISOString(),
      dni: venta.dni,
      telefono: venta.telefono,
      info: venta.info,
      cupon: venta.cupon,
      transaccionId: venta.transaccionId,
      de: venta.de,
      para: venta.para,
      email: venta.email,
      eventoOffline: venta.eventoOffline,
      puntoVentaId: venta.puntoVentaId,
      items: venta.items.map(i => ({
        ...i,
        productoId: i.productoId || null,
        precio_unit: Number(i.precio_unit),
        subtotal: Number(i.subtotal)
      }))
    };
  } catch (error) {
    console.error("Error al obtener pedido por ID:", error);
    return null;
  }
}

export async function actualizarEstadoPedido(ventaId: string, estadoPedido: string) {
  try {
    await prisma.venta.update({
      where: { id: ventaId },
      data: { estadoPedido }
    });
    return { success: true };
  } catch (error) {
    console.error("Error al actualizar estado del pedido:", error);
    return { success: false, error: "No se pudo actualizar el estado del pedido" };
  }
}

// Función para actualizar un pedido de venta
export async function actualizarPedidoVenta(ventaId: string, data: any, usuario: string, detalleCambios: string) {
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Obtener los items actuales para revertir el stock
      const oldItems = await tx.ventaItem.findMany({
        where: { ventaId }
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
        where: { ventaId }
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
          puntoVentaId: data.puntoVentaId || null,
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

      // 4. Descontar el stock de los nuevos items
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
          accion: "EDICION_PEDIDO_VENTA",
          detalle: detalleCambios
        }
      });
    });

    return { success: true };
  } catch (error) {
    console.error("Error al actualizar pedido de venta:", error);
    return { success: false, error: "No se pudo actualizar el pedido de venta" };
  }
}

export async function confirmarPedidoVenta(ventaId: string) {
  try {
    await prisma.venta.update({
      where: { id: ventaId },
      data: { tipoVenta: "CONFIRMADA" }
    });

    return { success: true };
  } catch (error) {
    console.error("Error al confirmar pedido de venta:", error);
    return { success: false, error: "No se pudo confirmar el pedido de venta" };
  }
}

export async function eliminarPedidoVenta(ventaId: string) {
  try {
    await prisma.venta.delete({
      where: { id: ventaId }
    });

    return { success: true };
  } catch (error) {
    console.error("Error al eliminar pedido de venta:", error);
    return { success: false, error: "No se pudo eliminar el pedido de venta" };
  }
}

export async function subirPDFPedido(ventaId: string, formData: FormData) {
  const file = formData.get('file') as File;
  if (!file) return { success: false, error: "No se proporcionó ningún archivo" };

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    // Limpiar nombre de archivo para evitar problemas en URL
    const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `pedidos/${ventaId}/${safeFileName}`;
    
    const bucketName = process.env.S3_BUCKET_NAME;
    if (!bucketName) {
      throw new Error("S3_BUCKET_NAME no está configurado en el archivo .env");
    }

    // Intentar verificar si el bucket existe, si no, intentar crearlo
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
    } catch (headError: any) {
      if (headError.name === "NotFound" || headError.$metadata?.httpStatusCode === 404) {
        try {
          await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
        } catch (createError) {
          console.error("Error al crear el bucket:", createError);
          // Continuamos de todos modos por si el HeadBucket falló por otra razón
        }
      }
    }

    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    }));

    const baseUrl = process.env.GARAGE_S3_API_URL || process.env.S3_ENDPOINT;
    const cleanBaseUrl = baseUrl?.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const pdfUrl = `${cleanBaseUrl}/${bucketName}/${key}`;

    await prisma.venta.update({
      where: { id: ventaId },
      data: { pdfUrl }
    });

    return { success: true, url: pdfUrl };
  } catch (error) {
    console.error("Error al subir PDF:", error);
    return { success: false, error: "Error al subir el archivo a S3" };
  }
}

export async function obtenerURLDescargaPDF(ventaId: string) {
  try {
    const venta = await prisma.venta.findUnique({
      where: { id: ventaId },
      select: { pdfUrl: true }
    });

    if (!venta || !venta.pdfUrl) {
      throw new Error("El pedido no tiene un PDF asociado");
    }

    const bucketName = process.env.S3_BUCKET_NAME?.trim();
    if (!bucketName) {
      throw new Error("S3_BUCKET_NAME no configurado");
    }

    let key = "";
    try {
      const url = new URL(venta.pdfUrl);
      const pathname = url.pathname;
      
      // Intentar extraer el key asumiendo path-style: /bucket/key
      if (pathname.includes(`/${bucketName}/`)) {
        key = pathname.split(`/${bucketName}/`)[1];
      } else if (pathname.includes(bucketName)) {
        // Caso borde: si está el bucket pero no rodeado de slashes exactamente como esperamos
        const parts = pathname.split(bucketName);
        key = parts[parts.length - 1];
        if (key.startsWith('/')) key = key.substring(1);
      } else {
        // Si no está el bucket en el path, tal vez el pathname es el key (virtual-host style)
        key = pathname.startsWith('/') ? pathname.substring(1) : pathname;
      }
    } catch (e) {
      // Fallback manual si falla URL constructor o la lógica anterior
      const parts = venta.pdfUrl.split(`/${bucketName}/`);
      if (parts.length >= 2) {
        key = parts[1];
      } else {
        // Último recurso: buscar la carpeta raíz de los archivos
        const searchPath = "pedidos/";
        const index = venta.pdfUrl.indexOf(searchPath);
        if (index !== -1) {
          key = venta.pdfUrl.substring(index);
        } else {
          console.error("Error detallado - URL:", venta.pdfUrl, "Bucket:", bucketName);
          throw new Error("No se pudo determinar el Key del archivo S3");
        }
      }
    }

    // Limpieza final de la key (asegurar que no empiece con /)
    if (key.startsWith('/')) key = key.substring(1);

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    // Generar URL firmada válida por 1 hora (3600 segundos)
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return { success: true, url: signedUrl };
  } catch (error: any) {
    console.error("Error al generar URL firmada:", error);
    return { success: false, error: error.message || "No se pudo generar el enlace de descarga" };
  }
}
