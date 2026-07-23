"use server"

import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import * as XLSX from "xlsx"

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

// Mantiene sincronizado el costo con la tabla legado de MercadoLibre (costos_articulos_old),
// que alimenta la vista vista_costos_productos usada en /admin/mercadolibre/costos.
// Mismo patrón que upsertCostosML en compras.ts, pero con el costo ya en ARS (es_dolar: false).
async function syncCostoArticuloML(tx: TxClient, id: string, nombre: string, costoArs: number) {
  await tx.costosArticulos.upsert({
    where: { id_articulo: id },
    update: { costo_usd: costoArs, es_dolar: false, costo_final_ars: costoArs, fecha_actualizacion: new Date() },
    create: { id_articulo: id, descripcion: nombre, costo_usd: costoArs, es_dolar: false, costo_final_ars: costoArs }
  });
}

// Función para obtener todos los artículos para la vista de listas
export async function obtenerArticulosParaListas() {
  try {
    const articulos = await prisma.articuloMostrador.findMany({
      orderBy: { nombre: 'asc' },
      include: {
        proveedor: { select: { id: true, razonSocial: true, nombreFantasia: true } },
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
        oculto: art.oculto,
        codigoProveedor: art.codigoProveedor,
        proveedorId: art.proveedorId,
        proveedorNombre: art.proveedor ? (art.proveedor.nombreFantasia || art.proveedor.razonSocial) : null,
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
export async function actualizarArticuloDesdeLista(id: string, nombre: string, precio: number, stock: number, costo?: number, margenGanancia?: number, codigoProveedor?: string, proveedorId?: string | null) {
  try {
    const session = await getServerSession(authOptions);
    const usuario = (session?.user as any)?.name || "Desconocido";

    await prisma.$transaction(async (tx) => {
      const anterior = await tx.articuloMostrador.findUnique({ where: { id }, include: { proveedor: true } });
      if (!anterior) throw new Error("Artículo no encontrado");

      await tx.articuloMostrador.update({
        where: { id },
        data: {
          nombre,
          precio,
          stock,
          costo,
          margenGanancia,
          codigoProveedor: codigoProveedor?.trim() || null,
          proveedorId: proveedorId || null
        }
      });

      const cambios: string[] = [];
      if (anterior.nombre !== nombre) {
        cambios.push(`Nombre: "${anterior.nombre}" → "${nombre}"`);
      }
      if (Number(anterior.precio) !== precio) {
        cambios.push(`Precio: $${Number(anterior.precio).toLocaleString('es-AR')} → $${precio.toLocaleString('es-AR')}`);
      }
      if (anterior.stock !== stock) {
        cambios.push(`Stock: ${anterior.stock} → ${stock}`);
      }
      if (costo !== undefined && Number(anterior.costo || 0) !== costo) {
        cambios.push(`Costo: $${Number(anterior.costo || 0).toLocaleString('es-AR')} → $${costo.toLocaleString('es-AR')}`);
      }
      if (margenGanancia !== undefined && Number(anterior.margenGanancia || 0) !== margenGanancia) {
        cambios.push(`Margen: ${Number(anterior.margenGanancia || 0)}% → ${margenGanancia}%`);
      }
      if ((anterior.codigoProveedor || "") !== (codigoProveedor?.trim() || "")) {
        cambios.push(`Código proveedor: "${anterior.codigoProveedor || ""}" → "${codigoProveedor?.trim() || ""}"`);
      }
      if ((anterior.proveedorId || "") !== (proveedorId || "")) {
        const nuevoProveedor = proveedorId ? await tx.proveedor.findUnique({ where: { id: proveedorId } }) : null;
        cambios.push(`Proveedor: "${anterior.proveedor?.razonSocial || "(sin proveedor)"}" → "${nuevoProveedor?.razonSocial || "(sin proveedor)"}"`);
      }

      if (cambios.length > 0) {
        await tx.articuloAuditoria.create({
          data: {
            articuloId: id,
            usuario,
            accion: "EDICION_ARTICULO",
            detalle: cambios.join("; ")
          }
        });
      }

      if (costo !== undefined && Number(anterior.costo || 0) !== costo) {
        await syncCostoArticuloML(tx, id, nombre, costo);
      }
    });

    return { success: true };
  } catch (error) {
    console.error("Error al actualizar artículo:", error);
    return { success: false, error: "Ocurrió un error al guardar los cambios." };
  }
}

// Aplica un proveedor a un conjunto de artículos en una sola operación (selección masiva desde la tabla)
export async function aplicarProveedorMasivo(ids: string[], proveedorId: string | null) {
  try {
    if (!ids || ids.length === 0) {
      return { success: false, error: "No se seleccionaron artículos." };
    }

    const session = await getServerSession(authOptions);
    const usuario = (session?.user as any)?.name || "Desconocido";

    const nuevoProveedor = proveedorId
      ? await prisma.proveedor.findUnique({ where: { id: proveedorId } })
      : null;

    await prisma.$transaction(async (tx) => {
      const anteriores = await tx.articuloMostrador.findMany({
        where: { id: { in: ids } },
        include: { proveedor: true }
      });

      await tx.articuloMostrador.updateMany({
        where: { id: { in: ids } },
        data: { proveedorId: proveedorId || null }
      });

      const auditorias = anteriores
        .filter(a => (a.proveedorId || "") !== (proveedorId || ""))
        .map(a => ({
          articuloId: a.id,
          usuario,
          accion: "EDICION_MASIVA_PROVEEDOR",
          detalle: `Proveedor: "${a.proveedor?.razonSocial || "(sin proveedor)"}" → "${nuevoProveedor?.razonSocial || "(sin proveedor)"}" (aplicación masiva a ${ids.length} artículos)`
        }));

      if (auditorias.length > 0) {
        await tx.articuloAuditoria.createMany({ data: auditorias });
      }
    });

    const proveedorNombre = nuevoProveedor ? (nuevoProveedor.nombreFantasia || nuevoProveedor.razonSocial) : null;
    return { success: true, proveedorId: proveedorId || null, proveedorNombre };
  } catch (error) {
    console.error("Error al aplicar proveedor masivo:", error);
    return { success: false, error: "Ocurrió un error al aplicar el proveedor a los artículos seleccionados." };
  }
}

// --- ACTUALIZACIÓN MASIVA DE COSTOS DESDE EXCEL DE PROVEEDOR ---

export type PreviewItemExcel = {
  id: string;
  nombre: string;
  codigoProveedor: string;
  costoActual: number;
  costoNuevo: number;
};

export type PreviewExcelResultado = {
  totalFilasExcel: number;
  articulosProveedor: number;
  coincidencias: number;
  suben: number;
  bajan: number;
  iguales: number;
  sinMatchEnExcel: number;
  items: PreviewItemExcel[];
};

// Lee la planilla del proveedor, detecta las columnas de código y precio, y cruza
// contra los artículos que tienen ese proveedor + código de proveedor cargado.
export async function previsualizarExcelProveedor(formData: FormData, proveedorId: string) {
  try {
    const file = formData.get("file") as File | null;
    if (!file) return { success: false, error: "No se recibió ningún archivo." };
    if (!proveedorId) return { success: false, error: "Seleccioná primero el proveedor." };

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext ?? ""))
      return { success: false, error: "El archivo debe ser .xlsx, .xls o .csv" };

    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });

    // Detectamos la fila de encabezado buscando una columna que contenga "código"
    let headerRowIdx = -1;
    let colCodigo = -1;
    let colPrecio = -1;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const row = rows[i] || [];
      const idxCodigo = row.findIndex((c: any) => typeof c === "string" && /c[oó]digo/i.test(c));
      if (idxCodigo >= 0) {
        headerRowIdx = i;
        colCodigo = idxCodigo;
        colPrecio = row.findIndex((c: any) => typeof c === "string" && /distribuidor|precio|costo|lista/i.test(c));
        break;
      }
    }

    if (headerRowIdx === -1 || colCodigo === -1) {
      return { success: false, error: "No se encontró una columna de 'Código' en el archivo." };
    }

    // Si no hay una columna de precio identificable por nombre, tomamos la última
    // columna numérica de la primera fila de datos como precio.
    if (colPrecio === -1) {
      const dataRow = rows[headerRowIdx + 1] || [];
      for (let c = dataRow.length - 1; c >= 0; c--) {
        if (typeof dataRow[c] === "number") { colPrecio = c; break; }
      }
    }

    if (colPrecio === -1) {
      return { success: false, error: "No se encontró una columna de precio en el archivo." };
    }

    const filasDatos = rows
      .slice(headerRowIdx + 1)
      .filter(r => r && r[colCodigo] !== undefined && String(r[colCodigo]).trim() !== "");

    const excelMap = new Map<string, number>();
    for (const r of filasDatos) {
      const codigo = String(r[colCodigo]).trim().toUpperCase();
      const precio = Number(r[colPrecio]);
      if (codigo && !isNaN(precio) && precio > 0) {
        excelMap.set(codigo, precio);
      }
    }

    if (excelMap.size === 0) {
      return { success: false, error: "No se encontraron filas válidas con código y precio en el archivo." };
    }

    const articulos = await prisma.articuloMostrador.findMany({
      where: { proveedorId, codigoProveedor: { not: null } },
      select: { id: true, nombre: true, codigoProveedor: true, costo: true }
    });

    const items: PreviewItemExcel[] = [];
    let suben = 0, bajan = 0, iguales = 0;

    for (const art of articulos) {
      const codigo = (art.codigoProveedor || "").trim().toUpperCase();
      if (!codigo || !excelMap.has(codigo)) continue;
      const costoNuevo = excelMap.get(codigo)!;
      const costoActual = Number(art.costo || 0);
      if (costoNuevo > costoActual) suben++;
      else if (costoNuevo < costoActual) bajan++;
      else iguales++;
      items.push({ id: art.id, nombre: art.nombre, codigoProveedor: art.codigoProveedor || "", costoActual, costoNuevo });
    }

    const data: PreviewExcelResultado = {
      totalFilasExcel: filasDatos.length,
      articulosProveedor: articulos.length,
      coincidencias: items.length,
      suben,
      bajan,
      iguales,
      sinMatchEnExcel: articulos.length - items.length,
      items
    };

    return { success: true, data };
  } catch (error) {
    console.error("Error al previsualizar excel de proveedor:", error);
    return { success: false, error: "No se pudo procesar el archivo." };
  }
}

