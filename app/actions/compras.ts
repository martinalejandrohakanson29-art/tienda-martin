"use server"

import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

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

export async function obtenerComprasPorRango(fechaDesde: string, fechaHasta: string) {
  try {
    const inicioRango = new Date(fechaDesde);
    inicioRango.setHours(0, 0, 0, 0);

    const finRango = new Date(fechaHasta);
    finRango.setHours(23, 59, 59, 999);

    const compras = await prisma.compra.findMany({
      where: {
        tipoCompra: { not: "PEDIDO" },
        createdAt: {
          gte: inicioRango,
          lte: finRango,
        },
      },
      include: {
        items: true,
        proveedorRel: true,
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
        interes: Number(c.interes),
        descuento: Number(c.descuento),
        totalFinal: Number(c.totalFinal),
        createdAt: c.createdAt.toISOString(),
        items: c.items.map(i => ({
          ...i,
          costo_unit: Number(i.costo_unit),
          subtotal: Number(i.subtotal)
        }))
      }))
    };
  } catch (error) {
    console.error("Error al obtener compras:", error);
    return { success: false, error: "Error al cargar el listado" };
  }
}

export async function obtenerPedidosCompra(fechaDesde: string, fechaHasta: string, estadoPedido?: string) {
  try {
    const inicioRango = new Date(fechaDesde);
    inicioRango.setHours(0, 0, 0, 0);

    const finRango = new Date(fechaHasta);
    finRango.setHours(23, 59, 59, 999);

    const where: any = {
      tipoCompra: "PEDIDO",
      createdAt: {
        gte: inicioRango,
        lte: finRango,
      },
    };

    if (estadoPedido) {
      where.estadoPedido = estadoPedido;
    }

    const compras = await prisma.compra.findMany({
      where,
      include: {
        items: true,
        proveedorRel: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return compras.map(c => ({
      ...c,
      tipoCompra: c.tipoCompra || "PEDIDO",
      total: Number(c.total),
      interes: Number(c.interes),
      descuento: Number(c.descuento),
      totalFinal: Number(c.totalFinal),
      createdAt: c.createdAt.toISOString(),
      items: c.items.map(i => ({
        ...i,
        productoId: i.productoId || null,
        costo_unit: Number(i.costo_unit),
        subtotal: Number(i.subtotal)
      }))
    }));
  } catch (error) {
    console.error("Error al obtener pedidos de compra:", error);
    return [];
  }
}

export async function obtenerPedidoCompraPorId(compraId: string) {
  try {
    const compra = await prisma.compra.findUnique({
      where: { id: compraId },
      include: {
        items: true,
      },
    });

    if (!compra) return null;

    return {
      ...compra,
      tipoCompra: compra.tipoCompra || "PEDIDO",
      total: Number(compra.total),
      interes: Number(compra.interes),
      descuento: Number(compra.descuento),
      totalFinal: Number(compra.totalFinal),
      createdAt: compra.createdAt.toISOString(),
      items: compra.items.map(i => ({
        ...i,
        productoId: i.productoId || null,
        costo_unit: Number(i.costo_unit),
        subtotal: Number(i.subtotal)
      }))
    };
  } catch (error) {
    console.error("Error al obtener pedido de compra por ID:", error);
    return null;
  }
}

export async function guardarComoPedidoCompra(data: {
  proveedor: string,
  comprador: string,
  total: number,
  interes: number,
  descuento: number,
  totalFinal: number,
  items: any[],
  metodo_pago: string,
  dni?: string,
  telefono?: string,
  info?: string,
  comprobante?: string,
  transaccionId?: string,
  proveedorId?: string,
  impactarCostos?: boolean
}) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const compra = await tx.compra.create({
        data: {
          proveedor: data.proveedor,
          comprador: data.comprador,
          total: data.total,
          interes: data.interes,
          descuento: data.descuento,
          totalFinal: data.totalFinal,
          tipoCompra: "PEDIDO",
          metodo_pago: data.metodo_pago,
          dni: data.dni,
          telefono: data.telefono,
          info: data.info,
          comprobante: data.comprobante,
          transaccionId: data.transaccionId,
          proveedorId: data.proveedorId || null,
          items: {
            create: data.items.map(item => ({
              productoId: item.productoId || item.id,
              nombre: item.nombre,
              cantidad: item.cantidad,
              costo_unit: item.costo_unit,
              subtotal: item.subtotal
            }))
          }
        }
      });

      // Incrementar stock y opcionalmente actualizar costos
      for (const item of data.items) {
        const prodId = item.productoId || item.id;
        if (!prodId) continue;
 
        const articuloBase = await tx.articuloMostrador.findUnique({
          where: { id: prodId },
          include: { packItems: true }
        });
 
        if (articuloBase?.esPack && articuloBase.packItems.length > 0) {
          for (const packItem of articuloBase.packItems) {
            await tx.articuloMostrador.update({
              where: { id: packItem.componenteId },
              data: { stock: { increment: packItem.cantidad * item.cantidad } }
            });
          }
        } else {
          const updateData: any = { stock: { increment: item.cantidad } };
          if (data.impactarCostos) {
            updateData.precio = item.costo_unit;
          }
 
          await tx.articuloMostrador.update({
            where: { id: prodId },
            data: updateData
          });
 
          if (data.impactarCostos && articuloBase) {
            await tx.articuloAuditoria.create({
              data: {
                articuloId: prodId,
                usuario: data.comprador,
                accion: "MODIFICACION_PRECIO_BASE",
                detalle: `Actualizado por Pedido de Compra #${compra.numeroCompra}. De $${Number(articuloBase.precio).toLocaleString('es-AR')} a $${Number(item.costo_unit).toLocaleString('es-AR')}`
              }
            });
          }
        }
      }

      return compra;
    });

    return { success: true, id: result.id, numeroCompra: result.numeroCompra };
  } catch (error) {
    console.error("Error al guardar pedido de compra:", error);
    return { success: false, error: "No se pudo guardar el pedido de compra" };
  }
}

