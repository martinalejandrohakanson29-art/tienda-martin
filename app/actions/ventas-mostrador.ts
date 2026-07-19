"use server"

import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache";
import { facturarVenta, generarNotaCredito, consultarPadron } from "./afip";
import { s3Client } from "@/lib/s3"
import {
  PutObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod"
import { requireAdmin } from "@/lib/auth-guard"
import { revertirMovimientoEnLedger } from "@/lib/proveedor-ledger"
import { triggerNotification } from "@/lib/notify"

// ─── Tipos compartidos ────────────────────────────────────────────────────────

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

interface ImpactoItem { id?: string; razonSocial?: string; monto: number }

// ─── Schemas de validación ────────────────────────────────────────────────────

const VentaItemSchema = z.object({
  productoId: z.string().optional(),
  id: z.string().optional(),
  nombre: z.string(),
  cantidad: z.number().int().min(0),
  precio_unit: z.number().min(0),
  subtotal: z.number().min(0),
  esNota: z.boolean().optional(),
})

const VentaBaseUpdateSchema = z.object({
  cliente: z.string().min(1),
  total: z.number().min(0),
  interes: z.number().min(0),
  totalFinal: z.number().min(0),
  metodo_pago: z.string(),
  items: z.array(VentaItemSchema).min(1),
  dni: z.string().nullish(),
  telefono: z.string().nullish(),
  info: z.string().nullish(),
  cupon: z.string().nullish(),
  transaccionId: z.string().nullish(),
  de: z.string().nullish(),
  para: z.string().nullish(),
  email: z.string().nullish(),
  eventoOffline: z.boolean().nullish(),
  puntoVentaId: z.string().nullish(),
  tipoEnvio: z.string().nullish(),
  mlIdVenta: z.string().nullish(),
  mlIdEnvio: z.string().nullish(),
  mlPackId: z.string().nullish(),
  mlMla: z.string().nullish(),
  mlDni: z.string().nullish(),
  tipoComprobante: z.number().optional(),
  docTipo: z.number().optional(),
  docNro: z.string().optional(),
  condicionIva: z.number().optional(),
})

const ActualizarVentaSchema = VentaBaseUpdateSchema.extend({
  cae: z.string().optional(),
  vencimientoCae: z.coerce.date().optional(),
  facturaNumero: z.number().optional(),
  facturaPuntoVenta: z.number().optional(),
  importeIva: z.number().optional(),
  alicuotaIva: z.number().optional(),
})

export type VentaItemData = z.infer<typeof VentaItemSchema>
export type ActualizarVentaData = z.infer<typeof ActualizarVentaSchema>
export type ActualizarPedidoData = z.infer<typeof VentaBaseUpdateSchema>

// ─── Helpers internos ────────────────────────────────────────────────────────

function parsearImpactos(para: string, montoTotal: number): ImpactoItem[] {
  let impactos: ImpactoItem[];
  try {
    const trimmed = para.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed);
      impactos = Array.isArray(parsed) ? parsed : [parsed];
    } else {
      return [{ razonSocial: para, monto: montoTotal }];
    }
  } catch {
    return [{ razonSocial: para, monto: montoTotal }];
  }

  // El monto guardado en cada item puede haber quedado desactualizado si el
  // total del pedido se editó después de fijar el reparto entre proveedores.
  // Reescalamos proporcionalmente para que la suma siempre coincida con el
  // total vigente (con un solo proveedor esto equivale a usar montoTotal directo).
  const sumaOriginal = impactos.reduce((acc, imp) => acc + (Number(imp.monto) || 0), 0);
  if (sumaOriginal > 0 && Math.abs(sumaOriginal - montoTotal) > 0.01) {
    const factor = montoTotal / sumaOriginal;
    impactos = impactos.map((imp) => ({
      ...imp,
      monto: Math.round((Number(imp.monto) || 0) * factor * 100) / 100,
    }));
  }

  return impactos;
}

async function resolverProveedor(tx: TxClient, imp: ImpactoItem) {
  const idBuscado = imp.id || imp.razonSocial;
  if (!idBuscado) return null;
  return (
    await tx.proveedor.findUnique({ where: { id: idBuscado } }).catch(() => null) ??
    await tx.proveedor.findFirst({ where: { razonSocial: idBuscado } })
  );
}

async function aplicarImpactoProveedorTx(
  tx: TxClient,
  para: string,
  montoTotal: number,
  descripcion: string,
  referencia: string,
) {
  const impactos = parsearImpactos(para, montoTotal);
  for (const imp of impactos) {
    const proveedor = await resolverProveedor(tx, imp);
    if (!proveedor) {
      console.warn(`[aplicarImpactoProveedorTx] Proveedor no encontrado: ${imp.id ?? imp.razonSocial}`);
      continue;
    }
    const monto = new Prisma.Decimal(imp.monto || montoTotal);
    if (monto.isZero()) continue;
    const nuevoSaldo = proveedor.total.plus(monto);
    await tx.proveedor.update({ where: { id: proveedor.id }, data: { total: nuevoSaldo } });
    await tx.movimientoProveedor.create({
      data: { proveedorId: proveedor.id, tipo: "HABER", monto, descripcion, referencia, saldo: nuevoSaldo },
    });
  }
}

async function revertirImpactoProveedorTx(
  tx: TxClient,
  para: string,
  montoTotal: number,
  ventaId: string,
) {
  const impactos = parsearImpactos(para, montoTotal);
  for (const imp of impactos) {
    const proveedor = await resolverProveedor(tx, imp);
    if (!proveedor) {
      console.warn(`[revertirImpactoProveedorTx] Proveedor no encontrado: ${imp.id ?? imp.razonSocial}`);
      continue;
    }
    const monto = new Prisma.Decimal(imp.monto || montoTotal);
    if (monto.isZero()) continue;
    const movsAAnular = await tx.movimientoProveedor.findMany({
      where: { referencia: ventaId, proveedorId: proveedor.id, anulado: false },
    });
    await tx.movimientoProveedor.updateMany({
      where: { referencia: ventaId, proveedorId: proveedor.id, anulado: false },
      data: { anulado: true },
    });
    for (const mov of movsAAnular) {
      await revertirMovimientoEnLedger(tx, mov.id);
    }
  }
}

type StockItem = { productoId?: string; id?: string; nombre?: string; cantidad: number }

async function ajustarStockItemsTx(
  tx: TxClient,
  items: StockItem[],
  modo: "decrement" | "increment",
) {
  for (const item of items) {
    const articuloId = item.productoId || item.id;
    if (!articuloId) continue;
    const articuloBase = await tx.articuloMostrador.findUnique({
      where: { id: articuloId },
      include: { packItems: true },
    });
    if (!articuloBase) {
      const nombre = item.nombre ? `"${item.nombre}"` : `ID "${articuloId}"`;
      throw new Error(`Artículo ${nombre} no encontrado en el sistema. Revisá el mapeo de artículos en la receta.`);
    }
    if (articuloBase.esPack && articuloBase.packItems.length > 0) {
      for (const packItem of articuloBase.packItems) {
        const componente = await tx.articuloMostrador.findUnique({
          where: { id: packItem.componenteId },
          select: { id: true, nombre: true },
        });
        if (!componente) {
          throw new Error(`Componente del pack "${articuloBase.nombre}" no encontrado: ID "${packItem.componenteId}". Revisá la composición del pack.`);
        }
        await tx.articuloMostrador.update({
          where: { id: packItem.componenteId },
          data: { stock: { [modo]: packItem.cantidad * item.cantidad } },
        });
      }
      const componentesActualizados = await tx.articuloMostrador.findMany({
        where: { id: { in: articuloBase.packItems.map(p => p.componenteId) } },
        select: { id: true, stock: true },
      });
      const stockMap = new Map(componentesActualizados.map(c => [c.id, c.stock]));
      const stockPack = Math.min(
        ...articuloBase.packItems.map(p => Math.floor((stockMap.get(p.componenteId) ?? 0) / p.cantidad))
      );
      await tx.articuloMostrador.update({
        where: { id: articuloId },
        data: { stock: stockPack },
      });
    } else {
      await tx.articuloMostrador.update({
        where: { id: articuloId },
        data: { stock: { [modo]: item.cantidad } },
      });
    }
  }
}

export async function obtenerTodosLosArticulos() {
  await requireAdmin();
  try {
    const articulos = await prisma.articuloMostrador.findMany({
      where: { oculto: false },
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

export async function obtenerVentasPorRango(fechaDesde: string, fechaHasta?: string, excluirML?: boolean) {
  await requireAdmin();
  try {
    const inicio = new Date(`${fechaDesde}T00:00:00-03:00`);
    const fin = new Date(`${fechaHasta ?? fechaDesde}T23:59:59.999-03:00`);

    const whereML = excluirML
      ? {
          mlIdVenta: null as null,
          NOT: {
            puntoVenta: {
              nombre: { contains: "mercadolibre", mode: "insensitive" as const },
            },
          },
        }
      : {};

    const ventas = await prisma.venta.findMany({
      where: {
        tipoVenta: { not: "PEDIDO" },
        createdAt: { gte: inicio, lte: fin },
        ...whereML,
      },
      include: { items: true, puntoVenta: true },
      orderBy: { createdAt: 'desc' },
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
          subtotal: Number(i.subtotal),
        })),
      })),
    };
  } catch (error) {
    console.error("Error al obtener ventas:", error);
    return { success: false, error: "Error al cargar el listado" };
  }
}

