"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function obtenerPuntosVenta() {
  try {
    const puntos = await prisma.puntoVenta.findMany({
      orderBy: { nombre: 'asc' }
    });
    return { success: true, data: puntos };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function crearPuntoVenta(nombre: string) {
  try {
    const nuevo = await prisma.puntoVenta.create({
      data: { nombre }
    });
    revalidatePath("/admin/listas/puntos-venta");
    revalidatePath("/admin/ventas-mostrador");
    return { success: true, data: nuevo };
  } catch (error: any) {
    if (error.code === 'P2002') {
      return { success: false, error: "Ya existe un punto de venta con ese nombre" };
    }
    return { success: false, error: error.message };
  }
}

export async function actualizarPuntoVenta(id: string, nombre: string) {
  try {
    const actualizado = await prisma.puntoVenta.update({
      where: { id },
      data: { nombre }
    });
    revalidatePath("/admin/listas/puntos-venta");
    revalidatePath("/admin/ventas-mostrador");
    return { success: true, data: actualizado };
  } catch (error: any) {
    if (error.code === 'P2002') {
      return { success: false, error: "Ya existe un punto de venta con ese nombre" };
    }
    return { success: false, error: error.message };
  }
}

export async function eliminarPuntoVenta(id: string) {
  try {
    // Verificamos si tiene ventas asociadas
    const conVentas = await prisma.venta.findFirst({
      where: { puntoVentaId: id }
    });
    if (conVentas) {
      return { success: false, error: "No se puede eliminar porque tiene ventas asociadas. Desvincúlalas primero." };
    }

    await prisma.puntoVenta.delete({
      where: { id }
    });
    revalidatePath("/admin/listas/puntos-venta");
    revalidatePath("/admin/ventas-mostrador");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