export async function confirmarPedidoCompra(compraId: string) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const compra = await tx.compra.update({
        where: { id: compraId },
        data: { tipoCompra: "CONFIRMADA" }
      });

      // Impactar en cuenta corriente del proveedor si corresponde
      if ((compra.metodo_pago === "A Cuenta Corriente") && (compra.proveedorId || compra.proveedor)) {
        const idBuscado = compra.proveedorId || compra.proveedor;
        
        let proveedor = await tx.proveedor.findUnique({
          where: { id: idBuscado || "" }
        }).catch(() => null);

        if (!proveedor) {
          proveedor = await tx.proveedor.findFirst({
            where: { razonSocial: compra.proveedor || "" }
          });
        }

        if (proveedor) {
          const montoDecimal = new Prisma.Decimal(compra.totalFinal);
          const nuevoSaldo = proveedor.total.minus(montoDecimal);

          await tx.proveedor.update({
            where: { id: proveedor.id },
            data: { total: nuevoSaldo }
          });

          await tx.movimientoProveedor.create({
            data: {
              proveedorId: proveedor.id,
              tipo: "DEBE",
              monto: montoDecimal.negated(),
              descripcion: `Compra a CC #${compra.numeroCompra} - Confirmación Pedido`,
              referencia: compra.id,
              saldo: nuevoSaldo
            }
          });
        }
      }

      return compra;
    });

    return { success: true, id: result.id, numeroCompra: result.numeroCompra };
  } catch (error) {
    console.error("Error al confirmar pedido de compra:", error);
    return { success: false, error: "No se pudo confirmar el pedido de compra" };
  }
}

export async function actualizarEstadoPedidoCompra(compraId: string, estadoPedido: string) {
  try {
    await prisma.compra.update({
      where: { id: compraId },
      data: { estadoPedido }
    });
    return { success: true };
  } catch (error) {
    console.error("Error al actualizar estado del pedido de compra:", error);
    return { success: false, error: "No se pudo actualizar el estado" };
  }
}

