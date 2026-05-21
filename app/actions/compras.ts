"use server"

import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { requireAdmin } from "@/lib/auth-guard"
import { recalcularSaldosProveedorConBase, revertirMovimientoEnLedger } from "@/lib/proveedor-ledger"
import { triggerNotification } from "@/lib/notify"
import { revalidatePath } from "next/cache";

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

// Interpreta un string "YYYY-MM-DD" como medianoche en Argentina (UTC-3).
// Devuelve null si la string está vacía o no tiene formato válido, para
// no pasarle un Invalid Date a Prisma (acepta fechas futuras sin restricción).
const toArgDate = (dateStr: string | null | undefined): Date | null => {
  if (!dateStr) return null
  const d = new Date(`${dateStr}T00:00:00-03:00`)
  return isNaN(d.getTime()) ? null : d
}

async function upsertCostosML(tx: TxClient, prodId: string, item: any, costoEnArs: number, fob: number) {
  await tx.costosArticulos.upsert({
    where: { id_articulo: prodId },
    update: { costo_usd: item.costo_unit, es_dolar: true, costo_final_ars: costoEnArs * fob, fecha_actualizacion: new Date() },
    create: { id_articulo: prodId, descripcion: item.nombre, costo_usd: item.costo_unit, es_dolar: true, costo_final_ars: costoEnArs * fob }
  })
}

async function syncPackStock(tx: TxClient, packId: string, packItems: { componenteId: string; cantidad: number }[]) {
  const componentes = await tx.articuloMostrador.findMany({
    where: { id: { in: packItems.map(p => p.componenteId) } },
    select: { id: true, stock: true },
  });
  const stockMap = new Map(componentes.map(c => [c.id, c.stock]));
  const stockPack = Math.min(
    ...packItems.map(p => Math.floor((stockMap.get(p.componenteId) ?? 0) / p.cantidad))
  );
  await tx.articuloMostrador.update({ where: { id: packId }, data: { stock: stockPack } });
}

export async function obtenerTodosLosArticulos() {
  await requireAdmin();
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
      costo: art.costo ? Number(art.costo) : 0,
      margenGanancia: art.margenGanancia ? Number(art.margenGanancia) : 0,
      esPack: art.esPack || false,
      ultimaModificacion: art.auditorias?.[0]?.createdAt?.toISOString() || null,
      stock: (art.esPack && art.packItems)
        ? (art.packItems.length > 0 ? Math.min(...art.packItems.map(item => Math.floor(item.componente.stock / item.cantidad))) : 0)
        : art.stock,
      packItems: art.packItems?.map(packItem => ({
        ...packItem,
        componente: {
          ...packItem.componente,
          precio: Number(packItem.componente.precio),
          costo: packItem.componente.costo ? Number(packItem.componente.costo) : 0,
          margenGanancia: packItem.componente.margenGanancia ? Number(packItem.componente.margenGanancia) : 0,
        }
      })) || []
    }));
  } catch (error) {
    console.error("Error al obtener artículos:", error);
    return [];
  }
}

