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
  proveedorId?: string
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
              productoId: item.id, 
              nombre: item.nombre,
              cantidad: item.cantidad,
              costo_unit: item.costo_unit,
              subtotal: item.subtotal
            }))
          }
        }
      });

      // 2. Incrementar stock (es una compra)
      for (const item of data.items) {
        const articuloBase = await tx.articuloMostrador.findUnique({
          where: { id: item.id },
          include: { packItems: true }
        });

        if (articuloBase?.esPack && articuloBase.packItems.length > 0) {
          for (const packItem of articuloBase.packItems) {
            await tx.articuloMostrador.updateMany({
              where: { id: packItem.componenteId },
              data: { stock: { increment: packItem.cantidad * item.cantidad } }
            });
          }
        } else {
          await tx.articuloMostrador.updateMany({
            where: { id: item.productoId },
            data: {
              stock: {
                increment: item.cantidad
              }
            }
          });
        }
      }

      // 3. Impactar en cuenta corriente del proveedor si corresponde
      // Para compras, si el pago es "A Cuenta Corriente", aumenta nuestra deuda con el proveedor (HABER)
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
          // Compras: Restamos al saldo (más deuda = más negativo)
          const nuevoSaldo = proveedor.total.minus(montoDecimal);

          await tx.proveedor.update({
            where: { id: proveedor.id },
            data: { total: nuevoSaldo }
          });

          await tx.movimientoProveedor.create({
            data: {
              proveedorId: proveedor.id,
              tipo: "DEBE", // Compra aumenta nuestra deuda (EGRESO de valor)
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

export async function actualizarCompra(compraId: string, data: any, usuario: string, detalleCambios: string) {
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
          // Revertir compra: sumamos lo que habíamos restado
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

      // Revertir el stock (restar lo que se había sumado originalmente)
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
                data: { stock: { decrement: packItem.cantidad * oldItem.cantidad } }
              });
            }
          } else {
            await tx.articuloMostrador.updateMany({
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
              productoId: item.id, 
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

      // 5. Incrementar stock de los nuevos items
      for (const newItem of data.items) {
        const articuloBase = await tx.articuloMostrador.findUnique({
          where: { id: newItem.id },
          include: { packItems: true }
        });
        if (articuloBase?.esPack && articuloBase.packItems.length > 0) {
          for (const packItem of articuloBase.packItems) {
            await tx.articuloMostrador.updateMany({
              where: { id: packItem.componenteId },
              data: { stock: { increment: packItem.cantidad * newItem.cantidad } }
            });
          }
        } else {
          await tx.articuloMostrador.updateMany({
            where: { id: newItem.productoId },
            data: { stock: { increment: newItem.cantidad } }
          });
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

      // 1. Revertir stock (restar lo que se sumó)
      for (const item of compra.items) {
        if (item.productoId) {
          const articuloBase = await tx.articuloMostrador.findUnique({
            where: { id: item.productoId },
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
            // Revertir compra: sumamos al saldo (volvemos hacia el 0)
            const nuevoSaldo = proveedor.total.plus(montoRevertir);

            await tx.proveedor.update({
                where: { id: proveedor.id },
                data: { total: nuevoSaldo }
            });

            // 1. Marcar el movimiento original como anulado
            await tx.movimientoProveedor.updateMany({
                where: { referencia: compra.id, proveedorId: proveedor.id },
                data: { anulado: true }
            });

            // 2. Crear un movimiento de anulación (monto positivo para reversar el negativo)
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

      // 4. Eliminar
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