export async function actualizarPedidoCompra(compraId: string, data: any, usuario: string, detalleCambios: string) {
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Revertir stock de los items anteriores
      const oldItems = await tx.compraItem.findMany({
        where: { compraId }
      });

      for (const oldItem of oldItems) {
        if (oldItem.productoId) {
          const articuloBase = await tx.articuloMostrador.findUnique({
            where: { id: oldItem.productoId },
            include: { packItems: true }
          });
          if (articuloBase?.esPack && articuloBase.packItems.length > 0) {
            for (const packItem of articuloBase.packItems) {
              await tx.articuloMostrador.update({
                where: { id: packItem.componenteId },
                data: { stock: { decrement: packItem.cantidad * oldItem.cantidad } }
              });
            }
          } else {
            await tx.articuloMostrador.update({
              where: { id: oldItem.productoId },
              data: { stock: { decrement: oldItem.cantidad } }
            });
          }
        }
      }

      // 2. Borrar items viejos
      await tx.compraItem.deleteMany({
        where: { compraId }
      });

      // 3. Actualizar compra y crear nuevos items
      await tx.compra.update({
        where: { id: compraId },
        data: {
          proveedor: data.proveedor,
          comprador: usuario,
          total: data.total,
          interes: data.interes,
          descuento: data.descuento,
          totalFinal: data.totalFinal,
          metodo_pago: data.metodo_pago,
          dni: data.dni,
          telefono: data.telefono,
          info: data.info,
          comprobante: data.comprobante,
          transaccionId: data.transaccionId,
          proveedorId: data.proveedorId || null,
          items: {
            create: data.items.map((item: any) => ({
              productoId: item.productoId || item.id,
              nombre: item.nombre,
              cantidad: item.cantidad,
              costo_unit: item.costo_unit,
              subtotal: item.subtotal
            }))
          }
        }
      });

      // 4. Incrementar stock de los nuevos items
      for (const newItem of data.items) {
        const prodId = newItem.productoId || newItem.id;
        if (!prodId) continue;
        const articuloBase = await tx.articuloMostrador.findUnique({
          where: { id: prodId },
          include: { packItems: true }
        });
        if (articuloBase?.esPack && articuloBase.packItems.length > 0) {
          for (const packItem of articuloBase.packItems) {
            await tx.articuloMostrador.update({
              where: { id: packItem.componenteId },
              data: { stock: { increment: packItem.cantidad * newItem.cantidad } }
            });
          }
        } else {
          await tx.articuloMostrador.update({
            where: { id: prodId },
            data: { stock: { increment: newItem.cantidad } }
          });
        }
      }

      // 5. Auditoria
      await tx.compraAuditoria.create({
        data: {
          compraId: compraId,
          usuario: usuario,
          accion: "EDICION_PEDIDO_COMPRA",
          detalle: detalleCambios
        }
      });
    });

    return { success: true };
  } catch (error) {
    console.error("Error al actualizar pedido de compra:", error);
    return { success: false, error: "No se pudo actualizar el pedido de compra" };
  }
}

export async function eliminarPedidoCompra(compraId: string) {
  try {
    await prisma.$transaction(async (tx) => {
      const compra = await tx.compra.findUnique({
        where: { id: compraId },
        include: { items: true }
      });

      if (!compra) throw new Error("Pedido no encontrado");

      // Revertir stock
      for (const item of compra.items) {
        if (item.productoId) {
          const articuloBase = await tx.articuloMostrador.findUnique({
            where: { id: item.productoId },
            include: { packItems: true }
          });
          if (articuloBase?.esPack && articuloBase.packItems.length > 0) {
            for (const packItem of articuloBase.packItems) {
              await tx.articuloMostrador.update({
                where: { id: packItem.componenteId },
                data: { stock: { decrement: packItem.cantidad * item.cantidad } }
              });
            }
          } else {
            await tx.articuloMostrador.update({
              where: { id: item.productoId },
              data: { stock: { decrement: item.cantidad } }
            });
          }
        }
      }

      await tx.compra.delete({
        where: { id: compraId }
      });
    });

    return { success: true };
  } catch (error) {
    console.error("Error al eliminar pedido de compra:", error);
    return { success: false, error: "No se pudo eliminar el pedido de compra" };
  }
}

