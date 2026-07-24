"use server"

import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"

export async function iniciarSesionControlStock(proveedorId: string) {
  const session = await getServerSession(authOptions)
  if (!session) return { success: false, error: "No autorizado" }

  try {
    const proveedor = await prisma.proveedor.findUnique({
      where: { id: proveedorId },
      select: { id: true, razonSocial: true, nombreFantasia: true },
    })
    if (!proveedor) return { success: false, error: "Proveedor no encontrado" }

    let sesion = await prisma.controlStockSesion.findFirst({
      where: { proveedorId, estado: "EN_PROGRESO" },
      orderBy: { createdAt: "desc" },
      include: {
        entradas: {
          orderBy: { createdAt: "asc" },
          select: { id: true, articuloId: true, cantidad: true, comentario: true, createdAt: true },
        },
      },
    })

    if (!sesion) {
      const nueva = await prisma.controlStockSesion.create({
        data: {
          proveedorId,
          iniciadoPor: (session.user as any)?.name || "desconocido",
        },
      })
      sesion = { ...nueva, entradas: [] }
    }

    return {
      success: true,
      data: {
        sesionId: sesion.id,
        proveedorId: proveedor.id,
        proveedorNombre: proveedor.nombreFantasia || proveedor.razonSocial,
        entradas: sesion.entradas,
      },
    }
  } catch (error) {
    console.error("Error al iniciar sesión de control de stock:", error)
    return { success: false, error: "No se pudo iniciar el control de stock." }
  }
}

export async function obtenerArticulosPorProveedor(proveedorId: string) {
  try {
    const articulos = await prisma.articuloMostrador.findMany({
      where: { proveedorId, oculto: false },
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        codigoProveedor: true,
      },
    })
    return { success: true, data: articulos }
  } catch (error) {
    console.error("Error al obtener artículos del proveedor:", error)
    return { success: false, error: "No se pudieron cargar los artículos del proveedor." }
  }
}

export async function obtenerEntradasSesion(sesionId: string) {
  try {
    const entradas = await prisma.controlStockEntrada.findMany({
      where: { sesionId },
      orderBy: { createdAt: "asc" },
      select: { id: true, articuloId: true, cantidad: true, comentario: true, createdAt: true },
    })
    return { success: true, data: entradas }
  } catch (error) {
    console.error("Error al obtener las entradas del conteo:", error)
    return { success: false, error: "No se pudieron cargar los conteos cargados." }
  }
}

export async function registrarConteoStock(params: {
  sesionId: string
  articuloId: string
  cantidad: number
  comentario?: string
}) {
  const session = await getServerSession(authOptions)
  if (!session) return { success: false, error: "No autorizado" }

  const { sesionId, articuloId, cantidad, comentario } = params

  if (!Number.isFinite(cantidad) || cantidad < 0) {
    return { success: false, error: "La cantidad contada no es válida." }
  }

  try {
    const entrada = await prisma.controlStockEntrada.create({
      data: {
        sesionId,
        articuloId,
        cantidad,
        comentario: comentario?.trim() || null,
        contadoPor: (session.user as any)?.name || "desconocido",
      },
    })
    return { success: true, data: entrada }
  } catch (error) {
    console.error("Error al registrar conteo de stock:", error)
    return { success: false, error: "No se pudo registrar el conteo." }
  }
}

export async function finalizarConteoEmpleado(sesionId: string) {
  const session = await getServerSession(authOptions)
  if (!session) return { success: false, error: "No autorizado" }

  try {
    const sesion = await prisma.controlStockSesion.findUnique({
      where: { id: sesionId },
      select: { estado: true },
    })
    if (!sesion) return { success: false, error: "Conteo no encontrado." }
    if (sesion.estado !== "EN_PROGRESO") {
      return { success: false, error: "Este conteo ya no está en progreso." }
    }

    await prisma.controlStockSesion.update({
      where: { id: sesionId },
      data: { estado: "COMPLETADO" },
    })
    return { success: true }
  } catch (error) {
    console.error("Error al finalizar el conteo:", error)
    return { success: false, error: "No se pudo finalizar el conteo." }
  }
}

export async function obtenerSesionesConteo() {
  try {
    const sesiones = await prisma.controlStockSesion.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        proveedor: { select: { razonSocial: true, nombreFantasia: true } },
        entradas: { select: { articuloId: true } },
      },
    })

    const data = sesiones.map((s) => ({
      id: s.id,
      proveedorId: s.proveedorId,
      proveedorNombre: s.proveedor.nombreFantasia || s.proveedor.razonSocial,
      estado: s.estado,
      iniciadoPor: s.iniciadoPor,
      createdAt: s.createdAt,
      finalizadoAt: s.finalizadoAt,
      totalArticulos: new Set(s.entradas.map((e) => e.articuloId)).size,
      totalEntradas: s.entradas.length,
    }))

    return { success: true, data }
  } catch (error) {
    console.error("Error al obtener sesiones de control de stock:", error)
    return { success: false, error: "No se pudieron cargar los conteos." }
  }
}

