"use server"

import { prisma } from "@/lib/prisma"

// Función para obtener todos los artículos para la vista de listas
export async function obtenerArticulosParaListas() {
  try {
    const articulos = await prisma.articuloMostrador.findMany({
      orderBy: { nombre: 'asc' },
      include: {
        packItems: {
          include: {
            componente: true
          }
        }
      }
    });

    return {
      success: true,
      data: articulos.map(art => ({
        id: art.id,
        nombre: art.nombre,
        precio: Number(art.precio),
        stock: art.stock,
        costo: Number(art.costo || 0),
        margenGanancia: Number(art.margenGanancia || 0),
        esPack: art.esPack || false,
        packItems: art.packItems?.map(packItem => ({
          ...packItem,
          componente: {
            ...packItem.componente,
            precio: Number(packItem.componente.precio),
            costo: Number(packItem.componente.costo || 0),
            margenGanancia: Number(packItem.componente.margenGanancia || 0)
          }
        })) || []
      }))
    };
  } catch (error) {
    console.error("Error al obtener artículos para listas:", error);
    return { success: false, error: "No se pudieron cargar los artículos." };
  }
}

// Función para editar un artículo desde la tabla de listas
export async function actualizarArticuloDesdeLista(id: string, nombre: string, precio: number, stock: number, costo?: number, margenGanancia?: number) {
  try {
    await prisma.articuloMostrador.update({
      where: { id },
      data: {
        nombre,
        precio,
        stock,
        costo,
        margenGanancia
      }
    });

    return { success: true };
  } catch (error) {
    console.error("Error al actualizar artículo:", error);
    return { success: false, error: "Ocurrió un error al guardar los cambios." };
  }
}

export async function crearArticuloMostrador(data: { id: string, nombre: string, precio: number, stock: number, costo?: number, margenGanancia?: number }) {
  try {
    const articulo = await prisma.articuloMostrador.create({
      data: {
        id: data.id,
        nombre: data.nombre,
        precio: data.precio,
        stock: data.stock,
        costo: data.costo || 0,
        margenGanancia: data.margenGanancia || 0,
        esPack: false
      }
    });

    return { success: true, data: articulo };
  } catch (error) {
    console.error("Error al crear artículo:", error);
    return { success: false, error: "No se pudo crear el artículo. Es posible que el ID ya exista." };
  }
}

// --- FUNCIONES PARA GESTIÓN DE PACKS ---

export async function obtenerPacks() {
  try {
    const packs = await prisma.articuloMostrador.findMany({
      where: { esPack: true },
      orderBy: { nombre: 'asc' },
      include: {
        packItems: {
          include: {
            componente: true
          }
        }
      }
    });

    return {
      success: true,
      data: packs.map(pack => ({
        id: pack.id,
        nombre: pack.nombre,
        precio: Number(pack.precio),
        stock: 0,
        esPack: true,
        packItems: pack.packItems?.map(packItem => ({
          ...packItem,
          componente: {
            ...packItem.componente,
            precio: Number(packItem.componente.precio),
            stock: packItem.componente.stock
          },
          cantidad: packItem.cantidad
        })) || []
      }))
    };
  } catch (error) {
    console.error("Error al obtener packs:", error);
    return { success: false, error: "No se pudieron cargar los packs." };
  }
}

export async function crearPackMostrador(data: { id: string, nombre: string, precio: number, componentes: { id: string, nombre: string, cantidad: number }[] }) {
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

export async function eliminarPack(id: string) {
  try {
    await prisma.$transaction(async (tx) => {
      // Eliminar los items del pack primero
      await tx.packMostradorItem.deleteMany({
        where: { packId: id }
      });

      // Luego eliminar el pack
      await tx.articuloMostrador.delete({
        where: { id }
      });
    });
    return { success: true };
  } catch (error) {
    console.error("Error al eliminar pack:", error);
    return { success: false, error: "No se pudo eliminar el pack" };
  }
}

export async function actualizarPack(id: string, nombre: string, precio: number, componentes: { id: string, nombre: string, cantidad: number }[]) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Actualizar el pack
      await tx.articuloMostrador.update({
        where: { id },
        data: {
          nombre,
          precio
        }
      });

      // Eliminar los items antiguos
      await tx.packMostradorItem.deleteMany({
        where: { packId: id }
      });

      // Crear los nuevos items
      if (componentes && componentes.length > 0) {
        await tx.packMostradorItem.createMany({
          data: componentes.map(c => ({
            packId: id,
            componenteId: c.id,
            cantidad: c.cantidad
          }))
        });
      }

      return await tx.articuloMostrador.findUnique({
        where: { id },
        include: {
          packItems: {
            include: {
              componente: true
            }
          }
        }
      });
    });
    return { success: true, data: result };
  } catch (error) {
    console.error("Error al actualizar pack:", error);
    return { success: false, error: "No se pudo actualizar el pack" };
  }
}
// --- FUNCIONES PARA GESTIÓN DE PROVEEDORES ---

