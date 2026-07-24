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
    })

    if (!sesion) {
      sesion = await prisma.controlStockSesion.create({
        data: {
          proveedorId,
          iniciadoPor: (session.user as any)?.name || "desconocido",
        },
      })
    }

    return {
      success: true,
      data: {
        sesionId: sesion.id,
        proveedorId: proveedor.id,
        proveedorNombre: proveedor.nombreFantasia || proveedor.razonSocial,
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
        stock: true,
        codigoProveedor: true,
      },
    })
    return { success: true, data: articulos }
  } catch (error) {
    console.error("Error al obtener artículos del proveedor:", error)
    return { success: false, error: "No se pudieron cargar los artículos del proveedor." }
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