export async function crearCompra(data: {
  proveedor: string,
  comprador: string,
  total: number,
  interes: number,
  descuento: number,
  totalFinal: number,
  items: any[],
  metodo_pago: string,
  dni?: string,
  telefono?: string,
  info?: string,
  comprobante?: string,
  transaccionId?: string,
  proveedorId?: string,
  impactarCostos?: boolean
}) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Crear la compra
      const compra = await tx.compra.create({
        data: {
          proveedor: data.proveedor,
          comprador: data.comprador,
          total: data.total,
          interes: data.interes,
          descuento: data.descuento,
          totalFinal: data.totalFinal,
          metodo_pago: data.metodo_pago,
          dni: data.dni,
          telefono: data.telefono,
          info: data.info,
          comprobante: data.comprobante,
          transaccionId: data.transaccionId,
          proveedorId: data.proveedorId || null,
          items: {
            create: data.items.map(item => ({
              productoId: item.productoId || item.id, 
              nombre: item.nombre,
              cantidad: item.cantidad,
              costo_unit: item.costo_unit,
              subtotal: item.subtotal
            }))
          }
        }
      });

      // 2. Incrementar stock (es una compra) y opcionalmente actualizar costos
      for (const item of data.items) {
        const prodId = item.productoId || item.id;
        if (!prodId) continue;
 
        const articuloBase = await tx.articuloMostrador.findUnique({
          where: { id: prodId },
          include: { packItems: true }
        });
 
        if (articuloBase?.esPack && articuloBase.packItems.length > 0) {
          for (const packItem of articuloBase.packItems) {
            await tx.articuloMostrador.update({
              where: { id: packItem.componenteId },
              data: { stock: { increment: packItem.cantidad * item.cantidad } }
            });
          }
        } else {
          const updateData: any = { stock: { increment: item.cantidad } };
          if (data.impactarCostos) {
            updateData.precio = item.costo_unit;
          }
 
          await tx.articuloMostrador.update({
            where: { id: prodId },
            data: updateData
          });
 
          if (data.impactarCostos && articuloBase) {
            await tx.articuloAuditoria.create({
              data: {
                articuloId: prodId,
                usuario: data.comprador,
                accion: "MODIFICACION_PRECIO_BASE",
                detalle: `Actualizado por Compra #${compra.numeroCompra}. De $${Number(articuloBase.precio).toLocaleString('es-AR')} a $${Number(item.costo_unit).toLocaleString('es-AR')}`
              }
            });
          }
        }
      }

      // 3. Impactar en cuenta corriente del proveedor si corresponde
      if ((data.metodo_pago === "A Cuenta Corriente") && (data.proveedorId || data.proveedor)) {
        const idBuscado = data.proveedorId || data.proveedor;
        
        let proveedor = null;
        if (idBuscado) {
          proveedor = await tx.proveedor.findUnique({
            where: { id: idBuscado }
          }).catch(() => null);

          if (!proveedor) {
            proveedor = await tx.proveedor.findFirst({
              where: { razonSocial: idBuscado }
            });
          }
        }

        if (proveedor) {
          const montoDecimal = new Prisma.Decimal(data.totalFinal);
          const nuevoSaldo = proveedor.total.minus(montoDecimal);

          await tx.proveedor.update({
            where: { id: proveedor.id },
            data: { total: nuevoSaldo }
          });

          await tx.movimientoProveedor.create({
            data: {
              proveedorId: proveedor.id,
              tipo: "DEBE", 
              monto: montoDecimal.negated(),
              descripcion: `Compra a CC #${compra.numeroCompra}`,
              referencia: compra.id,
              saldo: nuevoSaldo
            }
          });
        }
      }

      return compra;
    });

    return { success: true, id: result.id, numeroCompra: result.numeroCompra };
  } catch (error) {
    console.error("Error al crear compra:", error);
    return { success: false, error: "No se pudo guardar la compra" };
  }
}