export const obtenerVentasPorFecha = (fecha: string) => obtenerVentasPorRango(fecha);

export async function obtenerRendimientoPorPuntoVenta(
  fechaDesde: string,
  fechaHasta: string,
  puntoVentaIds?: string[]
) {
  await requireAdmin();
  try {
    const inicio = new Date(`${fechaDesde}T00:00:00-03:00`);
    const fin = new Date(`${fechaHasta}T23:59:59.999-03:00`);

    const where: any = {
      tipoVenta: { not: "PEDIDO" },
      estadoPedido: { not: "CANCELADO" },
      createdAt: { gte: inicio, lte: fin },
    };

    if (puntoVentaIds && puntoVentaIds.length > 0) {
      where.puntoVentaId = { in: puntoVentaIds };
    }

    const [ventas, packsDef] = await Promise.all([
      prisma.venta.findMany({
        where,
        include: { items: true },
      }),
      prisma.articuloMostrador.findMany({
        where: { esPack: true },
        include: { packItems: true },
      }),
    ]);

    // Composición de cada pack (componenteId -> cantidad). Al vender un pack en "modo
    // expandido" (default del POS) la venta guarda los componentes individuales y se pierde
    // la referencia al pack; lo reconstruimos detectando qué componentes de cada venta
    // forman packs completos. Ordenamos por cantidad total de componentes (desc) para que
    // los packs más grandes se reconstruyan primero y no sean canibalizados por packs más
    // chicos que comparten componentes.
    const packs = packsDef
      .filter(p => p.packItems.length > 0)
      .map(p => ({
        nombre: p.nombre,
        componentes: p.packItems.map(pi => ({ componenteId: pi.componenteId, cantidad: pi.cantidad })),
        totalComponentes: p.packItems.reduce((s, pi) => s + pi.cantidad, 0),
      }))
      .sort((a, b) => b.totalComponentes - a.totalComponentes);

    const byArticulo: Record<string, { nombre: string; cantidad: number; monto: number; productoId?: string }> = {};
    const byPack: Record<string, { nombre: string; cantidad: number; monto: number }> = {};

    const acumular = (
      target: Record<string, { nombre: string; cantidad: number; monto: number; productoId?: string }>,
      nombre: string,
      cantidad: number,
      monto: number,
      productoId?: string,
    ) => {
      if (!target[nombre]) target[nombre] = { nombre, cantidad: 0, monto: 0 };
      target[nombre].cantidad += cantidad;
      target[nombre].monto += monto;
      if (productoId && !target[nombre].productoId) target[nombre].productoId = productoId;
    };

    for (const venta of ventas) {
      // Componentes disponibles de esta venta para reconstruir packs vendidos "expandidos"
      const disp: Record<string, { qty: number; monto: number; nombre: string }> = {};

      for (const item of venta.items) {
        if (item.esNota) continue;
        // Pack vendido en "modo pack": el item ya es el pack (ID "PACK-{timestamp}")
        if (item.productoId?.startsWith("PACK-")) {
          acumular(byPack, item.nombre, item.cantidad, Number(item.subtotal));
          continue;
        }
        const pid = item.productoId;
        if (!pid) {
          // Sin productoId no se puede asociar a la composición de un pack
          acumular(byArticulo, item.nombre, item.cantidad, Number(item.subtotal));
          continue;
        }
        if (!disp[pid]) disp[pid] = { qty: 0, monto: 0, nombre: item.nombre };
        disp[pid].qty += item.cantidad;
        disp[pid].monto += Number(item.subtotal);
      }

      // Reconstruir packs completos a partir de los componentes disponibles
      for (const pack of packs) {
        let copias = Infinity;
        for (const comp of pack.componentes) {
          const d = disp[comp.componenteId];
          const posibles = d ? Math.floor(d.qty / comp.cantidad) : 0;
          if (posibles < copias) copias = posibles;
          if (copias === 0) break;
        }
        if (!isFinite(copias) || copias <= 0) continue;

        // Consumir los componentes y acumular el monto realmente cobrado en esas líneas
        let montoPack = 0;
        for (const comp of pack.componentes) {
          const d = disp[comp.componenteId];
          const consumir = comp.cantidad * copias;
          const precioUnit = d.qty > 0 ? d.monto / d.qty : 0;
          const montoConsumido = precioUnit * consumir;
          d.qty -= consumir;
          d.monto -= montoConsumido;
          montoPack += montoConsumido;
        }
        acumular(byPack, pack.nombre, copias, montoPack);
      }

      // Lo que sobró de componentes se cuenta como artículos individuales
      for (const [pid, d] of Object.entries(disp)) {
        if (d.qty > 0) acumular(byArticulo, d.nombre, d.qty, d.monto, pid);
      }
    }

    // ─── Costos unitarios ───────────────────────────────────────────────────
    // Fuentes: CostosArticulos (SKU ML) y ArticuloMostrador.costo (POS). Para los packs
    // el costo unitario es la suma de los costos de sus componentes; si a algún componente
    // le falta el costo, el pack queda sin costo (X roja en la UI).
    const idsArticulos = Object.values(byArticulo).map(a => a.productoId).filter(Boolean) as string[];
    const idsComponentes = packsDef.flatMap(p => p.packItems.map(pi => pi.componenteId));
    const todosIds = Array.from(new Set([...idsArticulos, ...idsComponentes]));

    const [costosArt, costosPos] = await Promise.all([
      todosIds.length > 0
        ? prisma.costosArticulos.findMany({
            where: { id_articulo: { in: todosIds } },
            select: { id_articulo: true, costo_final_ars: true },
          })
        : [],
      todosIds.length > 0
        ? prisma.articuloMostrador.findMany({
            where: { id: { in: todosIds } },
            select: { id: true, costo: true },
          })
        : [],
    ]);

    const costoArtMap = new Map(
      costosArt.filter(c => c.costo_final_ars !== null).map(c => [c.id_articulo, Number(c.costo_final_ars)])
    );
    const costoPosMap = new Map(
      costosPos.filter(c => c.costo !== null).map(c => [c.id, Number(c.costo)])
    );
    // Un costo de 0 (default de la columna) se considera "sin cargar" → null
    const costoUnit = (id: string): number | null => {
      const c = costoArtMap.get(id) ?? costoPosMap.get(id);
      return c && c > 0 ? c : null;
    };

    const costoPackPorNombre = new Map<string, number | null>();
    for (const p of packsDef) {
      if (p.packItems.length === 0) continue;
      let total = 0;
      let completo = true;
      for (const pi of p.packItems) {
        const cu = costoUnit(pi.componenteId);
        if (cu === null) { completo = false; break; }
        total += cu * pi.cantidad;
      }
      costoPackPorNombre.set(p.nombre, completo ? total : null);
    }

    return {
      success: true,
      data: {
        articulos: Object.values(byArticulo)
          .map(a => ({
            nombre: a.nombre,
            cantidad: a.cantidad,
            monto: a.monto,
            costo: a.productoId ? costoUnit(a.productoId) : null,
          }))
          .sort((a, b) => b.cantidad - a.cantidad),
        packs: Object.values(byPack)
          .map(p => ({
            nombre: p.nombre,
            cantidad: p.cantidad,
            monto: p.monto,
            costo: costoPackPorNombre.get(p.nombre) ?? null,
          }))
          .sort((a, b) => b.cantidad - a.cantidad),
        totalVentas: ventas.length,
      },
    };
  } catch (error) {
    console.error("Error al obtener rendimiento por punto de venta:", error);
    return { success: false, error: "Error al obtener los datos" };
  }
}

export async function exportarVentasListadoParaExcel(
  fechaDesde: string,
  fechaHasta: string,
  puntoVentaIds?: string[]
) {
  await requireAdmin();
  try {
    const inicio = new Date(`${fechaDesde}T00:00:00-03:00`);
    const fin = new Date(`${fechaHasta}T23:59:59.999-03:00`);

    const where: any = {
      tipoVenta: { not: "PEDIDO" },
      createdAt: { gte: inicio, lte: fin },
    };

    if (puntoVentaIds && puntoVentaIds.length > 0) {
      where.puntoVentaId = { in: puntoVentaIds };
    }

    const ventas = await prisma.venta.findMany({
      where,
      include: { items: true, puntoVenta: true },
      orderBy: { createdAt: "asc" },
    });

    return ventas.map(v => ({
      id: v.id,
      numeroVenta: v.numeroVenta,
      createdAt: v.createdAt.toISOString(),
      cliente: v.cliente,
      metodo_pago: v.metodo_pago,
      totalFinal: Number(v.totalFinal),
      puntoVenta: v.puntoVenta?.nombre ?? null,
      items: v.items.map(i => ({
        nombre: i.nombre,
        cantidad: i.cantidad,
        precio_unit: Number(i.precio_unit),
        subtotal: Number(i.subtotal),
      })),
    }));
  } catch (error) {
    console.error("Error al exportar ventas:", error);
    return [];
  }
}