// Aplica los nuevos costos (según lo previsualizado) y recalcula el precio con el % de marcación indicado
export async function aplicarActualizacionMasivaExcel(updates: { id: string; costoNuevo: number }[], porcentajeMarcacion: number) {
  try {
    if (!updates || updates.length === 0) {
      return { success: false, error: "No hay artículos para actualizar." };
    }
    if (isNaN(porcentajeMarcacion) || porcentajeMarcacion < 0) {
      return { success: false, error: "El % de marcación no es válido." };
    }

    const session = await getServerSession(authOptions);
    const usuario = (session?.user as any)?.name || "Desconocido";

    const calcularPrecio = (costo: number, margen: number) => Number((costo * (1 + margen / 100)).toFixed(2));

    await prisma.$transaction(async (tx) => {
      const ids = updates.map(u => u.id);
      const anteriores = await tx.articuloMostrador.findMany({ where: { id: { in: ids } } });
      const anterioresMap = new Map(anteriores.map(a => [a.id, a]));

      const auditorias: { articuloId: string; usuario: string; accion: string; detalle: string }[] = [];

      for (const u of updates) {
        const anterior = anterioresMap.get(u.id);
        if (!anterior) continue;

        const precioNuevo = calcularPrecio(u.costoNuevo, porcentajeMarcacion);

        await tx.articuloMostrador.update({
          where: { id: u.id },
          data: { costo: u.costoNuevo, margenGanancia: porcentajeMarcacion, precio: precioNuevo }
        });

        await syncCostoArticuloML(tx, u.id, anterior.nombre, u.costoNuevo);

        auditorias.push({
          articuloId: u.id,
          usuario,
          accion: "ACTUALIZACION_EXCEL_PROVEEDOR",
          detalle: `Costo: $${Number(anterior.costo || 0).toLocaleString('es-AR')} → $${u.costoNuevo.toLocaleString('es-AR')}; Marcación ${porcentajeMarcacion}%; Precio: $${Number(anterior.precio).toLocaleString('es-AR')} → $${precioNuevo.toLocaleString('es-AR')} (importación desde Excel)`
        });
      }

      if (auditorias.length > 0) {
        await tx.articuloAuditoria.createMany({ data: auditorias });
      }
    }, { timeout: 30000 });

    return { success: true, actualizados: updates.length };
  } catch (error) {
    console.error("Error al aplicar actualización masiva desde Excel:", error);
    return { success: false, error: "Ocurrió un error al aplicar la actualización masiva." };
  }
}