export async function obtenerComprasPorRango(fechaDesde: string, fechaHasta: string) {
  await requireAdmin();
  try {
    const inicioRango = new Date(`${fechaDesde}T00:00:00-03:00`);
    const finRango = new Date(`${fechaHasta}T23:59:59.999-03:00`);

    const compras = await prisma.compra.findMany({
      where: {
        tipoCompra: { not: "PEDIDO" },
        fechaCarga: {
          gte: inicioRango,
          lte: finRango,
        },
      },
      include: {
        items: true,
        proveedorRel: true,
      },
      orderBy: {
        fechaCarga: 'desc',
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
        fechaCarga: c.fechaCarga.toISOString(),
        fechaIngreso: c.fechaIngreso ? c.fechaIngreso.toISOString() : null,
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
  await requireAdmin();
  try {
    const inicioRango = new Date(`${fechaDesde}T00:00:00-03:00`);
    const finRango = new Date(`${fechaHasta}T23:59:59.999-03:00`);

    const where: any = {
      tipoCompra: "PEDIDO",
      fechaCarga: {
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
        fechaCarga: 'desc',
      },
    });

    return {
      success: true,
      data: compras.map(c => ({
        ...c,
        tipoCompra: c.tipoCompra || "PEDIDO",
        total: Number(c.total),
        interes: Number(c.interes),
        descuento: Number(c.descuento),
        totalFinal: Number(c.totalFinal),
        createdAt: c.createdAt.toISOString(),
        fechaCarga: c.fechaCarga.toISOString(),
        fechaIngreso: c.fechaIngreso ? c.fechaIngreso.toISOString() : null,
        items: c.items.map(i => ({
          ...i,
          productoId: i.productoId || null,
          costo_unit: Number(i.costo_unit),
          subtotal: Number(i.subtotal)
        }))
      }))
    };
  } catch (error) {
    console.error("Error al obtener pedidos de compra:", error);
    return { success: false, error: "No se pudieron cargar los pedidos de compra" };
  }
}

export async function obtenerPedidoCompraPorId(compraId: string) {
  await requireAdmin();
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
      fechaCarga: compra.fechaCarga.toISOString(),
      fechaIngreso: compra.fechaIngreso ? compra.fechaIngreso.toISOString() : null,
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
  impactarCostos?: boolean,
  moneda?: 'ARS' | 'USD',
  fechaCompra?: string,
  fechaIngreso?: string
}) {
  const session = await requireAdmin();
  const currentUserId = (session.user as any).id as string | undefined
  const moneda = data.moneda ?? 'ARS'
  const config = (data.impactarCostos && moneda === 'USD') ? await prisma.config.findFirst() : null
  const dolar = Number(config?.dolarCotizacion ?? 1)
  const fob = Number(config?.factorFob ?? 1)
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
          fechaCarga: toArgDate(data.fechaCompra) ?? undefined,
          fechaIngreso: toArgDate(data.fechaIngreso),
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
          await syncPackStock(tx, prodId, articuloBase.packItems);
        } else {
          const updateData: any = { stock: { increment: item.cantidad } };
          const margen = item.margenGanancia ?? 50;
          const costoBaseArs = moneda === 'USD' ? Number(item.costo_unit) * dolar : Number(item.costo_unit)
          const costoEnArs = moneda === 'USD' ? costoBaseArs * fob : costoBaseArs
          const precioPublico = Math.round(costoEnArs * (1 + margen / 100));

          if (data.impactarCostos) {
            updateData.costo = costoEnArs;
            updateData.margenGanancia = margen;
            updateData.precio = precioPublico;
          }

          await tx.articuloMostrador.update({ where: { id: prodId }, data: updateData });

          if (data.impactarCostos && articuloBase) {
            if (moneda === 'USD') await upsertCostosML(tx, prodId, item, costoBaseArs, fob)
            const costoStr = moneda === 'USD' ? `U$S ${Number(item.costo_unit).toLocaleString('es-AR')} = $${costoEnArs.toLocaleString('es-AR')}` : `$${costoEnArs.toLocaleString('es-AR')}`
            await tx.articuloAuditoria.create({
              data: {
                articuloId: prodId,
                usuario: data.comprador,
                accion: "MODIFICACION_PRECIO_BASE",
                detalle: `Actualizado por Pedido de Compra #${compra.numeroCompra} (Costo: ${costoStr}, Margen: ${margen}%). De $${Number(articuloBase.precio).toLocaleString('es-AR')} a $${precioPublico.toLocaleString('es-AR')}`
              }
            });
          }
        }
      }

      return compra;
    });

    triggerNotification({
      eventType: "PEDIDO_COMPRA_CREADO",
      sourceUserId: currentUserId,
      title: `Nuevo pedido de compra #${result.numeroCompra}`,
      body: `Proveedor: ${data.proveedor} — Total: $${Number(data.totalFinal).toLocaleString("es-AR")}`,
    })
    revalidatePath("/admin/erp/pedidos-compra");
    return { success: true, id: result.id, numeroCompra: result.numeroCompra };
  } catch (error) {
    console.error("Error al guardar pedido de compra:", error);
    return { success: false, error: "No se pudo guardar el pedido de compra" };
  }
}

