"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function getMayoristas() {
  try {
    return await prisma.numerosMayoristas.findMany({
      orderBy: { createdAt: 'desc' }
    });
  } catch (error) {
    console.error("Error obteniendo mayoristas:", error);
    return [];
  }
}

export async function createMayorista(nombre: string, telefono: string) {
  try {
    // Limpiamos el teléfono para que solo queden números
    const telLimpio = telefono.replace(/\D/g, '');
    
    const nuevo = await prisma.numerosMayoristas.create({
      data: { 
        nombre, 
        telefono: telLimpio 
      }
    });
    
    revalidatePath("/admin/mayoristas");
    return { success: true, data: nuevo };
  } catch (error) {
    console.error("Error:", error);
    return { success: false, error: "El número ya existe o es inválido" };
  }
}

export async function deleteMayorista(id: number) {
  try {
    await prisma.numerosMayoristas.delete({
      where: { id }
    });
    revalidatePath("/admin/mayoristas");
    return { success: true };
  } catch (error) {
    return { success: false, error: "No se pudo eliminar" };
  }
}