// Historial de cambios de un artículo (para la sección de listas)
export async function obtenerHistorialArticulo(articuloId: string) {
  try {
    const historial = await prisma.articuloAuditoria.findMany({
      where: { articuloId },
      orderBy: { createdAt: 'desc' }
    });
    return { success: true, data: historial };
  } catch (error) {
    console.error("Error al obtener historial del artículo:", error);
    return { success: false, error: "No se pudo obtener el historial." };
  }
}

export async function crearArticuloMostrador(data: { id: string, nombre: string, precio: number, stock: number, costo?: number, margenGanancia?: number, codigoProveedor?: string | null, proveedorId?: string | null }) {
  try {
    const articulo = await prisma.articuloMostrador.create({
      data: {
        id: data.id,
        nombre: data.nombre,
        precio: data.precio,
        stock: data.stock,
        costo: data.costo || 0,
        margenGanancia: data.margenGanancia || 0,
        codigoProveedor: data.codigoProveedor?.trim() || null,
        proveedorId: data.proveedorId || null,
        esPack: false
      }
    });

    return { success: true, data: articulo };
  } catch (error) {
    console.error("Error al crear artículo:", error);
    return { success: false, error: "No se pudo crear el artículo. Es posible que el ID ya exista." };
  }
}

// Lista de proveedores para el selector en Artículos Mostrador
export async function obtenerProveedoresParaListas() {
  try {
    const proveedores = await prisma.proveedor.findMany({
      select: { id: true, razonSocial: true, nombreFantasia: true }
    });
    // Ordenamos en JS (localeCompare, sin distinguir mayúsculas/acentos): el orderBy de la DB
    // es sensible a mayúsculas y agrupa "GARCIA..." (todo mayúsculas) lejos de "Garcia..." (mixto),
    // haciendo que proveedores existentes "no aparezcan" donde el usuario los espera alfabéticamente.
    const data = proveedores
      .map(p => ({ id: p.id, nombre: p.nombreFantasia || p.razonSocial }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
    return { success: true, data };
  } catch (error) {
    console.error("Error al obtener proveedores:", error);
    return { success: false, error: "No se pudieron cargar los proveedores." };
  }
}

export async function toggleOcultarArticulo(id: string, oculto: boolean) {
  const session = await getServerSession(authOptions);
  if (!session) return { success: false, error: "No autorizado" };
  try {
    await prisma.articuloMostrador.update({ where: { id }, data: { oculto } });
    return { success: true };
  } catch (error) {
    console.error("Error al cambiar visibilidad del artículo:", error);
    return { success: false, error: "No se pudo actualizar el artículo." };
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
      include: {
        ventasMostrador: {
          select: { createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        // Cubre ventas a CC/Cruzada donde no se registró CUIT (sujetoId null)
        movimientos: {
          where: {
            tipo: "HABER",
            anulado: false,
            referencia: { not: null },
            NOT: { referencia: { startsWith: "MANUAL_" } },
          },
          select: { fecha: true },
          orderBy: { fecha: 'desc' },
          take: 1,
        },
      }
    });

    return {
      success: true,
      // Ordenamos en JS (localeCompare, sin distinguir mayúsculas/acentos): ver comentario
      // en obtenerProveedoresParaListas sobre por qué no usamos orderBy de la DB.
      data: proveedores
        .slice()
        .sort((a, b) => (a.razonSocial || "").localeCompare(b.razonSocial || "", 'es', { sensitivity: 'base' }))
        .map(p => {
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
          esMayorista: p.esMayorista,
          ultimaCompra: (() => {
            const fechaVenta = p.ventasMostrador[0]?.createdAt ?? null;
            const fechaMovimiento = p.movimientos[0]?.fecha ?? null;
            if (!fechaVenta && !fechaMovimiento) return null;
            if (!fechaVenta) return fechaMovimiento!.toISOString();
            if (!fechaMovimiento) return fechaVenta.toISOString();
            return (fechaVenta > fechaMovimiento ? fechaVenta : fechaMovimiento).toISOString();
          })(),
        };
      })
    };
  } catch (error) {
    console.error("Error al obtener proveedores:", error);
    return { success: false, error: "No se pudieron cargar los proveedores." };
  }
}

export async function toggleMayoristaProveedor(id: string, esMayorista: boolean) {
  const session = await getServerSession(authOptions);
  if (!session) return { success: false, error: "No autorizado" };
  try {
    await prisma.proveedor.update({ where: { id }, data: { esMayorista } });
    return { success: true };
  } catch (error) {
    console.error("Error al actualizar mayorista:", error);
    return { success: false, error: "No se pudo actualizar." };
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
  const session = await getServerSession(authOptions)
  if (!session) {
    return { success: false, error: "No autorizado" }
  }

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

export async function actualizarObservacionesProveedor(id: string, observaciones: string) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { success: false, error: "No autorizado" }
  }
  try {
    await prisma.proveedor.update({
      where: { id },
      data: { observaciones: observaciones.trim() || null },
    });
    return { success: true };
  } catch (error) {
    console.error("Error al guardar observaciones del proveedor:", error);
    return { success: false, error: "No se pudieron guardar las observaciones." };
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
  const session = await getServerSession(authOptions)
  if (!session) {
    return { success: false, error: "No autorizado" }
  }

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
  const session = await getServerSession(authOptions)
  if (!session) {
    return { success: false, error: "No autorizado" }
  }

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
  const session = await getServerSession(authOptions)
  if (!session) return { success: false, error: "No autenticado", data: [] }

  try {
    const where = proveedorId ? { proveedorId } : {};
    const movimientos = await prisma.movimientoProveedor.findMany({
      where,
      orderBy: { fecha: 'desc' },
      take: 500,
      include: {
        proveedor: {
          select: { razonSocial: true }
        }
      }
    });

    // Traer fechaIngreso de las compras referenciadas
    const referencias = Array.from(new Set(movimientos.map(m => m.referencia).filter(Boolean))) as string[];
    const comprasRef = referencias.length > 0
      ? await prisma.compra.findMany({
          where: { id: { in: referencias } },
          select: { id: true, fechaIngreso: true }
        })
      : [];
    const compraFechaMap = new Map(comprasRef.map(c => [c.id, c.fechaIngreso]));

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
        fechaIngreso: compraFechaMap.get(m.referencia ?? '')
          ? compraFechaMap.get(m.referencia ?? '')!.toISOString()
          : null,
        proveedorNombre: m.proveedor.razonSocial
      }))
    };
  } catch (error) {
    console.error("Error al obtener movimientos:", error);
    return { success: false, error: "No se pudieron cargar los movimientos." };
  }
}