export async function confirmarPedidoCompra(compraId: string, data?: { impactarCostos: boolean, items: any[], usuario: string, moneda?: 'ARS' | 'USD' }) {
  await requireAdmin();
  const moneda: 'ARS' | 'USD' = data?.moneda ?? 'ARS'
  const config = (data?.impactarCostos && moneda === 'USD') ? await prisma.config.findFirst() : null
  const dolar = Number(config?.dolarCotizacion ?? 1)
  const fob = Number(config?.factorFob ?? 1)
  try {
    const result = await prisma.$transaction(async (tx) => {
      const compra = await tx.compra.update({
        where: { id: compraId },
        data: { tipoCompra: "CONFIRMADA" }
      });

      if (data && data.items && data.impactarCostos) {
        for (const item of data.items) {
          const prodId = item.productoId || item.id;
          if (!prodId) continue;

          const articuloBase = await tx.articuloMostrador.findUnique({
            where: { id: prodId }
          });

          if (articuloBase && !articuloBase.esPack) {
            const margen = item.margenGanancia ?? 50;
            const costoBaseArs = moneda === 'USD' ? Number(item.costo_unit) * dolar : Number(item.costo_unit)
            const costoEnArs = moneda === 'USD' ? costoBaseArs * fob : costoBaseArs
            const precioPublico = Math.round(costoEnArs * (1 + margen / 100));

            await tx.articuloMostrador.update({
              where: { id: prodId },
              data: { costo: costoEnArs, margenGanancia: margen, precio: precioPublico }
            });

            if (moneda === 'USD') await upsertCostosML(tx, prodId, item, costoBaseArs, fob)
            const costoStr = moneda === 'USD' ? `U$S ${Number(item.costo_unit).toLocaleString('es-AR')} = $${costoEnArs.toLocaleString('es-AR')}` : `$${costoEnArs.toLocaleString('es-AR')}`
            await tx.articuloAuditoria.create({
              data: {
                articuloId: prodId,
                usuario: data.usuario || "Admin",
                accion: "MODIFICACION_PRECIO_BASE",
                detalle: `Actualizado al confirmar Pedido #${compra.numeroCompra} (Costo: ${costoStr}, Margen: ${margen}%). De $${Number(articuloBase.precio).toLocaleString('es-AR')} a $${precioPublico.toLocaleString('es-AR')}`
              }
            });
          }
        }
      }

      if ((compra.metodo_pago === "A Cuenta Corriente") && (compra.proveedorId || compra.proveedor)) {
        const movimientoExistente = await tx.movimientoProveedor.findFirst({
          where: { referencia: compraId, anulado: false }
        });

        if (!movimientoExistente) {
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
      }

      return compra;
    });

    revalidatePath("/admin/erp/pedidos-compra");
    revalidatePath("/admin/compras");
    return { success: true, id: result.id, numeroCompra: result.numeroCompra };
  } catch (error) {
    console.error("Error al confirmar pedido de compra:", error);
    return { success: false, error: "No se pudo confirmar el pedido de compra" };
  }
}

export async function actualizarEstadoPedidoCompra(compraId: string, estadoPedido: string) {
  await requireAdmin();
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

export async function actualizarFechaCompra(compraId: string, nuevaFecha: string) {
  await requireAdmin();
  try {
    await prisma.$transaction(async (tx) => {
      const compra = await tx.compra.update({
        where: { id: compraId },
        data: { fechaCarga: toArgDate(nuevaFecha) ?? new Date() }
      });

      if (compra.metodo_pago === "A Cuenta Corriente") {
        await tx.movimientoProveedor.updateMany({
          where: { referencia: compraId },
          data: { fecha: toArgDate(nuevaFecha) ?? new Date() }
        });

        // Al cambiar la fecha el movimiento reordena en la línea de tiempo,
        // lo que invalida los saldos acumulados de todos los movimientos del proveedor.
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
          await recalcularSaldosProveedorConBase(tx, proveedor.id);
        }
      }
    });
    return { success: true };
  } catch (error) {
    console.error("Error al actualizar fecha de compra:", error);
    return { success: false, error: "No se pudo actualizar la fecha" };
  }
}

export async function actualizarPedidoCompra(compraId: string, data: any, usuario: string, detalleCambios: string) {
  await requireAdmin();
  const moneda: 'ARS' | 'USD' = data.moneda ?? 'ARS'
  const config = (data.impactarCostos && moneda === 'USD') ? await prisma.config.findFirst() : null
  const dolar = Number(config?.dolarCotizacion ?? 1)
  const fob = Number(config?.factorFob ?? 1)
  try {
    await prisma.$transaction(async (tx) => {
      const oldItems = await tx.compraItem.findMany({
        where: { compraId }
      });

      // Revertir CC si el pedido ya fue confirmado y tiene movimientos activos
      const movimientosCC = await tx.movimientoProveedor.findMany({
        where: { referencia: compraId, anulado: false }
      });
      if (movimientosCC.length > 0) {
        await tx.movimientoProveedor.updateMany({
          where: { referencia: compraId, anulado: false },
          data: { anulado: true }
        });
        for (const mov of movimientosCC) {
          await revertirMovimientoEnLedger(tx, mov.id);
        }
      }

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
            await syncPackStock(tx, oldItem.productoId, articuloBase.packItems);
          } else {
            await tx.articuloMostrador.update({
              where: { id: oldItem.productoId },
              data: { stock: { decrement: oldItem.cantidad } }
            });
          }
        }
      }

      await tx.compraItem.deleteMany({
        where: { compraId }
      });

      const updatedCompra = await tx.compra.update({
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
          fechaCarga: toArgDate(data.fechaCompra) ?? undefined,
          fechaIngreso: toArgDate(data.fechaIngreso),
          items: {
            create: data.items.map((item: any) => ({
              productoId: item.productoId || item.id,
              nombre: item.nombre,
              cantidad: item.cantidad,
              costo_unit: item.costo_unit,
              subtotal: item.subtotal,
              margenGanancia: item.margenGanancia || 50
            }))
          }
        }
      });

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
          await syncPackStock(tx, prodId, articuloBase.packItems);
        } else {
          const updateData: any = { stock: { increment: newItem.cantidad } };
          const margen = newItem.margenGanancia ?? 50;
          const costoBaseArs = moneda === 'USD' ? Number(newItem.costo_unit) * dolar : Number(newItem.costo_unit)
          const costoEnArs = moneda === 'USD' ? costoBaseArs * fob : costoBaseArs
          const precioPublico = Math.round(costoEnArs * (1 + margen / 100));

          if (data.impactarCostos) {
            updateData.costo = costoEnArs;
            updateData.margenGanancia = margen;
            updateData.precio = precioPublico;
          }

          await tx.articuloMostrador.update({ where: { id: prodId }, data: updateData });

          if (data.impactarCostos && articuloBase) {
            if (moneda === 'USD') await upsertCostosML(tx, prodId, newItem, costoBaseArs, fob)
            const costoStr = moneda === 'USD' ? `U$S ${Number(newItem.costo_unit).toLocaleString('es-AR')} = $${costoEnArs.toLocaleString('es-AR')}` : `$${costoEnArs.toLocaleString('es-AR')}`
            await tx.articuloAuditoria.create({
              data: {
                articuloId: prodId,
                usuario: usuario,
                accion: "MODIFICACION_PRECIO_BASE",
                detalle: `Actualizado por Edición de Pedido #${updatedCompra.numeroCompra} (Costo: ${costoStr}, Margen: ${margen}%). De $${Number(articuloBase.precio).toLocaleString('es-AR')} a $${precioPublico.toLocaleString('es-AR')}`
              }
            });
          }
        }
      }

      // Aplicar nuevo impacto en CC si corresponde (solo si fue o es un pedido confirmado)
      if ((data.metodo_pago === "A Cuenta Corriente") && (data.proveedorId || data.proveedor) && updatedCompra.tipoCompra === "CONFIRMADA") {
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
              descripcion: `EDICIÓN: Compra a CC #${updatedCompra.numeroCompra}`,
              referencia: compraId,
              saldo: nuevoSaldo
            }
          });
        }
      }

      await tx.compraAuditoria.create({
        data: {
          compraId: compraId,
          usuario: usuario,
          accion: "EDICION_PEDIDO_COMPRA",
          detalle: detalleCambios
        }
      });
    });

    revalidatePath("/admin/erp/pedidos-compra");
    return { success: true };
  } catch (error) {
    console.error("Error al actualizar pedido de compra:", error);
    return { success: false, error: "No se pudo actualizar el pedido de compra" };
  }
}