export async function obtenerVentasMLPorRango(fechaDesde: string, fechaHasta?: string) {
  await requireAdmin();
  try {
    const inicio = new Date(`${fechaDesde}T00:00:00-03:00`);
    const fin = new Date(`${fechaHasta ?? fechaDesde}T23:59:59.999-03:00`);

    const ventas = await prisma.venta.findMany({
      where: {
        tipoVenta: { not: "PEDIDO" },
        createdAt: { gte: inicio, lte: fin },
        OR: [
          { mlIdVenta: { not: null } },
          { puntoVenta: { nombre: { contains: "mercadolibre", mode: "insensitive" } } },
        ],
      },
      include: { items: true, puntoVenta: true },
      orderBy: { createdAt: 'desc' },
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
          subtotal: Number(i.subtotal),
        })),
      })),
    };
  } catch (error) {
    console.error("Error al obtener ventas ML:", error);
    return { success: false, error: "Error al cargar ventas de MercadoLibre" };
  }
}

export async function obtenerVentasRendimiento(fechaDesde: string, fechaHasta: string) {
  await requireAdmin();
  try {
    const inicio = new Date(`${fechaDesde}T00:00:00-03:00`);
    const fin = new Date(`${fechaHasta}T23:59:59.999-03:00`);

    const ventas = await prisma.venta.findMany({
      where: {
        tipoVenta: { not: "PEDIDO" },
        createdAt: { gte: inicio, lte: fin },
      },
      include: { items: true, puntoVenta: true },
      orderBy: { createdAt: 'desc' },
    });

    // Batch: recolectar todos los productoId de los items
    const todosLosIds = Array.from(new Set(
      ventas.flatMap(v => v.items.map(i => i.productoId).filter(Boolean) as string[])
    ));

    // Buscar costos en CostosArticulos (ventas ML) y ArticuloMostrador (ventas POS) en paralelo
    const [costosArt, costosPos] = await Promise.all([
      todosLosIds.length > 0
        ? prisma.costosArticulos.findMany({
            where: { id_articulo: { in: todosLosIds } },
            select: { id_articulo: true, costo_final_ars: true },
          })
        : [],
      todosLosIds.length > 0
        ? prisma.articuloMostrador.findMany({
            where: { id: { in: todosLosIds } },
            select: { id: true, costo: true },
          })
        : [],
    ]);

    const costoArtMap = new Map(
      costosArt
        .filter(c => c.costo_final_ars !== null)
        .map(c => [c.id_articulo, Number(c.costo_final_ars)])
    );
    const costoPosMap = new Map(
      costosPos
        .filter(c => c.costo !== null)
        .map(c => [c.id, Number(c.costo)])
    );

    return {
      success: true,
      data: ventas.map(v => {
        const esML = !!v.mlIdVenta;
        const neto = esML ? Number(v.total) : Number(v.totalFinal || v.total);

        let costoTotal = 0;
        let tieneCostoParcial = false;

        for (const item of v.items) {
          if (!item.productoId) { tieneCostoParcial = true; continue; }
          // Prioridad: CostosArticulos (SKU ML), luego ArticuloMostrador (POS)
          const costo = costoArtMap.get(item.productoId) ?? costoPosMap.get(item.productoId);
          if (costo !== undefined) {
            costoTotal += costo * item.cantidad;
          } else {
            tieneCostoParcial = true;
          }
        }

        const ganancia = neto - costoTotal;
        const margenPct = costoTotal > 0 ? (ganancia / costoTotal) * 100 : null;

        return {
          id: v.id,
          numeroVenta: v.numeroVenta,
          createdAt: v.createdAt.toISOString(),
          cliente: v.cliente,
          metodo_pago: v.metodo_pago,
          mlIdVenta: v.mlIdVenta,
          cupon: v.cupon,
          de: v.de,
          puntoVenta: v.puntoVenta || null,
          total: Number(v.total),
          totalFinal: Number(v.totalFinal),
          interes: Number(v.interes),
          neto,
          costoTotal,
          ganancia,
          margenPct,
          tieneCostoParcial,
          itemsCount: v.items.length,
          items: v.items.map(i => ({
            id: i.id,
            productoId: i.productoId,
            nombre: i.nombre,
            cantidad: i.cantidad,
            precio_unit: Number(i.precio_unit),
            subtotal: Number(i.subtotal),
            costo: i.productoId
              ? (costoArtMap.get(i.productoId) ?? costoPosMap.get(i.productoId) ?? null)
              : null,
          })),
        };
      }),
    };
  } catch (error) {
    console.error("Error al obtener rendimiento de ventas:", error);
    return { success: false, error: "Error al cargar el rendimiento" };
  }
}

