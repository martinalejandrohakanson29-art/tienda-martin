"use server"

import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache";
import { facturarVenta } from "./afip";
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
// --- Helpers para procesar pagos mixtos ---
function extractMontoMixto(info: string | null | undefined, label: string): number {
  if (!info) return 0;
  // Formato esperado: [Mixto -> Metodo1: $1.234,56 | Metodo2: $7.890,12]
  // La expresión regular busca el label seguido de dos puntos, espacio, signo pesos y el valor numérico
  const regex = new RegExp(`${label}: \\$([0-9.,]+)`, "i");
  const match = info.match(regex);
  if (match && match[1]) {
    // En AR el formato es 1.234,56 -> quitamos puntos de miles y cambiamos coma por punto decimal
    const cleanValue = match[1].replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(cleanValue);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function getMontoImpactoProveedor(metodo_pago: string, info: string | null | undefined, totalFinal: number): number {
  if (metodo_pago === "Cruzada" || metodo_pago === "A Cuenta Corriente") {
    return totalFinal;
  }
  if (metodo_pago === "Mixto") {
    const cruzada = extractMontoMixto(info, "Cruzada");
    const cc = extractMontoMixto(info, "A Cuenta Corriente");
    return cruzada + cc;
  }
  return 0;
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
  puntoVentaId?: string,
  // ARCA fields
  cae?: string,
  vencimientoCae?: Date,
  facturaNumero?: number,
  facturaPuntoVenta?: number,
  tipoComprobante?: number,
  docTipo?: number,
  docNro?: string,
  condicionIva?: number,
  importeIva?: any,
  alicuotaIva?: number
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
          // ARCA fields
          cae: data.cae,
          vencimientoCae: data.vencimientoCae,
          facturaNumero: data.facturaNumero,
          facturaPuntoVenta: data.facturaPuntoVenta,
          tipoComprobante: data.tipoComprobante,
          docTipo: data.docTipo,
          docNro: data.docNro,
          condicionIva: data.condicionIva,
          importeIva: data.importeIva,
          alicuotaIva: data.alicuotaIva,
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

      // --- NUEVO: Actualizar saldo de proveedor si el pago es "Cruzada", "A Cuenta Corriente" o "Mixto" con esas partes ---
      const montoImpactoVal = getMontoImpactoProveedor(data.metodo_pago, data.info, data.totalFinal);

      if (montoImpactoVal > 0 && data.para) {
        const idBuscado = data.para;

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
          const montoDecimal = new Prisma.Decimal(montoImpactoVal);
          const nuevoSaldo = proveedor.total.plus(montoDecimal);

          await tx.proveedor.update({
            where: { id: proveedor.id },
            data: { total: nuevoSaldo }
          });

          await tx.movimientoProveedor.create({
            data: {
              proveedorId: proveedor.id,
              tipo: "HABER",
              monto: montoDecimal,
              descripcion: `${data.metodo_pago === "Cruzada" ? "Pago de venta" : data.metodo_pago === "Mixto" ? "Venta Mixta (Cruzada/CC)" : "Venta a CC"} #${venta.numeroVenta} (${data.cliente})`,
              referencia: venta.id,
              saldo: nuevoSaldo
            }
          });
        }
      }

      return venta;
    });

    return { success: true, id: result.id, numeroVenta: result.numeroVenta };
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
  puntoVentaId?: string,
  // ARCA fields
  cae?: string,
  vencimientoCae?: Date,
  facturaNumero?: number,
  facturaPuntoVenta?: number,
  tipoComprobante?: number,
  docTipo?: number,
  docNro?: string,
  condicionIva?: number,
  importeIva?: any,
  alicuotaIva?: number
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
          // ARCA fields
          cae: data.cae,
          vencimientoCae: data.vencimientoCae,
          facturaNumero: data.facturaNumero,
          facturaPuntoVenta: data.facturaPuntoVenta,
          tipoComprobante: data.tipoComprobante,
          docTipo: data.docTipo,
          docNro: data.docNro,
          condicionIva: data.condicionIva,
          importeIva: data.importeIva,
          alicuotaIva: data.alicuotaIva,
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

    return { success: true, id: result.id, numeroVenta: result.numeroVenta };
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

      // --- NUEVO: Revertir saldo de proveedor si la venta anterior tenía impacto (Cruzada, CC o Mixto) ---
      const oldVenta = await tx.venta.findUnique({
        where: { id: ventaId }
      });

      const esMetodoImpactoOld = oldVenta && (oldVenta.metodo_pago === "Cruzada" || oldVenta.metodo_pago === "A Cuenta Corriente" || oldVenta.metodo_pago === "Mixto");

      if (oldVenta && esMetodoImpactoOld) {
        const montoRevertirVal = getMontoImpactoProveedor(oldVenta.metodo_pago, oldVenta.info, Number(oldVenta.totalFinal));

        if (montoRevertirVal > 0) {
          let proveedor = await tx.proveedor.findUnique({
            where: { id: oldVenta.para || "" }
          }).catch(() => null);

          if (!proveedor) {
            proveedor = await tx.proveedor.findFirst({
              where: { razonSocial: oldVenta.para || "" }
            });
          }

          if (proveedor) {
            const montoRevertir = new Prisma.Decimal(montoRevertirVal);
            const nuevoSaldo = proveedor.total.minus(montoRevertir);

            await tx.proveedor.update({
              where: { id: proveedor.id },
              data: { total: nuevoSaldo }
            });

            // Marcar movimiento anterior como anulado
            await tx.movimientoProveedor.updateMany({
              where: { referencia: ventaId, proveedorId: proveedor.id, anulado: false },
              data: { anulado: true }
            });
          }
        }
      }

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
          // ARCA fields
          ...(data.cae !== undefined && { cae: data.cae }),
          ...(data.vencimientoCae !== undefined && { vencimientoCae: data.vencimientoCae }),
          ...(data.facturaNumero !== undefined && { facturaNumero: data.facturaNumero }),
          ...(data.facturaPuntoVenta !== undefined && { facturaPuntoVenta: data.facturaPuntoVenta }),
          ...(data.tipoComprobante !== undefined && { tipoComprobante: data.tipoComprobante }),
          ...(data.docTipo !== undefined && { docTipo: data.docTipo }),
          ...(data.docNro !== undefined && { docNro: data.docNro }),
          ...(data.condicionIva !== undefined && { condicionIva: data.condicionIva }),
          ...(data.importeIva !== undefined && { importeIva: data.importeIva }),
          ...(data.alicuotaIva !== undefined && { alicuotaIva: data.alicuotaIva }),
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

      // --- NUEVO: Aplicar saldo de proveedor si la nueva versión tiene impacto ---
      const montoImpactoNewVal = getMontoImpactoProveedor(data.metodo_pago, data.info, data.totalFinal);

      if (montoImpactoNewVal > 0 && data.para) {
        const idBuscado = data.para;

        let proveedor = await tx.proveedor.findUnique({
          where: { id: idBuscado || "" }
        }).catch(() => null);

        if (!proveedor) {
          proveedor = await tx.proveedor.findFirst({
            where: { razonSocial: data.para || "" }
          });
        }

        if (proveedor) {
          const montoDecimal = new Prisma.Decimal(montoImpactoNewVal);
          const nuevoSaldo = proveedor.total.plus(montoDecimal);

          await tx.proveedor.update({
            where: { id: proveedor.id },
            data: { total: nuevoSaldo }
          });

          await tx.movimientoProveedor.create({
            data: {
              proveedorId: proveedor.id,
              tipo: "HABER",
              monto: montoDecimal,
              descripcion: `EDICIÓN: ${data.metodo_pago === "Cruzada" ? "Pago de venta" : data.metodo_pago === "Mixto" ? "Venta Mixta (Cruzada/CC)" : "Venta a CC"} #${oldVenta?.numeroVenta} (${data.cliente})`,
              referencia: ventaId,
              saldo: nuevoSaldo
            }
          });
        }
      }

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
      // 0. Obtener la venta antes de borrarla
      const venta = await tx.venta.findUnique({
        where: { id: ventaId }
      });

      // 1. Obtener los items actuales para registrar en auditoría
      const items = await tx.ventaItem.findMany({
        where: { ventaId }
      });

      // --- NUEVO: Revertir saldo de proveedor si la venta tenía impacto (Cruzada, CC o Mixto) ---
      const esMetodoImpactoDel = venta && (venta.metodo_pago === "Cruzada" || venta.metodo_pago === "A Cuenta Corriente" || venta.metodo_pago === "Mixto");

      if (venta && esMetodoImpactoDel) {
        const montoRevertirVal = getMontoImpactoProveedor(venta.metodo_pago, venta.info, Number(venta.totalFinal));

        if (montoRevertirVal > 0) {
          let proveedor = await tx.proveedor.findUnique({
            where: { id: venta.para || "" }
          }).catch(() => null);

          if (!proveedor) {
            proveedor = await tx.proveedor.findFirst({
              where: { razonSocial: venta.para || "" }
            });
          }

          if (proveedor) {
            const montoRevertir = new Prisma.Decimal(montoRevertirVal);
            const nuevoSaldo = proveedor.total.minus(montoRevertir);

            await tx.proveedor.update({
              where: { id: proveedor.id },
              data: { total: nuevoSaldo }
            });

            // Marcar el movimiento original como anulado
            await tx.movimientoProveedor.updateMany({
              where: { referencia: venta.id, proveedorId: proveedor.id },
              data: { anulado: true }
            });

            // Crear un movimiento de anulación para que el historial sea claro
            await tx.movimientoProveedor.create({
              data: {
                proveedorId: proveedor.id,
                tipo: "EGRESO",
                monto: montoRevertir.negated(),
                descripcion: `ANULACIÓN: ${venta.metodo_pago === "Cruzada" ? "Venta Cruzada" : venta.metodo_pago === "Mixto" ? "Venta Mixta" : "Venta a CC"} #${venta.numeroVenta} (${venta.cliente}) eliminada`,
                referencia: venta.id,
                saldo: nuevoSaldo,
                anulado: true
              }
            });
          }
        }
      }

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
    const result = await prisma.$transaction(async (tx) => {
      const venta = await tx.venta.update({
        where: { id: ventaId },
        data: { tipoVenta: "CONFIRMADA" }
      });

      // --- NUEVO: Actualizar saldo de proveedor si el pago es "Cruzada" o "A Cuenta Corriente" ---
      if ((venta.metodo_pago === "Cruzada" || venta.metodo_pago === "A Cuenta Corriente") && venta.para) {
        let proveedor = await tx.proveedor.findUnique({
          where: { id: venta.para }
        }).catch(() => null);

        if (!proveedor) {
          proveedor = await tx.proveedor.findFirst({
            where: { razonSocial: venta.para }
          });
        }

        if (proveedor) {
          const montoDecimal = new Prisma.Decimal(venta.totalFinal);
          const nuevoSaldo = proveedor.total.plus(montoDecimal);

          await tx.proveedor.update({
            where: { id: proveedor.id },
            data: { total: nuevoSaldo }
          });

          await tx.movimientoProveedor.create({
            data: {
              proveedorId: proveedor.id,
              tipo: "HABER",
              monto: montoDecimal,
              descripcion: `${venta.metodo_pago === "Cruzada" ? "Pago de venta" : "Venta a CC"} #${venta.numeroVenta} (${venta.cliente}) - Confirmación Pedido`,
              referencia: venta.id,
              saldo: nuevoSaldo
            }
          });
        }
      }

      return venta;
    });

    return { success: true, data: result };

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