export async function eliminarPedidoCompra(compraId: string) {
  await requireAdmin();
  try {
    await prisma.$transaction(async (tx) => {
      const compra = await tx.compra.findUnique({
        where: { id: compraId },
        include: { items: true }
      });

      if (!compra) throw new Error("Pedido no encontrado");

      // Revertir impacto en CC si el pedido fue confirmado (y ya tiene movimientos activos)
      const movimientosCC = await tx.movimientoProveedor.findMany({
        where: { referencia: compraId, anulado: false }
      });

      if (movimientosCC.length > 0) {
        await tx.movimientoProveedor.updateMany({
          where: { referencia: compraId, anulado: false },
          data: { anulado: true }
        });
        for (const mov of movimientosCC) {
          await revertirMovimientoEnLedger(tx, mov.id);
        }
      }

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
            await syncPackStock(tx, item.productoId, articuloBase.packItems);
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
  impactarCostos?: boolean,
  moneda?: 'ARS' | 'USD',
  fechaCompra?: string,
  fechaIngreso?: string
}) {
  await requireAdmin();
  const moneda = data.moneda ?? 'ARS'
  const config = (data.impactarCostos && moneda === 'USD') ? await prisma.config.findFirst() : null
  const dolar = Number(config?.dolarCotizacion ?? 1)
  const fob = Number(config?.factorFob ?? 1)
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
          metodo_pago: data.metodo_pago,
          dni: data.dni,
          telefono: data.telefono,
          info: data.info,
          comprobante: data.comprobante,
          transaccionId: data.transaccionId,
          proveedorId: data.proveedorId || null,
          fechaCarga: toArgDate(data.fechaCompra) ?? undefined,
          fechaIngreso: toArgDate(data.fechaIngreso),
          items: {
            create: data.items.map(item => ({
              productoId: item.productoId || item.id,
              nombre: item.nombre,
              cantidad: item.cantidad,
              costo_unit: item.costo_unit,
              subtotal: item.subtotal,
              margenGanancia: item.margenGanancia || 50
            }))
          }
        }
      });

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
          await syncPackStock(tx, prodId, articuloBase.packItems);
        } else {
          const updateData: any = { stock: { increment: item.cantidad } };
          const margen = item.margenGanancia ?? 50;
          const costoBaseArs = moneda === 'USD' ? Number(item.costo_unit) * dolar : Number(item.costo_unit)
          const costoEnArs = moneda === 'USD' ? costoBaseArs * fob : costoBaseArs
          const precioPublico = Math.round(costoEnArs * (1 + margen / 100));

          if (data.impactarCostos) {
            updateData.costo = costoEnArs;
            updateData.margenGanancia = margen;
            updateData.precio = precioPublico;
          }

          await tx.articuloMostrador.update({ where: { id: prodId }, data: updateData });

          if (data.impactarCostos && articuloBase) {
            if (moneda === 'USD') await upsertCostosML(tx, prodId, item, costoBaseArs, fob)
            const costoStr = moneda === 'USD' ? `U$S ${Number(item.costo_unit).toLocaleString('es-AR')} = $${costoEnArs.toLocaleString('es-AR')}` : `$${costoEnArs.toLocaleString('es-AR')}`
            await tx.articuloAuditoria.create({
              data: {
                articuloId: prodId,
                usuario: data.comprador,
                accion: "MODIFICACION_PRECIO_BASE",
                detalle: `Actualizado por Compra #${compra.numeroCompra} (Costo: ${costoStr}, Margen: ${margen}%). De $${Number(articuloBase.precio).toLocaleString('es-AR')} a $${precioPublico.toLocaleString('es-AR')}`
              }
            });
          }
        }
      }

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
              saldo: nuevoSaldo,
              fecha: toArgDate(data.fechaCompra) ?? undefined
            }
          });
        }
      }

      return compra;
    });

    revalidatePath("/admin/compras");
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
  impactarCostos?: boolean,
  moneda?: 'ARS' | 'USD',
  fechaCompra?: string,
  fechaIngreso?: string
}, usuario: string, detalleCambios: string) {
  await requireAdmin();
  const moneda = data.moneda ?? 'ARS'
  const config = (data.impactarCostos && moneda === 'USD') ? await prisma.config.findFirst() : null
  const dolar = Number(config?.dolarCotizacion ?? 1)
  const fob = Number(config?.factorFob ?? 1)
  try {
    await prisma.$transaction(async (tx) => {
      const oldItems = await tx.compraItem.findMany({
        where: { compraId }
      });

      const oldCompra = await tx.compra.findUnique({
        where: { id: compraId }
      });

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
          const movsAAnular = await tx.movimientoProveedor.findMany({
            where: { referencia: compraId, proveedorId: proveedor.id, anulado: false },
          });
          await tx.movimientoProveedor.updateMany({
            where: { referencia: compraId, proveedorId: proveedor.id, anulado: false },
            data: { anulado: true }
          });
          for (const mov of movsAAnular) {
            await revertirMovimientoEnLedger(tx, mov.id);
          }
        }
      }

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
            await syncPackStock(tx, oldItem.productoId, articuloBase.packItems);
          } else {
            await tx.articuloMostrador.update({
              where: { id: oldItem.productoId },
              data: { stock: { decrement: oldItem.cantidad } }
            });
          }
        }
      }

      await tx.compraItem.deleteMany({
        where: { compraId }
      });

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
          fechaCarga: toArgDate(data.fechaCompra) ?? undefined,
          fechaIngreso: toArgDate(data.fechaIngreso),
          items: {
            create: data.items.map((item: any) => ({
              productoId: item.productoId || item.id,
              nombre: item.nombre,
              cantidad: item.cantidad,
              costo_unit: item.costo_unit,
              subtotal: item.subtotal,
              margenGanancia: item.margenGanancia || 50
            }))
          }
        }
      });

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
              saldo: nuevoSaldo,
              fecha: toArgDate(data.fechaCompra) ?? undefined
            }
          });
        }
      }

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
          await syncPackStock(tx, prodId, articuloBase.packItems);
        } else {
          const updateData: any = { stock: { increment: newItem.cantidad } };
          const margen = newItem.margenGanancia ?? 50;
          const costoBaseArs = moneda === 'USD' ? Number(newItem.costo_unit) * dolar : Number(newItem.costo_unit)
          const costoEnArs = moneda === 'USD' ? costoBaseArs * fob : costoBaseArs
          const precioPublico = Math.round(costoEnArs * (1 + margen / 100));

          if (data.impactarCostos) {
            updateData.costo = costoEnArs;
            updateData.margenGanancia = margen;
            updateData.precio = precioPublico;
          }

          await tx.articuloMostrador.update({ where: { id: prodId }, data: updateData });

          if (data.impactarCostos && articuloBase) {
            if (moneda === 'USD') await upsertCostosML(tx, prodId, newItem, costoBaseArs, fob)
            const costoStr = moneda === 'USD' ? `U$S ${Number(newItem.costo_unit).toLocaleString('es-AR')} = $${costoEnArs.toLocaleString('es-AR')}` : `$${costoEnArs.toLocaleString('es-AR')}`
            await tx.articuloAuditoria.create({
              data: {
                articuloId: prodId,
                usuario: usuario,
                accion: "MODIFICACION_PRECIO_BASE",
                detalle: `Actualizado por Edición de Compra #${oldCompra?.numeroCompra} (Costo: ${costoStr}, Margen: ${margen}%). De $${Number(articuloBase.precio).toLocaleString('es-AR')} a $${precioPublico.toLocaleString('es-AR')}`
              }
            });
          }
        }
      }

      await tx.compraAuditoria.create({
        data: {
          compraId: compraId,
          usuario: usuario,
          accion: "EDICION_COMPRA",
          detalle: detalleCambios
        }
      });
    });

    revalidatePath("/admin/compras");
    return { success: true };
  } catch (error) {
    console.error("Error al actualizar compra:", error);
    return { success: false, error: "No se pudo modificar la compra" };
  }
}

export async function eliminarCompra(compraId: string, usuario: string) {
  await requireAdmin();
  try {
    await prisma.$transaction(async (tx) => {
      const compra = await tx.compra.findUnique({
        where: { id: compraId },
        include: { items: true }
      });

      if (!compra) throw new Error("Compra no encontrada");

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
            await syncPackStock(tx, item.productoId, articuloBase.packItems);
          } else {
            await tx.articuloMostrador.update({
              where: { id: item.productoId },
              data: { stock: { decrement: item.cantidad } }
            });
          }
        }
      }

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
          const movsAAnular = await tx.movimientoProveedor.findMany({
            where: { referencia: compra.id, proveedorId: proveedor.id, anulado: false },
          });
          await tx.movimientoProveedor.updateMany({
            where: { referencia: compra.id, proveedorId: proveedor.id },
            data: { anulado: true }
          });
          for (const mov of movsAAnular) {
            await revertirMovimientoEnLedger(tx, mov.id);
          }
        }
      }

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
  await requireAdmin();
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
  await requireAdmin();
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