export async function obtenerProveedores() {
  try {
    const proveedores = await prisma.proveedor.findMany({
      orderBy: { razonSocial: 'asc' },
    });

    return {
      success: true,
      data: proveedores.map(p => {
        const toNum = (val: any) => {
          if (val === null || val === undefined) return 0;
          if (typeof val === 'number') return val;
          try {
            const n = parseFloat(val.toString());
            return isNaN(n) ? 0 : n;
          } catch (e) {
            return 0;
          }
        };

        return {
          id: p.id,
          razonSocial: p.razonSocial || "",
          cuit: p.cuit || "",
          nombreFantasia: p.nombreFantasia,
          email: p.email,
          telefono: p.telefono,
          celular: p.celular,
          saldoAnterior: toNum(p.saldoAnterior),
          saldoVencido: toNum(p.saldoVencido),
          dias15: toNum(p.dias15),
          dias30: toNum(p.dias30),
          dias45: toNum(p.dias45),
          dias60: toNum(p.dias60),
          mas60: toNum(p.mas60),
          total: toNum(p.total),
          aliasCbu: p.aliasCbu || "",
        };
      })
    };
  } catch (error) {
    console.error("Error al obtener proveedores:", error);
    return { success: false, error: "No se pudieron cargar los proveedores." };
  }
}

export async function actualizarProveedor(id: string, data: {
  razonSocial: string;
  cuit?: string | null;
  nombreFantasia?: string | null;
  email?: string | null;
  telefono?: string | null;
  celular?: string | null;
  saldoAnterior?: number;
  saldoVencido?: number;
  dias15?: number;
  dias30?: number;
  dias45?: number;
  dias60?: number;
  mas60?: number;
  total?: number;
  aliasCbu?: string | null;
}) {
  try {
    const proveedor = await prisma.proveedor.update({
      where: { id },
      data: {
        razonSocial: data.razonSocial,
        cuit: data.cuit?.trim() || null,
        nombreFantasia: data.nombreFantasia,
        email: data.email,
        telefono: data.telefono,
        celular: data.celular,
        saldoAnterior: data.saldoAnterior,
        saldoVencido: data.saldoVencido,
        dias15: data.dias15,
        dias30: data.dias30,
        dias45: data.dias45,
        dias60: data.dias60,
        mas60: data.mas60,
        total: data.total,
        aliasCbu: data.aliasCbu,
      }
    });
    return { success: true, data: proveedor };
  } catch (error) {
    console.error("Error al actualizar proveedor:", error);
    return { success: false, error: "Ocurrió un error al guardar los cambios." };
  }
}

export async function crearProveedor(data: {
  razonSocial: string;
  cuit?: string | null;
  nombreFantasia?: string | null;
  email?: string | null;
  telefono?: string | null;
  celular?: string | null;
  saldoAnterior?: number;
  saldoVencido?: number;
  dias15?: number;
  dias30?: number;
  dias45?: number;
  dias60?: number;
  mas60?: number;
  total?: number;
  aliasCbu?: string | null;
}) {
  try {
    const proveedor = await prisma.proveedor.create({
      data: {
        razonSocial: data.razonSocial,
        cuit: data.cuit?.trim() || null,
        nombreFantasia: data.nombreFantasia,
        email: data.email,
        telefono: data.telefono,
        celular: data.celular,
        saldoAnterior: data.saldoAnterior || 0,
        saldoVencido: data.saldoVencido || 0,
        dias15: data.dias15 || 0,
        dias30: data.dias30 || 0,
        dias45: data.dias45 || 0,
        dias60: data.dias60 || 0,
        mas60: data.mas60 || 0,
        total: data.total || 0,
        aliasCbu: data.aliasCbu,
      }
    });
    return { success: true, data: proveedor };
  } catch (error) {
    console.error("Error al crear proveedor:", error);
    return { success: false, error: "No se pudo crear el proveedor. Es posible que el CUIT ya exista." };
  }
}