export async function obtenerURLDescargaPDF(ventaId: string, fileName?: string) {
  try {
    const venta = await prisma.venta.findUnique({
      where: { id: ventaId },
      select: { pdfUrl: true }
    });

    if (!venta || !venta.pdfUrl) {
      throw new Error("El pedido no tiene un PDF asociado");
    }

    // En lugar de generar una URL firmada de S3 que puede dar error de certificados/permisos
    // en el navegador del cliente, devolvemos nuestra propia ruta de API que actúa como proxy.
    const queryParams = fileName ? `?fileName=${encodeURIComponent(fileName)}` : "";
    const proxyUrl = `/api/pedidos/${ventaId}/pdf${queryParams}`;

    return { success: true, url: proxyUrl };
  } catch (error: any) {
    console.error("Error al obtener URL de PDF:", error);
    return { success: false, error: error.message || "No se pudo obtener el enlace de descarga" };
  }
}

export async function subirPDFLote(ventaIds: string[], formData: FormData) {
  if (!ventaIds || ventaIds.length === 0) {
    return { success: false, error: "No se seleccionaron pedidos" };
  }

  const file = formData.get('file') as File;
  if (!file) return { success: false, error: "No se proporcionó ningún archivo" };

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const timestamp = Date.now();
    // Usamos una carpeta de lotes con timestamp para evitar colisiones
    const key = `pedidos/lotes/${timestamp}/${safeFileName}`;

    const bucketName = process.env.S3_BUCKET_NAME?.trim();
    if (!bucketName) {
      throw new Error("S3_BUCKET_NAME no está configurado");
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

    await prisma.venta.updateMany({
      where: { id: { in: ventaIds } },
      data: { pdfUrl }
    });

    return { success: true, url: pdfUrl };
  } catch (error) {
    console.error("Error al subir PDF por lote:", error);
    return { success: false, error: "Error al subir el archivo a S3" };
  }
}