export async function obtenerDetalleSesionConteo(sesionId: string) {
  try {
    const sesion = await prisma.controlStockSesion.findUnique({
      where: { id: sesionId },
      include: {
        proveedor: { select: { razonSocial: true, nombreFantasia: true } },
        entradas: {
          orderBy: { createdAt: "asc" },
          include: {
            articulo: { select: { id: true, nombre: true, stock: true, codigoProveedor: true } },
          },
        },
      },
    })
    if (!sesion) return { success: false, error: "Conteo no encontrado." }

    const articulosMap = new Map<
      string,
      {
        articulo: { id: string; nombre: string; stock: number; codigoProveedor: string | null }
        entradas: { id: string; cantidad: number; comentario: string | null; contadoPor: string; createdAt: Date }[]
      }
    >()

    for (const e of sesion.entradas) {
      if (!articulosMap.has(e.articuloId)) {
        articulosMap.set(e.articuloId, { articulo: e.articulo, entradas: [] })
      }
      articulosMap.get(e.articuloId)!.entradas.push({
        id: e.id,
        cantidad: e.cantidad,
        comentario: e.comentario,
        contadoPor: e.contadoPor,
        createdAt: e.createdAt,
      })
    }

    return {
      success: true,
      data: {
        id: sesion.id,
        estado: sesion.estado,
        iniciadoPor: sesion.iniciadoPor,
        createdAt: sesion.createdAt,
        finalizadoAt: sesion.finalizadoAt,
        proveedorNombre: sesion.proveedor.nombreFantasia || sesion.proveedor.razonSocial,
        articulos: Array.from(articulosMap.values()),
      },
    }
  } catch (error) {
    console.error("Error al obtener el detalle del conteo:", error)
    return { success: false, error: "No se pudo cargar el detalle del conteo." }
  }
}

export async function actualizarEntradaConteo(params: {
  entradaId: string
  cantidad: number
  comentario?: string
}) {
  const session = await getServerSession(authOptions)
  if (!session) return { success: false, error: "No autorizado" }

  const { entradaId, cantidad, comentario } = params
  if (!Number.isFinite(cantidad) || cantidad < 0) {
    return { success: false, error: "La cantidad no es válida." }
  }

  try {
    const entrada = await prisma.controlStockEntrada.update({
      where: { id: entradaId },
      data: { cantidad, comentario: comentario?.trim() || null },
    })
    return { success: true, data: entrada }
  } catch (error) {
    console.error("Error al actualizar el conteo:", error)
    return { success: false, error: "No se pudo actualizar el conteo." }
  }
}

export async function eliminarEntradaConteo(entradaId: string) {
  const session = await getServerSession(authOptions)
  if (!session) return { success: false, error: "No autorizado" }

  try {
    await prisma.controlStockEntrada.delete({ where: { id: entradaId } })
    return { success: true }
  } catch (error) {
    console.error("Error al eliminar el conteo:", error)
    return { success: false, error: "No se pudo eliminar el conteo." }
  }
}

export async function eliminarSesionConteo(sesionId: string) {
  const session = await getServerSession(authOptions)
  if (!session) return { success: false, error: "No autorizado" }

  try {
    const sesion = await prisma.controlStockSesion.findUnique({
      where: { id: sesionId },
      select: { estado: true },
    })
    if (!sesion) return { success: false, error: "Conteo no encontrado." }
    if (sesion.estado === "FINALIZADA") {
      return { success: false, error: "No se puede eliminar un conteo ya aplicado al stock." }
    }

    await prisma.controlStockSesion.delete({ where: { id: sesionId } })
    return { success: true }
  } catch (error) {
    console.error("Error al eliminar el conteo:", error)
    return { success: false, error: "No se pudo eliminar el conteo." }
  }
}

export async function aplicarConteoStock(sesionId: string) {
  const session = await getServerSession(authOptions)
  if (!session) return { success: false, error: "No autorizado" }
  const usuario = (session.user as any)?.name || "desconocido"

  try {
    const sesion = await prisma.controlStockSesion.findUnique({
      where: { id: sesionId },
      include: {
        entradas: {
          include: { articulo: { select: { id: true, nombre: true, stock: true } } },
        },
      },
    })
    if (!sesion) return { success: false, error: "Conteo no encontrado." }
    if (sesion.estado === "FINALIZADA") {
      return { success: false, error: "Este conteo ya fue aplicado al stock." }
    }

    const totales = new Map<string, number>()
    const articulosPorId = new Map<string, { id: string; nombre: string; stock: number }>()
    for (const e of sesion.entradas) {
      totales.set(e.articuloId, (totales.get(e.articuloId) || 0) + e.cantidad)
      articulosPorId.set(e.articuloId, e.articulo)
    }

    if (totales.size === 0) {
      return { success: false, error: "El conteo no tiene artículos cargados." }
    }

    await prisma.$transaction(async (tx) => {
      for (const [articuloId, cantidadContada] of totales) {
        const articulo = articulosPorId.get(articuloId)!
        if (articulo.stock !== cantidadContada) {
          await tx.articuloMostrador.update({
            where: { id: articuloId },
            data: { stock: cantidadContada },
          })
          await tx.articuloAuditoria.create({
            data: {
              articuloId,
              usuario,
              accion: "AJUSTE_STOCK_CONTEO",
              detalle: `Control de stock aplicado: de ${articulo.stock} a ${cantidadContada} unidades.`,
            },
          })
        }
      }

      await tx.controlStockSesion.update({
        where: { id: sesionId },
        data: { estado: "FINALIZADA", finalizadoAt: new Date() },
      })
    })

    return { success: true, data: { articulosActualizados: totales.size } }
  } catch (error) {
    console.error("Error al aplicar el control de stock:", error)
    return { success: false, error: "No se pudo aplicar el control de stock." }
  }
}