export async function actualizarCompra(compraId: string, data: {
  proveedor: string,
  proveedorId?: string,
  total: number,
  interes: number,
  descuento: number,
  totalFinal: number,
  metodo_pago: string,
  dni?: string,
  telefono?: string,
  info?: string,
  comprobante?: string,
  transaccionId?: string,
  items: any[],
  impactarCostos?: boolean
}, usuario: string, detalleCambios: string) {
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Revertir stock de los items anteriores
      const oldItems = await tx.compraItem.findMany({
        where: { compraId }
      });

      const oldCompra = await tx.compra.findUnique({
        where: { id: compraId }
      });

      // Revertir saldo de proveedor si era A Cuenta Corriente
      if (oldCompra && (oldCompra.metodo_pago === "A Cuenta Corriente")) {
        let proveedor = await tx.proveedor.findUnique({
          where: { id: oldCompra.proveedorId || oldCompra.proveedor || "" }
        }).catch(() => null);

        if (!proveedor) {
          proveedor = await tx.proveedor.findFirst({
            where: { razonSocial: oldCompra.proveedor || "" }
          });
        }

        if (proveedor) {
          const montoRevertir = new Prisma.Decimal(oldCompra.totalFinal);
          const nuevoSaldo = proveedor.total.plus(montoRevertir);

          await tx.proveedor.update({
            where: { id: proveedor.id },
            data: { total: nuevoSaldo }
          });

          await tx.movimientoProveedor.updateMany({
            where: { referencia: compraId, proveedorId: proveedor.id, anulado: false },
            data: { anulado: true }
          });
        }
      }

      // Revertir el stock
      for (const oldItem of oldItems) {
        if (oldItem.productoId) {
          const articuloBase = await tx.articuloMostrador.findUnique({
            where: { id: oldItem.productoId },
            include: { packItems: true }
          });
          if (articuloBase?.esPack && articuloBase.packItems.length > 0) {
            for (const packItem of articuloBase.packItems) {
              await tx.articuloMostrador.update({
                where: { id: packItem.componenteId },
                data: { stock: { decrement: packItem.cantidad * oldItem.cantidad } }
              });
            }
          } else {
            await tx.articuloMostrador.update({
              where: { id: oldItem.productoId },
              data: { stock: { decrement: oldItem.cantidad } }
            });
          }
        }
      }

      // 2. Borrar items viejos
      await tx.compraItem.deleteMany({
        where: { compraId }
      });

      // 3. Actualizar compra y crear nuevos items
      await tx.compra.update({
        where: { id: compraId },
        data: {
          proveedor: data.proveedor,
          comprador: usuario,
          total: data.total,
          interes: data.interes,
          descuento: data.descuento,
          totalFinal: data.totalFinal,
          metodo_pago: data.metodo_pago,
          dni: data.dni,
          telefono: data.telefono,
          info: data.info,
          comprobante: data.comprobante,
          transaccionId: data.transaccionId,
          proveedorId: data.proveedorId || null,
          items: {
            create: data.items.map((item: any) => ({
              productoId: item.productoId || item.id, 
              nombre: item.nombre,
              cantidad: item.cantidad,
              costo_unit: item.costo_unit,
              subtotal: item.subtotal
            }))
          }
        }
      });

      // 4. Aplicar saldo nuevo si es A Cuenta Corriente
      if ((data.metodo_pago === "A Cuenta Corriente") && (data.proveedorId || data.proveedor)) {
        let proveedor = await tx.proveedor.findUnique({
          where: { id: data.proveedorId || data.proveedor || "" }
        }).catch(() => null);

        if (!proveedor) {
          proveedor = await tx.proveedor.findFirst({
            where: { razonSocial: data.proveedor || "" }
          });
        }

        if (proveedor) {
          const montoDecimal = new Prisma.Decimal(data.totalFinal);
          const nuevoSaldo = proveedor.total.minus(montoDecimal);

          await tx.proveedor.update({
            where: { id: proveedor.id },
            data: { total: nuevoSaldo }
          });

          await tx.movimientoProveedor.create({
            data: {
              proveedorId: proveedor.id,
              tipo: "DEBE",
              monto: montoDecimal.negated(),
              descripcion: `EDICIÓN: Compra a CC #${oldCompra?.numeroCompra}`,
              referencia: compraId,
              saldo: nuevoSaldo
            }
          });
        }
      }

      // 5. Incrementar stock de los nuevos items y opcionalmente actualizar costos
      for (const newItem of data.items) {
        const prodId = newItem.productoId || newItem.id;
        if (!prodId) continue;
        const articuloBase = await tx.articuloMostrador.findUnique({
          where: { id: prodId },
          include: { packItems: true }
        });
        if (articuloBase?.esPack && articuloBase.packItems.length > 0) {
          for (const packItem of articuloBase.packItems) {
            await tx.articuloMostrador.update({
              where: { id: packItem.componenteId },
              data: { stock: { increment: packItem.cantidad * newItem.cantidad } }
            });
          }
        } else {
          const updateData: any = { stock: { increment: newItem.cantidad } };
          if (data.impactarCostos) {
            updateData.precio = newItem.costo_unit;
          }
 
          await tx.articuloMostrador.update({
            where: { id: prodId },
            data: updateData
          });
 
          if (data.impactarCostos && articuloBase) {
            await tx.articuloAuditoria.create({
              data: {
                articuloId: prodId,
                usuario: usuario,
                accion: "MODIFICACION_PRECIO_BASE",
                detalle: `Actualizado por Edición de Compra #${oldCompra?.numeroCompra}. De $${Number(articuloBase.precio).toLocaleString('es-AR')} a $${Number(newItem.costo_unit).toLocaleString('es-AR')}`
              }
            });
          }
        }
      }

      // 6. Auditoria
      await tx.compraAuditoria.create({
        data: {
          compraId: compraId,
          usuario: usuario,
          accion: "EDICION_COMPRA",
          detalle: detalleCambios
        }
      });
    });

    return { success: true };
  } catch (error) {
    console.error("Error al actualizar compra:", error);
    return { success: false, error: "No se pudo modificar la compra" };
  }
}