export async function eliminarProveedor(id: string) {
  try {
    await prisma.proveedor.delete({
      where: { id }
    });
    return { success: true };
  } catch (error) {
    console.error("Error al eliminar proveedor:", error);
    return { success: false, error: "No se pudo eliminar el proveedor." };
  }
}

export async function obtenerMovimientosProveedor(proveedorId?: string) {
  try {
    const where = proveedorId ? { proveedorId } : {};
    const movimientos = await prisma.movimientoProveedor.findMany({
      where,
      orderBy: { fecha: 'desc' },
      include: {
        proveedor: {
          select: { razonSocial: true }
        }
      }
    });

    return {
      success: true,
      data: movimientos.map(m => ({
        id: m.id,
        proveedorId: m.proveedorId,
        fecha: m.fecha.toISOString(),
        tipo: m.tipo,
        monto: Number(m.monto),
        descripcion: m.descripcion,
        referencia: m.referencia,
        saldo: Number(m.saldo),
        anulado: m.anulado,
        fechaPago: m.fechaPago ? m.fechaPago.toISOString() : null,
        proveedorNombre: m.proveedor.razonSocial
      }))
    };
  } catch (error) {
    console.error("Error al obtener movimientos:", error);
    return { success: false, error: "No se pudieron cargar los movimientos." };
  }
}

export async function obtenerPagosControl(metodoPago: string, fechaDesde: string, fechaHasta: string) {
  try {
    const inicio = new Date(fechaDesde);
    inicio.setHours(0, 0, 0, 0);
    const fin = new Date(fechaHasta);
    fin.setHours(23, 59, 59, 999);

    const movimientos = await prisma.movimientoProveedor.findMany({
      where: {
        anulado: false,
        OR: [
          {
            fechaPago: {
              gte: inicio,
              lte: fin,
            },
          },
          {
            fechaPago: null,
            fecha: {
              gte: inicio,
              lte: fin,
            }
          }
        ],
      },
      include: {
        proveedor: {
          select: { razonSocial: true }
        }
      },
      orderBy: { fecha: 'desc' }
    });

    const filtered = [];
    
    // Obtenemos todos los IDs de referencia que podrían ser ventas o compras para hacer un solo query
    const referenciaIds = movimientos
      .filter(m => m.referencia && !m.referencia.startsWith("MANUAL"))
      .map(m => m.referencia as string);
    
    const ventas = await prisma.venta.findMany({
      where: { id: { in: referenciaIds } },
      select: { id: true, metodo_pago: true }
    });
    
    const compras = await prisma.compra.findMany({
      where: { id: { in: referenciaIds } },
      select: { id: true, metodo_pago: true }
    });
    
    const ventasMap = new Map(ventas.map(v => [v.id, v.metodo_pago]));
    const comprasMap = new Map(compras.map(c => [c.id, c.metodo_pago]));

    for (const m of movimientos) {
      let mMethod = "";
      let isManual = false;
      
      const ref = m.referencia || "";
      if (ref.startsWith("MANUAL_PAGO_")) {
        mMethod = ref.split("_")[2];
        isManual = true;
      } else if (ref.startsWith("MANUAL_COBRO_")) {
        mMethod = ref.split("_")[2];
        isManual = true;
      } else if (ref.startsWith("MANUAL_XFER_")) {
        // Formato: MANUAL_XFER_PAGO_Method o MANUAL_XFER_COBRO_Method
        const parts = ref.split("_");
        mMethod = parts[3] || "Transferencia";
        isManual = true;
      } else if (ref && ventasMap.has(ref)) {
        mMethod = ventasMap.get(ref) || "";
      } else if (ref && comprasMap.has(ref)) {
        mMethod = comprasMap.get(ref) || "";
      } else {
        mMethod = "Otro";
      }

      if (metodoPago === "Todos" || mMethod.toLowerCase().includes(metodoPago.toLowerCase())) {
        filtered.push({
          id: m.id,
          fecha: m.fechaPago ? m.fechaPago.toISOString() : m.fecha.toISOString(),
          entidad: m.proveedor.razonSocial,
          descripcion: m.descripcion,
          monto: Math.abs(Number(m.monto)),
          tipo: m.tipo === "HABER" ? "PAGO" : "COBRO",
          origen: isManual ? "MANUAL" : (ventasMap.has(ref) ? "VENTA" : (comprasMap.has(ref) ? "COMPRA" : "SISTEMA")),
          metodoPago: mMethod
        });
      }
    }

    return {
      success: true,
      data: filtered
    };
  } catch (error) {
    console.error("Error al obtener pagos control:", error);
    return { success: false, error: "Error al cargar los pagos" };
  }
}