export async function marcarVentaComoRegistrada(id: string) {
  await requireAdmin();
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

  // 1. Intentar parsear como JSON primero (formato nuevo de PedidosVentaEdicionClient)
  try {
    if (info.trim().startsWith('{')) {
      const data = JSON.parse(info);
      if (data.metodo1 === label) return Number(data.monto1) || 0;
      if (data.metodo2 === label) return Number(data.monto2) || 0;
      // También soportar campos simples si se guardan así
      if (data[label]) return Number(data[label]) || 0;
    }
  } catch (e) {
    // No era JSON, continuar con regex
  }

  // 2. Formato esperado: [Mixto -> Metodo1: $1.234,56 | Metodo2: $7.890,12]
  // La expresión regular busca el label seguido de dos puntos, espacio, signo pesos y el valor numérico
  // Soportamos tanto con signo pesos como sin él, y con puntos/comas o solo puntos
  const regex = new RegExp(`${label}:\\s*\\$?([0-9.,]+)`, "i");
  const match = info.match(regex);
  if (match && match[1]) {
    // En AR el formato suele ser 1.234,56 -> quitamos puntos de miles y cambiamos coma por punto decimal
    // Pero si el valor ya viene como 1234.56 lo detectamos
    let valueStr = match[1];

    // Si tiene coma y punto, asumimos punto miles y coma decimal (formato AR: 1.234,56)
    if (valueStr.includes(',') && valueStr.includes('.')) {
      valueStr = valueStr.replace(/\./g, '').replace(',', '.');
    } else if (valueStr.includes(',')) {
      // Si solo tiene coma, asumimos que es el separador decimal (formato: 1234,56)
      valueStr = valueStr.replace(',', '.');
    } else if (valueStr.includes('.')) {
      // En AR, toLocaleString('es-AR') usa el punto como separador de miles.
      // Si solo hay un punto y está seguido de exactamente 3 dígitos, es muy probable que sea miles.
      // Ejemplo: "143.100" -> "143100". Si fuera decimal sería "143,100" o "143.1"
      const parts = valueStr.split('.');
      if (parts[parts.length - 1].length === 3) {
        valueStr = valueStr.replace(/\./g, '');
      }
    }

    const parsed = parseFloat(valueStr);
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
  items: VentaItemData[],
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
  solicitarFactura?: boolean,
  // ARCA fields directos
  cae?: string,
  vencimientoCae?: Date,
  facturaNumero?: number,
  facturaPuntoVenta?: number,
  tipoComprobante?: number,
  docTipo?: number,
  docNro?: string,
  condicionIva?: number,
  importeIva?: number,
  alicuotaIva?: number,
  mlIdVenta?: string,
  mlIdEnvio?: string,
  mlPackId?: string,
  mlMla?: string,
  mlDni?: string,
  // Fecha original de la venta (ej: fecha real de ML, para que el registro quede en el día correcto)
  fechaOriginal?: Date,
}) {
  const session = await requireAdmin();
  const currentUserId = (session.user as any).id as string | undefined
  try {
    let arcaData = {
      cae: data.cae,
      vencimientoCae: data.vencimientoCae,
      facturaNumero: data.facturaNumero,
      facturaPuntoVenta: data.facturaPuntoVenta || 9,
      tipoComprobante: data.tipoComprobante,
      docTipo: data.docTipo,
      docNro: data.docNro,
      condicionIva: data.condicionIva,
      importeIva: data.importeIva,
      alicuotaIva: data.alicuotaIva
    };

    // 1. Si se solicita factura automática y no tiene CAE, intentamos facturar ahora
    if (data.solicitarFactura && !arcaData.cae) {
      const resAfip = await facturarVenta({
        monto: data.totalFinal,
        docTipo: data.docTipo || 99,
        docNro: parseInt((data.docNro || "0").replace(/\D/g, '')),
        ivaReceptor: data.condicionIva || 5,
        tipoComprobante: data.tipoComprobante || 6 // Por defecto B
      });

      if (resAfip.success) {
        arcaData.cae = resAfip.cae;
        if (resAfip.vencimiento) {
          arcaData.vencimientoCae = new Date(resAfip.vencimiento.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
        }
        arcaData.facturaNumero = resAfip.numero;
        arcaData.tipoComprobante = data.tipoComprobante || 6;
      } else {
        return {
          success: false,
          error: `Error ARCA: ${resAfip.error || 'No se pudo autorizar el comprobante'}${resAfip.details ? ' - ' + resAfip.details : ''}`
        };
      }
    }

    // Usamos transacción para asegurar que Venta, Stock y Sujeto se actualicen juntos
    const result = await prisma.$transaction(async (tx) => {
      // 2. Manejo automático del "Sujeto" (Cliente/Proveedor)
      let sujetoId = null;
      if (data.docNro && data.docNro !== "0") {
        const existingSujeto = await tx.proveedor.findFirst({
          where: { cuit: data.docNro }
        });

        if (existingSujeto) {
          await tx.proveedor.update({
            where: { id: existingSujeto.id },
            data: {
              razonSocial: data.cliente,
              email: data.email || existingSujeto.email,
              telefono: data.telefono || existingSujeto.telefono,
              docTipo: arcaData.docTipo,
              condicionIva: arcaData.condicionIva
            }
          });
          sujetoId = existingSujeto.id;
        } else {
          const newSujeto = await tx.proveedor.create({
            data: {
              razonSocial: data.cliente,
              cuit: data.docNro,
              email: data.email,
              telefono: data.telefono,
              docTipo: arcaData.docTipo,
              condicionIva: arcaData.condicionIva
            }
          });
          sujetoId = newSujeto.id;
        }
      }

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
          sujetoId: sujetoId,
          // ARCA fields
          cae: arcaData.cae,
          vencimientoCae: arcaData.vencimientoCae,
          facturaNumero: arcaData.facturaNumero,
          facturaPuntoVenta: arcaData.facturaPuntoVenta,
          tipoComprobante: arcaData.tipoComprobante,
          docTipo: arcaData.docTipo,
          docNro: arcaData.docNro,
          condicionIva: arcaData.condicionIva,
          importeIva: arcaData.importeIva,
          alicuotaIva: arcaData.alicuotaIva,
          mlIdVenta: data.mlIdVenta || null,
          mlIdEnvio: data.mlIdEnvio,
          mlPackId: data.mlPackId,
          mlMla: data.mlMla,
          mlDni: data.mlDni,
          // Si viene fecha original (ej. de ML), la usamos: trae el día real de la venta combinado
          // con la hora real de registración (ver combinarDiaVentaMLConHoraReal en actions/envios.ts)
          ...(data.fechaOriginal ? { createdAt: data.fechaOriginal } : {}),
          items: {
            create: data.items.map(item => ({
              productoId: item.productoId || item.id,
              nombre: item.nombre,
              cantidad: item.cantidad,
              precio_unit: item.precio_unit,
              subtotal: item.subtotal,
              esNota: item.esNota ?? false,
            }))
          }
        }
      });

      await ajustarStockItemsTx(tx, data.items.filter(i => !i.esNota), "decrement");

      const montoImpactoVal = getMontoImpactoProveedor(data.metodo_pago, data.info, data.totalFinal);
      if (montoImpactoVal > 0 && data.para) {
        const desc = `${data.metodo_pago === "Cruzada" ? "Pago de venta" : data.metodo_pago === "Mixto" ? "Venta Mixta (Cruzada/CC)" : "Venta a CC"} #${venta.numeroVenta} (${data.cliente})`;
        await aplicarImpactoProveedorTx(tx, data.para, montoImpactoVal, desc, venta.id);
      }

      return venta;
    }, { timeout: 20000 });

    triggerNotification({
      eventType: "VENTA_MOSTRADOR_CREADA",
      sourceUserId: currentUserId,
      title: `Nueva venta de mostrador #${result.numeroVenta}`,
      body: `Cliente: ${data.cliente} — Total: $${Number(data.totalFinal).toLocaleString("es-AR")}`,
    })
    return { success: true, id: result.id, numeroVenta: result.numeroVenta };
  } catch (error) {
    console.error("Error al crear venta:", error);
    const mensaje = error instanceof Error ? error.message : "No se pudo guardar la venta";
    return { success: false, error: mensaje };
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
  alicuotaIva?: number,
  mlIdVenta?: string,
  mlIdEnvio?: string,
  mlPackId?: string,
  mlMla?: string,
  mlDni?: string,
  tipoEnvio?: string
}) {
  await requireAdmin();
  try {
    // Usamos transacción para asegurar que Venta y Stock se actualicen juntos
    const result = await prisma.$transaction(async (tx) => {
      // 1. Manejo automático del "Sujeto" (Cliente/Proveedor) por DNI/CUIT
      let sujetoId = null;
      if (data.docNro && data.docNro !== "0") {
        const existingSujeto = await tx.proveedor.findFirst({
          where: { cuit: data.docNro }
        });

        if (existingSujeto) {
          await tx.proveedor.update({
            where: { id: existingSujeto.id },
            data: {
              razonSocial: data.cliente,
              email: data.email || existingSujeto.email,
              telefono: data.telefono || existingSujeto.telefono,
              docTipo: data.docTipo,
              condicionIva: data.condicionIva
            }
          });
          sujetoId = existingSujeto.id;
        } else {
          const newSujeto = await tx.proveedor.create({
            data: {
              razonSocial: data.cliente,
              cuit: data.docNro,
              email: data.email,
              telefono: data.telefono,
              docTipo: data.docTipo,
              condicionIva: data.condicionIva
            }
          });
          sujetoId = newSujeto.id;
        }
      }

      const venta = await tx.venta.create({
        data: {
          cliente: data.cliente,
          vendedor: data.vendedor,
          total: data.total,
          interes: data.interes,
          totalFinal: data.totalFinal,
          tipoVenta: "PEDIDO", // Marcar como pedido de venta
          tipoEnvio: data.tipoEnvio || "andreani",
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
          sujetoId: sujetoId,
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
          mlIdVenta: data.mlIdVenta || null,
          mlIdEnvio: data.mlIdEnvio,
          mlPackId: data.mlPackId,
          mlMla: data.mlMla,
          mlDni: data.mlDni,
          items: {
            create: data.items.map(item => ({
              productoId: item.productoId || item.id,
              nombre: item.nombre,
              cantidad: item.cantidad,
              precio_unit: item.precio_unit,
              subtotal: item.subtotal,
              esNota: item.esNota ?? false,
            }))
          }
        }
      });

      await ajustarStockItemsTx(tx, data.items.filter((i: any) => !i.esNota), "decrement");

      const montoImpactoVal = getMontoImpactoProveedor(data.metodo_pago, data.info, data.totalFinal);
      if (montoImpactoVal > 0 && data.para) {
        const desc = `${data.metodo_pago === "Cruzada" ? "Pago de venta (Pedido)" : data.metodo_pago === "Mixto" ? "Venta Mixta (Pedido)" : "Venta a CC (Pedido)"} #${venta.numeroVenta} (${data.cliente})`;
        await aplicarImpactoProveedorTx(tx, data.para, montoImpactoVal, desc, venta.id);
      }

      return venta;
    }, { timeout: 20000 });

    return { success: true, id: result.id, numeroVenta: result.numeroVenta };
  } catch (error) {
    console.error("Error al guardar como pedido de venta:", error);
    return { success: false, error: "No se pudo guardar el pedido de venta" };
  }
}

// --- FUNCIONES PARA EDICIÓN Y AUDITORÍA ---

export async function actualizarVentaMostrador(ventaId: string, rawData: unknown, usuario: string, detalleCambios: string) {
  await requireAdmin();
  const parsed = ActualizarVentaSchema.safeParse(rawData);
  if (!parsed.success) {
    console.error("[actualizarVentaMostrador] datos inválidos:", parsed.error.flatten());
    return { success: false, error: "Datos de venta inválidos" };
  }
  const data = parsed.data;

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
      const montoRevertirVal = (oldVenta && esMetodoImpactoOld) ? getMontoImpactoProveedor(oldVenta.metodo_pago, oldVenta.info, Number(oldVenta.totalFinal)) : 0;
      const montoImpactoNewVal = getMontoImpactoProveedor(data.metodo_pago, data.info, data.totalFinal);
      const esMismoImpacto = oldVenta && oldVenta.para === data.para && montoRevertirVal === montoImpactoNewVal && montoRevertirVal > 0 && oldVenta.metodo_pago === data.metodo_pago;

      if (oldVenta && esMetodoImpactoOld && !esMismoImpacto && oldVenta.para) {
        await revertirImpactoProveedorTx(tx, oldVenta.para, montoRevertirVal, ventaId);
      }

      await ajustarStockItemsTx(tx, oldItems.filter(i => i.productoId).map(i => ({ productoId: i.productoId!, cantidad: i.cantidad })), "increment");

      await tx.ventaItem.deleteMany({ where: { ventaId } });

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
          eventoOffline: data.eventoOffline ?? undefined,
          puntoVentaId: data.puntoVentaId || null,
          tipoEnvio: data.tipoEnvio ?? undefined,
          mlIdVenta: data.mlIdVenta || null,
          mlIdEnvio: data.mlIdEnvio,
          mlPackId: data.mlPackId,
          mlMla: data.mlMla,
          mlDni: data.mlDni,
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
            create: data.items.map((item) => ({
              productoId: item.productoId || item.id,
              nombre: item.nombre,
              cantidad: item.cantidad,
              precio_unit: item.precio_unit,
              subtotal: item.subtotal
            }))
          }
        }
      });

      if (montoImpactoNewVal > 0 && data.para && !esMismoImpacto) {
        const desc = `EDICIÓN: ${data.metodo_pago === "Cruzada" ? "Pago de venta" : data.metodo_pago === "Mixto" ? "Venta Mixta (Cruzada/CC)" : "Venta a CC"} #${oldVenta?.numeroVenta} (${data.cliente})`;
        await aplicarImpactoProveedorTx(tx, data.para, montoImpactoNewVal, desc, ventaId);
      }

      await ajustarStockItemsTx(tx, data.items, "decrement");

      await tx.ventaAuditoria.create({
        data: {
          ventaId: ventaId,
          usuario: usuario,
          accion: "EDICION_VENTA",
          detalle: detalleCambios
        }
      });
    }, { timeout: 20000 });

    revalidatePath("/admin/ventas-mostrador");
    return { success: true };
  } catch (error) {
    console.error("Error al actualizar venta:", error);
    return { success: false, error: "No se pudo modificar la venta" };
  }
}