export async function eliminarCompra(compraId: string, usuario: string) {
  try {
    await prisma.$transaction(async (tx) => {
      const compra = await tx.compra.findUnique({
        where: { id: compraId },
        include: { items: true }
      });

      if (!compra) throw new Error("Compra no encontrada");

      // 1. Revertir stock
      for (const item of compra.items) {
        if (item.productoId) {
          const articuloBase = await tx.articuloMostrador.findUnique({
            where: { id: item.productoId },
            include: { packItems: true }
          });
          if (articuloBase?.esPack && articuloBase.packItems.length > 0) {
            for (const packItem of articuloBase.packItems) {
              await tx.articuloMostrador.update({
                where: { id: packItem.componenteId },
                data: { stock: { decrement: packItem.cantidad * item.cantidad } }
              });
            }
          } else {
            await tx.articuloMostrador.update({
              where: { id: item.productoId },
              data: { stock: { decrement: item.cantidad } }
            });
          }
        }
      }

      // 2. Revertir saldo de proveedor
      if (compra.metodo_pago === "A Cuenta Corriente") {
        let proveedor = await tx.proveedor.findUnique({
          where: { id: compra.proveedorId || compra.proveedor || "" }
        }).catch(() => null);

        if (!proveedor) {
          proveedor = await tx.proveedor.findFirst({
            where: { razonSocial: compra.proveedor || "" }
          });
        }

        if (proveedor) {
            const montoRevertir = new Prisma.Decimal(compra.totalFinal);
            const nuevoSaldo = proveedor.total.plus(montoRevertir);

            await tx.proveedor.update({
                where: { id: proveedor.id },
                data: { total: nuevoSaldo }
            });

            await tx.movimientoProveedor.updateMany({
                where: { referencia: compra.id, proveedorId: proveedor.id },
                data: { anulado: true }
            });

            await tx.movimientoProveedor.create({
                data: {
                    proveedorId: proveedor.id,
                    tipo: "HABER", 
                    monto: montoRevertir,
                    descripcion: `ANULACIÓN: Compra a CC #${compra.numeroCompra} eliminada`,
                    referencia: compra.id,
                    saldo: nuevoSaldo,
                    anulado: true
                }
            });
          }
        }

      // 3. Auditoria
      await tx.compraAuditoria.create({
        data: {
          compraId: compraId,
          usuario: usuario,
          accion: "ELIMINACION_COMPRA",
          detalle: `Compra eliminada por ${usuario}`
        }
      });

      await tx.compra.delete({
        where: { id: compraId }
      });
    });

    return { success: true };
  } catch (error) {
    console.error("Error al eliminar compra:", error);
    return { success: false, error: "No se pudo eliminar la compra" };
  }
}

export async function obtenerHistorialCompra(compraId: string) {
  try {
    const historial = await prisma.compraAuditoria.findMany({
      where: { compraId: compraId },
      orderBy: { createdAt: 'desc' }
    });
    return { success: true, data: historial };
  } catch (error) {
    console.error("Error al obtener historial:", error);
    return { success: false, error: "No se pudo cargar el historial" };
  }
}

export async function obtenerURLDescargaPDFCompra(compraId: string, fileName?: string) {
  try {
    const compra = await prisma.compra.findUnique({
      where: { id: compraId },
      select: { pdfUrl: true }
    });

    if (!compra || !compra.pdfUrl) {
      throw new Error("La compra no tiene un PDF asociado");
    }

    const queryParams = fileName ? `?fileName=${encodeURIComponent(fileName)}` : "";
    const proxyUrl = `/api/compras/${compraId}/pdf${queryParams}`;

    return { success: true, url: proxyUrl };
  } catch (error: any) {
    console.error("Error al obtener URL de PDF:", error);
    return { success: false, error: error.message || "No se pudo obtener el enlace de descarga" };
  }
}
