"use server"

import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth-guard"
import { revalidatePath } from "next/cache"

export async function obtenerFaltantes(soloActivos: boolean = true) {
  await requireAdmin()
  try {
    const faltantes = await prisma.articuloFaltante.findMany({
      where: soloActivos ? { finalizado: false } : undefined,
      include: {
        articulo: { select: { id: true, nombre: true, stock: true } },
        proveedor: { select: { id: true, razonSocial: true, nombreFantasia: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    return faltantes.map((f) => ({
      id: f.id,
      articuloId: f.articuloId,
      articuloNombre: f.articulo.nombre,
      stockActual: f.articulo.stock,
      cantidadEstimada: f.cantidadEstimada,
      prioridad: f.prioridad,
      proveedorId: f.proveedorId ?? null,
      proveedorNombre: f.proveedor
        ? (f.proveedor.nombreFantasia || f.proveedor.razonSocial)
        : null,
      creadoPor: f.creadoPor,
      finalizado: f.finalizado,
      finalizadoAt: f.finalizadoAt?.toISOString() ?? null,
      finalizadoPor: f.finalizadoPor ?? null,
      createdAt: f.createdAt.toISOString(),
    }))
  } catch (error) {
    console.error("Error al obtener faltantes:", error)
    return []
  }
}

export async function crearFaltante(data: {
  articuloId: string
  cantidadEstimada: number
  prioridad: string
  proveedorId?: string | null
  creadoPor: string
}) {
  await requireAdmin()
  try {
    if (!data.articuloId || data.cantidadEstimada <= 0) {
      return { success: false, error: "Datos inválidos" }
    }

    const faltante = await prisma.articuloFaltante.create({
      data: {
        articuloId: data.articuloId,
        cantidadEstimada: data.cantidadEstimada,
        prioridad: data.prioridad,
        proveedorId: data.proveedorId ?? null,
        creadoPor: data.creadoPor,
      },
    })

    revalidatePath("/admin/erp/lista-pedidos")
    return { success: true, faltante }
  } catch (error) {
    console.error("Error al crear faltante:", error)
    return { success: false, error: "Error al guardar" }
  }
}

export async function finalizarFaltante(id: string, finalizadoPor: string) {
  await requireAdmin()
  try {
    await prisma.articuloFaltante.update({
      where: { id },
      data: {
        finalizado: true,
        finalizadoAt: new Date(),
        finalizadoPor,
      },
    })

    revalidatePath("/admin/erp/lista-pedidos")
    return { success: true }
  } catch (error) {
    console.error("Error al finalizar faltante:", error)
    return { success: false, error: "Error al finalizar" }
  }
}

export async function eliminarFaltante(id: string) {
  await requireAdmin()
  try {
    await prisma.articuloFaltante.delete({ where: { id } })
    revalidatePath("/admin/erp/lista-pedidos")
    return { success: true }
  } catch (error) {
    console.error("Error al eliminar faltante:", error)
    return { success: false, error: "Error al eliminar" }
  }
}

export async function obtenerArticulosParaFaltantes() {
  await requireAdmin()
  try {
    const articulos = await prisma.articuloMostrador.findMany({
      where: { esPack: false, esServicio: false },
      select: {
        id: true,
        nombre: true,
        stock: true,
        codigoProveedor: true,
        proveedorId: true,
      },
      orderBy: { nombre: "asc" },
    })
    return articulos
  } catch (error) {
    console.error("Error al obtener artículos:", error)
    return []
  }
}

export async function obtenerProveedoresParaFaltantes() {
  await requireAdmin()
  try {
    const proveedores = await prisma.proveedor.findMany({
      select: { id: true, razonSocial: true, nombreFantasia: true },
      orderBy: { razonSocial: "asc" },
    })
    return proveedores.map((p) => ({
      id: p.id,
      nombre: p.nombreFantasia || p.razonSocial,
    }))
  } catch (error) {
    console.error("Error al obtener proveedores:", error)
    return []
  }
}