export async function obtenerHistorialVenta(ventaId: string) {
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();
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

      const esMetodoImpactoDel = venta && (venta.metodo_pago === "Cruzada" || venta.metodo_pago === "A Cuenta Corriente" || venta.metodo_pago === "Mixto");
      if (venta && esMetodoImpactoDel && venta.para) {
        const montoRevertirVal = getMontoImpactoProveedor(venta.metodo_pago, venta.info, Number(venta.totalFinal));
        if (montoRevertirVal > 0) {
          await revertirImpactoProveedorTx(tx, venta.para, montoRevertirVal, ventaId);
        }
      }

      await tx.ventaAuditoria.create({
        data: { ventaId, usuario, accion: "ELIMINACION_VENTA", detalle: `Venta eliminada por ${usuario}` }
      });

      await ajustarStockItemsTx(tx, items.filter(i => i.productoId).map(i => ({ productoId: i.productoId!, cantidad: i.cantidad })), "increment");

      await tx.venta.delete({ where: { id: ventaId } });
    }, { timeout: 20000 });

    return { success: true };
  } catch (error) {
    console.error("Error al eliminar venta:", error);
    return { success: false, error: "No se pudo eliminar la venta" };
  }
}

export async function obtenerPedidosAndreaniPendientes(estadoFiltro?: string) {
  await requireAdmin();
  try {
    const estadosDefault = ["LISTO_PARA_PREPARAR", "LISTO P/PREPARAR", "PREPARADO", "PENDIENTE"];
    const whereEstado = (!estadoFiltro || estadoFiltro === "TODOS")
      ? { estadoPedido: { in: estadosDefault } }
      : { estadoPedido: estadoFiltro };
    const ventas = await prisma.venta.findMany({
      where: {
        tipoVenta: "PEDIDO",
        ...whereEstado,
        tipoEnvio: {
          in: ["andreani", "ANDREANI"],
        },
      },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
    return ventas.map(v => ({
      ...v,
      total: Number(v.total),
      interes: Number(v.interes),
      totalFinal: Number(v.totalFinal),
      createdAt: v.createdAt.toISOString(),
      items: v.items.map(i => ({
        ...i,
        productoId: i.productoId || null,
        precio_unit: Number(i.precio_unit),
        subtotal: Number(i.subtotal),
      })),
    }));
  } catch (error) {
    console.error("Error al obtener pedidos Andreani pendientes:", error);
    return [];
  }
}

// Funciones para pedidos de venta
export async function obtenerPedidosVenta(fechaDesde: string, fechaHasta: string, estadoPedido?: string) {
  await requireAdmin();
  try {
    const inicioRango = new Date(`${fechaDesde}T00:00:00-03:00`);
    const finRango = new Date(`${fechaHasta}T23:59:59.999-03:00`);

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

export async function exportarPedidosVentaParaExcel(
  fechaDesde: string,
  fechaHasta: string,
  puntoVentaIds?: string[]
) {
  await requireAdmin();
  try {
    const inicioRango = new Date(`${fechaDesde}T00:00:00-03:00`);
    const finRango = new Date(`${fechaHasta}T23:59:59.999-03:00`);

    const where: any = {
      tipoVenta: "PEDIDO",
      createdAt: { gte: inicioRango, lte: finRango },
    };

    if (puntoVentaIds && puntoVentaIds.length > 0) {
      where.puntoVentaId = { in: puntoVentaIds };
    }

    const ventas = await prisma.venta.findMany({
      where,
      include: {
        items: true,
        puntoVenta: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return ventas.map(v => ({
      id: v.id,
      numeroVenta: v.numeroVenta,
      createdAt: v.createdAt.toISOString(),
      cliente: v.cliente,
      metodo_pago: v.metodo_pago,
      totalFinal: Number(v.totalFinal),
      puntoVenta: v.puntoVenta?.nombre ?? null,
      items: v.items.map(i => ({
        nombre: i.nombre,
        cantidad: i.cantidad,
        precio_unit: Number(i.precio_unit),
        subtotal: Number(i.subtotal),
      })),
    }));
  } catch (error) {
    console.error("Error al exportar pedidos:", error);
    return [];
  }
}

// Función para obtener un pedido por ID para editar
export async function obtenerPedidoPorId(ventaId: string) {
  await requireAdmin();
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
  const session = await requireAdmin();
  const currentUserId = (session.user as any).id as string | undefined
  try {
    const venta = await prisma.venta.update({
      where: { id: ventaId },
      data: { estadoPedido },
      select: { numeroVenta: true },
    });
    triggerNotification({
      eventType: "ESTADO_PEDIDO_CHANGED",
      sourceUserId: currentUserId,
      title: `Estado de pedido #${venta.numeroVenta} actualizado`,
      body: `Nuevo estado: ${estadoPedido}`,
    })
    revalidatePath("/admin/erp/pedidos-venta");
    revalidatePath("/admin/ventas-mostrador");
    return { success: true };
  } catch (error) {
    console.error("Error al actualizar estado del pedido:", error);
    return { success: false, error: "No se pudo actualizar el estado del pedido" };
  }
}

export async function actualizarTipoEnvioPedido(ventaId: string, tipoEnvio: string) {
  await requireAdmin();
  try {
    await prisma.venta.update({
      where: { id: ventaId },
      data: { tipoEnvio }
    });
    revalidatePath("/admin/erp/pedidos-venta");
    return { success: true };
  } catch (error) {
    console.error("Error al actualizar tipo de envío del pedido:", error);
    return { success: false, error: "No se pudo actualizar el tipo de envío" };
  }
}

export async function actualizarEstadoPedidoMasivo(ventaIds: string[], estadoPedido: string) {
  const session = await requireAdmin();
  const currentUserId = (session.user as any).id as string | undefined
  try {
    await prisma.venta.updateMany({
      where: { id: { in: ventaIds } },
      data: { estadoPedido }
    });
    triggerNotification({
      eventType: "ESTADO_PEDIDO_CHANGED",
      sourceUserId: currentUserId,
      title: `${ventaIds.length} pedido(s) actualizados`,
      body: `Nuevo estado: ${estadoPedido}`,
    })
    revalidatePath("/admin/erp/pedidos-venta");
    revalidatePath("/admin/ventas-mostrador");
    return { success: true };
  } catch (error) {
    console.error("Error al actualizar estados de pedidos:", error);
    return { success: false, error: "No se pudieron actualizar los estados de los pedidos" };
  }
}

// Función para actualizar un pedido de venta
export async function actualizarPedidoVenta(ventaId: string, rawData: unknown, usuario: string, detalleCambios: string) {
  await requireAdmin();
  const parsed = VentaBaseUpdateSchema.safeParse(rawData);
  if (!parsed.success) {
    console.error("[actualizarPedidoVenta] datos inválidos:", parsed.error.flatten());
    return { success: false, error: "Datos del pedido inválidos" };
  }
  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Obtener los items actuales para revertir el stock
      const oldItems = await tx.ventaItem.findMany({
        where: { ventaId }
      });

      // --- NUEVO: Revertir saldo de proveedor si el pedido anterior tenía impacto (Cruzada, CC o Mixto) ---
      const oldVenta = await tx.venta.findUnique({
        where: { id: ventaId }
      });

      const esMetodoImpactoOld = oldVenta && (oldVenta.metodo_pago === "Cruzada" || oldVenta.metodo_pago === "A Cuenta Corriente" || oldVenta.metodo_pago === "Mixto");
      const montoRevertirVal = (oldVenta && esMetodoImpactoOld) ? getMontoImpactoProveedor(oldVenta.metodo_pago, oldVenta.info, Number(oldVenta.totalFinal)) : 0;
      const montoImpactoNewVal = getMontoImpactoProveedor(data.metodo_pago, data.info, data.totalFinal);
      const esMismoImpacto = oldVenta && oldVenta.para === data.para && montoRevertirVal === montoImpactoNewVal && montoRevertirVal > 0 && oldVenta.metodo_pago === data.metodo_pago;

      if (oldVenta && esMetodoImpactoOld && !esMismoImpacto && oldVenta.para && montoRevertirVal > 0) {
        await revertirImpactoProveedorTx(tx, oldVenta.para, montoRevertirVal, ventaId);
      }

      await ajustarStockItemsTx(tx, oldItems.filter(i => i.productoId).map(i => ({ productoId: i.productoId!, cantidad: i.cantidad })), "increment");

      await tx.ventaItem.deleteMany({ where: { ventaId } });

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
          eventoOffline: data.eventoOffline ?? undefined,
          puntoVentaId: data.puntoVentaId || null,
          tipoEnvio: data.tipoEnvio ?? undefined,
          mlIdVenta: data.mlIdVenta || null,
          mlIdEnvio: data.mlIdEnvio,
          mlPackId: data.mlPackId,
          mlMla: data.mlMla,
          mlDni: data.mlDni,
          ...(data.tipoComprobante !== undefined && { tipoComprobante: data.tipoComprobante }),
          ...(data.docTipo !== undefined && { docTipo: data.docTipo }),
          ...(data.docNro !== undefined && { docNro: data.docNro }),
          ...(data.condicionIva !== undefined && { condicionIva: data.condicionIva }),
          items: {
            create: data.items.map((item) => ({
              productoId: item.productoId || item.id,
              nombre: item.nombre,
              cantidad: item.cantidad,
              precio_unit: item.precio_unit,
              subtotal: item.subtotal,
              esNota: item.esNota ?? false,
            }))
          }
        }
      });

      if (montoImpactoNewVal > 0 && data.para && !esMismoImpacto) {
        const desc = `EDICIÓN (Pedido): ${data.metodo_pago === "Cruzada" ? "Pago de venta" : data.metodo_pago === "Mixto" ? "Venta Mixta" : "Venta a CC"} #${oldVenta?.numeroVenta} (${data.cliente})`;
        await aplicarImpactoProveedorTx(tx, data.para, montoImpactoNewVal, desc, ventaId);
      }

      await ajustarStockItemsTx(tx, data.items.filter(i => !i.esNota), "decrement");

      await tx.ventaAuditoria.create({
        data: { ventaId, usuario, accion: "EDICION_PEDIDO_VENTA", detalle: detalleCambios }
      });
    }, {
      timeout: 20000
    });

    revalidatePath("/admin/erp/pedidos-venta");
    return { success: true };
  } catch (error) {
    console.error("Error al actualizar pedido de venta:", error);
    return { success: false, error: "No se pudo actualizar el pedido de venta" };
  }
}

export async function confirmarPedidoVenta(ventaId: string) {
  await requireAdmin();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const venta = await tx.venta.update({
        where: { id: ventaId },
        data: { tipoVenta: "CONFIRMADA" }
      });

      // --- NUEVO: Actualizar saldo de proveedor si el pago es "Cruzada", "A Cuenta Corriente" o "Mixto" ---
      // Verificamos si ya existe un movimiento para no duplicar (especialmente para Cruzada que ahora se imputa al crear el pedido)
      const movimientoExistente = await tx.movimientoProveedor.findFirst({
        where: { referencia: ventaId }
      });

      const montoImpactoVal = getMontoImpactoProveedor(venta.metodo_pago, venta.info, Number(venta.totalFinal));

      if (!movimientoExistente && montoImpactoVal > 0 && venta.para) {
        const desc = `${venta.metodo_pago === "Cruzada" ? "Pago de venta" : venta.metodo_pago === "Mixto" ? "Venta Mixta" : "Venta a CC"} #${venta.numeroVenta} (${venta.cliente}) - Confirmación Pedido`;
        await aplicarImpactoProveedorTx(tx, venta.para, montoImpactoVal, desc, venta.id);
      }

      return venta;
    });

    return { success: true, data: result };
  } catch (error) {
    console.error("Error al confirmar pedido de venta:", error);
    return { success: false, error: "No se pudo confirmar el pedido de venta" };
  }
}