export async function obtenerPagosControl(metodoPago: string, fechaDesde: string, fechaHasta: string) {
  const session = await getServerSession(authOptions)
  if (!session) return { success: false, error: "No autenticado", data: [] }

  try {
    const inicio = new Date(`${fechaDesde}T00:00:00-03:00`);
    const fin = new Date(`${fechaHasta}T23:59:59.999-03:00`);

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
      select: { id: true, metodo_pago: true, tipoVenta: true }
    });

    const compras = await prisma.compra.findMany({
      where: { id: { in: referenciaIds } },
      select: { id: true, metodo_pago: true }
    });

    const ventasMap = new Map(ventas.map(v => [v.id, v.metodo_pago]));
    const ventasTipoMap = new Map(ventas.map(v => [v.id, v.tipoVenta]));
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
          fechaRegistro: m.fecha.toISOString(),
          fechaReal: m.fechaPago ? m.fechaPago.toISOString() : m.fecha.toISOString(),
          entidad: m.proveedor.razonSocial,
          descripcion: m.descripcion,
          monto: Math.abs(Number(m.monto)),
          tipo: m.tipo === "HABER" ? "PAGO" : "COBRO",
          origen: isManual ? "MANUAL" : (ventasMap.has(ref) ? "VENTA" : (comprasMap.has(ref) ? "COMPRA" : "SISTEMA")),
          metodoPago: mMethod,
          pendiente: ventasTipoMap.get(ref) === "PEDIDO"
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