export async function eliminarPDFPedido(ventaId: string) {
  try {
    await prisma.venta.update({
      where: { id: ventaId },
      data: { pdfUrl: null }
    });
    return { success: true };
  } catch (error) {
    console.error("Error al eliminar PDF de pedido:", error);
    return { success: false, error: "Error al eliminar el archivo de la base de datos" };
  }
}

export async function generarFacturaARCA(ventaId: string) {
  try {
    const venta = await prisma.venta.findUnique({
      where: { id: ventaId },
      include: { items: true }
    });

    if (!venta) return { success: false, error: "Venta no encontrada" };
    if (venta.cae) return { success: false, error: "Esta venta ya fue facturada (CAE existente)" };

    // Validaciones básicas de datos ARCA
    if (!venta.docTipo || !venta.docNro) {
      return { success: false, error: "Faltan datos del cliente (Tipo Doc / Nro) para facturar" };
    }

    const resARCA = await facturarVenta({
      monto: Number(venta.totalFinal || venta.total),
      docTipo: venta.docTipo,
      docNro: parseInt(venta.docNro),
      ivaReceptor: venta.condicionIva || 5,
      tipoComprobante: venta.tipoComprobante || 6 // Default B
    });

    if (resARCA.success) {
      await prisma.venta.update({
        where: { id: ventaId },
        data: {
          cae: resARCA.cae,
          facturaNumero: resARCA.numero,
          facturaPuntoVenta: 9,
          vencimientoCae: resARCA.vencimiento ? new Date(
            parseInt(resARCA.vencimiento.substring(0, 4)),
            parseInt(resARCA.vencimiento.substring(4, 6)) - 1,
            parseInt(resARCA.vencimiento.substring(6, 8))
          ) : new Date(),
        }
      });
      revalidatePath("/admin/ventas-mostrador");
      return { success: true, cae: resARCA.cae, numero: resARCA.numero };
    } else {
      return { success: false, error: resARCA.error, details: (resARCA as any).details };
    }
  } catch (error: any) {
    console.error("Error en generarFacturaARCA:", error);
    return { success: false, error: error.message || "Error interno al facturar" };
  }
}