// Revierte una venta ya registrada ("CONFIRMADA") de vuelta al estado de "pedido de venta"
// (tipoVenta: "PEDIDO"). Es la operación inversa a confirmarPedidoVenta: no toca stock ni
// movimientos de proveedor, porque un pedido de venta ya reserva stock e impacta cuenta
// corriente igual que una venta confirmada (ver guardarComoPedidoVenta/crearVentaMostrador).
export async function revertirVentaAPedido(ventaId: string, usuario: string) {
  await requireAdmin();
  try {
    const venta = await prisma.venta.findUnique({ where: { id: ventaId } });
    if (!venta) return { success: false, error: "Venta no encontrada" };
    if (venta.tipoVenta === "PEDIDO") {
      return { success: false, error: "Esta venta ya es un pedido de venta" };
    }
    if (venta.cae) {
      return { success: false, error: "No se puede volver a pedido una venta con factura ARCA emitida. Anulala con Nota de Crédito primero." };
    }
    if (venta.estadoPedido === "CANCELADO") {
      return { success: false, error: "La venta está anulada" };
    }

    await prisma.$transaction(async (tx) => {
      await tx.venta.update({
        where: { id: ventaId },
        data: { tipoVenta: "PEDIDO" }
      });
      await tx.ventaAuditoria.create({
        data: {
          ventaId,
          usuario,
          accion: "REVERTIDA_A_PEDIDO",
          detalle: `Venta #${venta.numeroVenta} (${venta.cliente}) revertida de "venta registrada" a "pedido de venta"`,
        }
      });
    });

    revalidatePath("/admin/ventas-mostrador");
    revalidatePath("/admin/erp/pedidos-venta");
    return { success: true };
  } catch (error) {
    console.error("Error al revertir venta a pedido:", error);
    return { success: false, error: "No se pudo revertir la venta a pedido" };
  }
}

export async function eliminarPedidoVenta(ventaId: string) {
  await requireAdmin();
  try {
    await prisma.$transaction(async (tx) => {
      const venta = await tx.venta.findUnique({
        where: { id: ventaId },
        include: { items: true }
      });

      if (!venta) throw new Error("Pedido no encontrado");

      const esMetodoImpactoDel = venta.metodo_pago === "Cruzada" || venta.metodo_pago === "A Cuenta Corriente" || venta.metodo_pago === "Mixto";
      if (esMetodoImpactoDel && venta.para) {
        const montoRevertir = getMontoImpactoProveedor(venta.metodo_pago, venta.info, Number(venta.totalFinal));
        if (montoRevertir > 0) {
          await revertirImpactoProveedorTx(tx, venta.para, montoRevertir, ventaId);
        }
      }

      await ajustarStockItemsTx(tx, venta.items.filter(i => i.productoId).map(i => ({ productoId: i.productoId!, cantidad: i.cantidad })), "increment");

      await tx.venta.delete({ where: { id: ventaId } });
    });

    return { success: true };
  } catch (error) {
    console.error("Error al eliminar pedido de venta:", error);
    return { success: false, error: "No se pudo eliminar el pedido de venta" };
  }
}

export async function subirPDFPedido(ventaId: string, formData: FormData) {
  const session = await requireAdmin();
  const currentUserId = (session.user as any).id as string | undefined
  const file = formData.get('file') as File;
  if (!file) return { success: false, error: "No se proporcionó ningún archivo" };

  if (file.type !== "application/pdf") {
    return { success: false, error: "Solo se aceptan archivos PDF" };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { success: false, error: "El archivo supera el límite de 10MB" };
  }

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

    const venta = await prisma.venta.update({
      where: { id: ventaId },
      data: { pdfUrl },
      select: { numeroVenta: true },
    });

    triggerNotification({
      eventType: "PEDIDO_VENTA_PDF_SUBIDO",
      sourceUserId: currentUserId,
      title: `PDF subido en pedido #${venta.numeroVenta}`,
      body: `Se cargó el comprobante PDF del pedido.`,
    })

    return { success: true, url: pdfUrl };
  } catch (error) {
    console.error("Error al subir PDF:", error);
    return { success: false, error: "Error al subir el archivo a S3" };
  }
}

export async function obtenerURLDescargaPDF(ventaId: string, fileName?: string) {
  await requireAdmin();
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
  const session = await requireAdmin();
  const currentUserId = (session.user as any).id as string | undefined
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

    triggerNotification({
      eventType: "PEDIDO_VENTA_PDF_SUBIDO",
      sourceUserId: currentUserId,
      title: `PDF subido en ${ventaIds.length} pedido(s)`,
      body: `Se cargó el comprobante PDF por lote.`,
    })

    return { success: true, url: pdfUrl };
  } catch (error) {
    console.error("Error al subir PDF por lote:", error);
    return { success: false, error: "Error al subir el archivo a S3" };
  }
}

export async function eliminarPDFPedido(ventaId: string) {
  await requireAdmin();
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
  await requireAdmin();
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
      docNro: (venta.docNro && venta.docNro !== "0") ? parseInt(venta.docNro.replace(/\D/g, '')) : 0,
      ivaReceptor: venta.condicionIva || 5,
      tipoComprobante: venta.tipoComprobante || undefined
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

export async function actualizarAlertaML(ventaId: string, alerta: boolean, observacion: string) {
  await requireAdmin();
  try {
    await prisma.venta.update({
      where: { id: ventaId },
      data: { mlAlerta: alerta, mlObservacion: observacion || null },
    });
    return { success: true };
  } catch (error) {
    console.error("Error al actualizar alerta ML:", error);
    return { success: false, error: "Error al guardar la alerta" };
  }
}

export async function cancelarVenta(ventaId: string) {
  await requireAdmin();
  const venta = await prisma.venta.findUnique({
    where: { id: ventaId },
    include: { items: true }
  });

  if (!venta) throw new Error("Venta no encontrada");

  const stockItems = venta.items
    .filter(i => i.productoId)
    .map(i => ({ productoId: i.productoId!, cantidad: i.cantidad }));

  if (venta.cae && !venta.info?.includes("ANULADA CON NC")) {
    // LIMPIEZA CRÍTICA: Quitamos guiones y espacios.
    // Si no hay docNro, probamos con dni (que a veces tiene el CUIT).
    const cuitLimpio = (venta.docNro || venta.dni || "0").replace(/\D/g, '');

    const resNC = await generarNotaCredito({
      total: Number(venta.totalFinal),
      docTipo: venta.docTipo || 99,
      docNro: cuitLimpio, // Lo pasamos como string de dígitos
      tipoFacturaOriginal: venta.tipoComprobante || 11,
      puntoVentaOriginal: venta.facturaPuntoVenta || 9,
      numeroFacturaOriginal: venta.facturaNumero || 0,
      condicionIva: venta.condicionIva || 5
    });

    if (resNC.success) {
      await prisma.$transaction(async (tx) => {
        await tx.venta.update({
          where: { id: ventaId },
          data: {
            estadoPedido: "CANCELADO",
            info: `ANULADA CON NC Nro: ${resNC.numero} - CAE: ${resNC.cae}`,
            cae: resNC.cae,
            facturaNumero: resNC.numero,
            tipoComprobante: resNC.tipoComprobante,
            vencimientoCae: resNC.vencimiento ? new Date(
              parseInt(resNC.vencimiento.substring(0, 4)),
              parseInt(resNC.vencimiento.substring(4, 6)) - 1,
              parseInt(resNC.vencimiento.substring(6, 8))
            ) : new Date(),
          }
        });
        const esMetodoImpacto = venta.metodo_pago === "Cruzada" || venta.metodo_pago === "A Cuenta Corriente" || venta.metodo_pago === "Mixto";
        if (esMetodoImpacto && venta.para) {
          const montoRevertir = getMontoImpactoProveedor(venta.metodo_pago, venta.info, Number(venta.totalFinal));
          if (montoRevertir > 0) {
            await revertirImpactoProveedorTx(tx, venta.para, montoRevertir, ventaId);
          }
        }
        await ajustarStockItemsTx(tx, stockItems, "increment");
      }, { timeout: 20000 });
      revalidatePath("/admin/ventas-mostrador");
      return { success: true, message: "Venta cancelada y Nota de Crédito generada." };
    } else {
      return {
        success: false,
        error: "Error en ARCA",
        details: (resNC as any).details || resNC.error
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.venta.update({
      where: { id: ventaId },
      data: { estadoPedido: "CANCELADO" }
    });
    const esMetodoImpacto = venta.metodo_pago === "Cruzada" || venta.metodo_pago === "A Cuenta Corriente" || venta.metodo_pago === "Mixto";
    if (esMetodoImpacto && venta.para) {
      const montoRevertir = getMontoImpactoProveedor(venta.metodo_pago, venta.info, Number(venta.totalFinal));
      if (montoRevertir > 0) {
        await revertirImpactoProveedorTx(tx, venta.para, montoRevertir, ventaId);
      }
    }
    await ajustarStockItemsTx(tx, stockItems, "increment");
  }, { timeout: 20000 });
  revalidatePath("/admin/ventas-mostrador");
  return { success: true, message: "Venta cancelada correctamente." };
}

// Convierte el vencimiento de ARCA (YYYYMMDD string) a Date
function parseVtoCae(vto?: string): Date {
  if (!vto || vto.length < 8) return new Date();
  return new Date(
    parseInt(vto.substring(0, 4)),
    parseInt(vto.substring(4, 6)) - 1,
    parseInt(vto.substring(6, 8))
  );
}

/**
 * Refactura una venta que se facturó como Consumidor Final (Factura B) cuando
 * el comprador, siendo Responsable Inscripto, solicita Factura A.
 *
 * Secuencia legal con ARCA:
 *   1. Valida que el CUIT sea Responsable Inscripto (padrón A5).
 *   2. Emite Nota de Crédito B asociada a la Factura B original (la anula).
 *   3. Emite Factura A con el CUIT del comprador, por el mismo importe.
 *
 * NO toca stock ni el estado de la venta: la operación es real y ya se despachó.
 * Snapshotea la Factura B original y registra el estado previo completo en
 * auditoría, de modo que no se pierde ningún dato existente.
 */
export async function refacturarComoA(ventaId: string, cuitInput: string) {
  const session = await requireAdmin();
  const usuario = (session.user as any)?.name || (session.user as any)?.email || "Admin";

  try {
    const venta = await prisma.venta.findUnique({ where: { id: ventaId } });
    if (!venta) return { success: false, error: "Venta no encontrada" };
    if (!venta.cae) return { success: false, error: "La venta no tiene factura emitida en ARCA" };
    if (venta.tipoComprobante !== 6) {
      return { success: false, error: "Solo se puede refacturar como A una Factura B (Consumidor Final)" };
    }
    if (venta.info?.includes("REFACTURADA")) {
      return { success: false, error: "Esta venta ya fue refacturada anteriormente" };
    }

    const cuitLimpio = (cuitInput || "").replace(/\D/g, "");
    if (cuitLimpio.length !== 11) {
      return { success: false, error: "CUIT inválido: deben ser 11 dígitos" };
    }

    // 1. Validar condición frente al IVA: solo a un RI le corresponde Factura A
    const padron = await consultarPadron(cuitLimpio);
    if (!padron.success) {
      return { success: false, error: `No se pudo validar el CUIT en ARCA: ${padron.error}` };
    }
    if (padron.tipoFactura !== 1) {
      return {
        success: false,
        error: `El CUIT ${cuitLimpio} (${padron.nombre || "s/d"}) no es Responsable Inscripto. No corresponde Factura A.`,
      };
    }

    const total = Number(venta.totalFinal || venta.total);
    const neto = parseFloat((total / 1.21).toFixed(2));
    const importeIva = parseFloat((total - neto).toFixed(2));
    const ptoVtaOriginal = venta.facturaPuntoVenta || 9;

    // 2. Nota de Crédito B sobre la Factura B original
    const resNC = await generarNotaCredito({
      total,
      docTipo: venta.docTipo || 99,
      docNro: (venta.docNro || venta.dni || "0").replace(/\D/g, ""),
      tipoFacturaOriginal: venta.tipoComprobante, // 6
      puntoVentaOriginal: ptoVtaOriginal,
      numeroFacturaOriginal: venta.facturaNumero || 0,
      condicionIva: venta.condicionIva || 5,
    });
    if (!resNC.success) {
      return {
        success: false,
        error: "No se pudo generar la Nota de Crédito en ARCA",
        details: (resNC as any).details || resNC.error,
      };
    }

    // 3. Factura A con el CUIT del comprador (mismo importe)
    const resA = await facturarVenta({
      monto: total,
      docTipo: 80, // CUIT
      docNro: parseInt(cuitLimpio),
      ivaReceptor: 1, // Responsable Inscripto
      tipoComprobante: 1, // Factura A
    });
    if (!resA.success) {
      // CRÍTICO: ARCA no es transaccional. La NC ya quedó emitida con CAE.
      // La persistimos para no perder el dato ni re-emitirla, y avisamos.
      await prisma.comprobante.create({
        data: {
          ventaId,
          tipo: resNC.tipoComprobante!,
          puntoVenta: ptoVtaOriginal,
          numero: resNC.numero!,
          cae: resNC.cae!,
          vencimientoCae: parseVtoCae(resNC.vencimiento),
          docTipo: venta.docTipo,
          docNro: venta.docNro,
          condicionIva: venta.condicionIva,
          cliente: venta.cliente,
          total: new Prisma.Decimal(total),
          neto: new Prisma.Decimal(neto),
          importeIva: new Prisma.Decimal(importeIva),
          asociadoTipo: 6,
          asociadoPtoVta: ptoVtaOriginal,
          asociadoNumero: venta.facturaNumero || 0,
        },
      }).catch((e) => console.error("No se pudo persistir la NC huérfana:", e));

      return {
        success: false,
        error: `La Nota de Crédito Nro ${resNC.numero} se emitió en ARCA, pero la Factura A fue rechazada. La NC quedó registrada; revisá el motivo y reintentá. NO vuelvas a generar la NC.`,
        details: (resA as any).details || resA.error,
      };
    }

    // 4. Persistir todo en una transacción. No se toca stock ni estado.
    const infoOriginal = venta.info || "";
    await prisma.$transaction(async (tx) => {
      // 4a. Snapshot de la Factura B original (queda anulada por la NC)
      await tx.comprobante.create({
        data: {
          ventaId,
          tipo: 6,
          puntoVenta: ptoVtaOriginal,
          numero: venta.facturaNumero || 0,
          cae: venta.cae!,
          vencimientoCae: venta.vencimientoCae,
          docTipo: venta.docTipo,
          docNro: venta.docNro,
          condicionIva: venta.condicionIva,
          cliente: venta.cliente,
          total: new Prisma.Decimal(total),
          anulado: true,
        },
      });

      // 4b. Nota de Crédito B
      await tx.comprobante.create({
        data: {
          ventaId,
          tipo: resNC.tipoComprobante!,
          puntoVenta: ptoVtaOriginal,
          numero: resNC.numero!,
          cae: resNC.cae!,
          vencimientoCae: parseVtoCae(resNC.vencimiento),
          docTipo: venta.docTipo,
          docNro: venta.docNro,
          condicionIva: venta.condicionIva,
          cliente: venta.cliente,
          total: new Prisma.Decimal(total),
          neto: new Prisma.Decimal(neto),
          importeIva: new Prisma.Decimal(importeIva),
          asociadoTipo: 6,
          asociadoPtoVta: ptoVtaOriginal,
          asociadoNumero: venta.facturaNumero || 0,
        },
      });

      // 4c. Factura A nueva (comprobante vigente)
      await tx.comprobante.create({
        data: {
          ventaId,
          tipo: 1,
          puntoVenta: 9,
          numero: resA.numero!,
          cae: resA.cae!,
          vencimientoCae: parseVtoCae(resA.vencimiento),
          docTipo: 80,
          docNro: cuitLimpio,
          condicionIva: 1,
          cliente: padron.nombre || venta.cliente,
          total: new Prisma.Decimal(total),
          neto: new Prisma.Decimal(neto),
          importeIva: new Prisma.Decimal(importeIva),
        },
      });

      // 4d. La venta pasa a apuntar a la Factura A (vigente)
      await tx.venta.update({
        where: { id: ventaId },
        data: {
          cae: resA.cae,
          facturaNumero: resA.numero,
          facturaPuntoVenta: 9,
          tipoComprobante: 1,
          docTipo: 80,
          docNro: cuitLimpio,
          condicionIva: 1,
          cliente: padron.nombre || venta.cliente,
          vencimientoCae: parseVtoCae(resA.vencimiento),
          importeIva: new Prisma.Decimal(importeIva),
          alicuotaIva: 5,
          info: `${infoOriginal ? infoOriginal + " | " : ""}REFACTURADA: Factura B ${venta.facturaNumero} (PV ${ptoVtaOriginal}) anulada con NC ${resNC.numero}, emitida Factura A ${resA.numero} para CUIT ${cuitLimpio}`,
        },
      });

      // 4e. Auditoría con el estado fiscal previo completo (cero pérdida de datos)
      await tx.ventaAuditoria.create({
        data: {
          ventaId,
          usuario,
          accion: "REFACTURAR_A",
          detalle: JSON.stringify({
            resumen: `Factura B ${venta.facturaNumero} → NC ${resNC.numero} → Factura A ${resA.numero} (CUIT ${cuitLimpio})`,
            estadoPrevio: {
              cae: venta.cae,
              facturaNumero: venta.facturaNumero,
              facturaPuntoVenta: ptoVtaOriginal,
              tipoComprobante: venta.tipoComprobante,
              docTipo: venta.docTipo,
              docNro: venta.docNro,
              condicionIva: venta.condicionIva,
              cliente: venta.cliente,
              vencimientoCae: venta.vencimientoCae,
            },
          }),
        },
      });
    }, { timeout: 20000 });

    revalidatePath("/admin/ventas-mostrador");
    return {
      success: true,
      message: `Refacturada: Factura A ${resA.numero} emitida a nombre de ${padron.nombre || cuitLimpio}. Factura B ${venta.facturaNumero} anulada con NC ${resNC.numero}.`,
      facturaA: resA.numero,
      nc: resNC.numero,
      razonSocial: padron.nombre,
    };
  } catch (error: any) {
    console.error("Error en refacturarComoA:", error);
    return { success: false, error: error.message || "Error interno al refacturar" };
  }
}

export async function obtenerResumenVentas(fechaDesde: string, fechaHasta: string) {
  await requireAdmin();
  try {
    const inicio = new Date(`${fechaDesde}T00:00:00-03:00`);
    const fin = new Date(`${fechaHasta}T23:59:59.999-03:00`);

    const ventas = await prisma.venta.findMany({
      where: {
        tipoVenta: { not: "PEDIDO" },
        createdAt: { gte: inicio, lte: fin },
      },
      include: { items: true, puntoVenta: true },
      orderBy: { createdAt: "asc" },
    });

    // Para ventas de MercadoLibre: v.total = neto, v.totalFinal = bruto
    // Para el resto: v.totalFinal = el único valor (neto)
    const esML = (v: typeof ventas[0]) =>
      !!v.mlIdVenta || v.puntoVenta?.nombre?.toLowerCase().includes("mercadolibre");

    const netoVenta = (v: typeof ventas[0]) =>
      esML(v) ? Number(v.total) : Number(v.totalFinal || v.total);

    const brutoMLVenta = (v: typeof ventas[0]) =>
      esML(v) ? Number(v.totalFinal || v.total) : 0;

    const totalVentas = ventas.length;
    const montoNeto = ventas.reduce((s, v) => s + netoVenta(v), 0);
    const montoBrutoML = ventas.reduce((s, v) => s + brutoMLVenta(v), 0);
    const montoNetoML = ventas.filter(esML).reduce((s, v) => s + netoVenta(v), 0);
    const ticketPromedio = totalVentas > 0 ? montoNeto / totalVentas : 0;
    const facturadas = ventas.filter((v) => v.cae).length;

    const byDay: Record<string, { fecha: string; cantidad: number; bruto: number; neto: number; intereses: number }> = {};
    for (const v of ventas) {
      const fecha = v.createdAt.toISOString().split("T")[0];
      if (!byDay[fecha]) byDay[fecha] = { fecha, cantidad: 0, bruto: 0, neto: 0, intereses: 0 };
      byDay[fecha].cantidad++;
      byDay[fecha].neto += netoVenta(v);
      byDay[fecha].bruto += esML(v) ? brutoMLVenta(v) : netoVenta(v);
      byDay[fecha].intereses += esML(v) ? 0 : Number(v.interes);
    }

    const byMetodoPago: Record<string, { metodo: string; cantidad: number; monto: number }> = {};
    for (const v of ventas) {
      const metodo = v.metodo_pago || "Otro";
      if (!byMetodoPago[metodo]) byMetodoPago[metodo] = { metodo, cantidad: 0, monto: 0 };
      byMetodoPago[metodo].cantidad++;
      byMetodoPago[metodo].monto += netoVenta(v);
    }

    const byPuntoVenta: Record<string, { nombre: string; cantidad: number; monto: number; color: string }> = {};
    for (const v of ventas) {
      const nombre = v.puntoVenta?.nombre || "Sin punto de venta";
      const color = v.puntoVenta?.color || "#94a3b8";
      if (!byPuntoVenta[nombre]) byPuntoVenta[nombre] = { nombre, cantidad: 0, monto: 0, color };
      byPuntoVenta[nombre].cantidad++;
      byPuntoVenta[nombre].monto += netoVenta(v);
    }

    const byProducto: Record<string, { nombre: string; cantidad: number; monto: number }> = {};
    for (const v of ventas) {
      for (const item of v.items) {
        if (!byProducto[item.nombre]) byProducto[item.nombre] = { nombre: item.nombre, cantidad: 0, monto: 0 };
        byProducto[item.nombre].cantidad += item.cantidad;
        byProducto[item.nombre].monto += Number(item.subtotal);
      }
    }

    const byHora: Record<number, { hora: number; cantidad: number; monto: number }> = {};
    for (let h = 0; h < 24; h++) byHora[h] = { hora: h, cantidad: 0, monto: 0 };
    for (const v of ventas) {
      const hora = new Date(v.createdAt).getHours();
      byHora[hora].cantidad++;
      byHora[hora].monto += netoVenta(v);
    }

    return {
      success: true,
      data: {
        kpis: { totalVentas, montoNeto, montoBrutoML, montoNetoML, ticketPromedio, facturadas, noFacturadas: totalVentas - facturadas },
        porDia: Object.values(byDay),
        porMetodoPago: Object.values(byMetodoPago).sort((a, b) => b.monto - a.monto),
        porPuntoVenta: Object.values(byPuntoVenta).sort((a, b) => b.monto - a.monto),
        topProductos: Object.values(byProducto).sort((a, b) => b.cantidad - a.cantidad).slice(0, 15),
        porHora: Object.values(byHora),
      },
    };
  } catch (error) {
    console.error("Error al obtener resumen:", error);
    return { success: false, error: "Error al obtener resumen de ventas" };
  }
}

export async function buscarVentaGlobalPorMLId(mlId: string) {
  await requireAdmin();
  try {
    const term = mlId.trim();
    if (term.length < 4) return { success: false, error: "Ingresá al menos 4 caracteres" };

    const ventas = await prisma.venta.findMany({
      where: {
        tipoVenta: { not: "PEDIDO" },
        OR: [
          { mlIdVenta: { contains: term } },
          { mlIdEnvio: { contains: term } },
          { mlPackId: { contains: term } },
        ],
      },
      include: { items: true, puntoVenta: true },
      orderBy: { createdAt: "desc" },
      take: 20,
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
          subtotal: Number(i.subtotal),
        })),
      })),
    };
  } catch (error) {
    console.error("Error en búsqueda global ML:", error);
    return { success: false, error: "Error al buscar" };
  }
}
