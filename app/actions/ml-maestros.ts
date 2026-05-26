// app/actions/ml-maestros.ts
"use server";

import { prisma } from "@/lib/prisma"; 
import { revalidatePath } from "next/cache";

export async function createManualProduct(data: {
  mla: string;
  titulo: string;
  nombre_variante?: string;
  variation_id?: string;
  user_product_id?: string;
  family_id?: string;
  es_nuevo?: boolean;
}) {
  try {
    const { mla, titulo, nombre_variante, variation_id, user_product_id, family_id, es_nuevo } = data;

    // 1. Validaciones básicas
    if (!mla || !titulo) {
      return { success: false, error: "El MLA y el Título son obligatorios." };
    }

    // 2. Preparamos los datos (limpieza)
    const cleanMla = mla.trim().toUpperCase();
    const cleanTitle = titulo.trim();
    const cleanVarName = nombre_variante?.trim() || null;
    const cleanVarId = variation_id?.trim() || null;
    // Forzamos mayúsculas para el UP para mantener consistencia
    const cleanUP = user_product_id?.trim().toUpperCase() || null; 
    const cleanFamily = family_id?.trim() || null;

    // 3. Lógica CORREGIDA: Check-then-Act
    const existingProduct = await prisma.productosMaestros.findFirst({
      where: {
        mla: cleanMla,
        variation_id: cleanVarId
      }
    });

    if (existingProduct) {
      // SI EXISTE: Actualizamos usando su ID único interno (esto nunca falla)
      await prisma.productosMaestros.update({
        where: { id: existingProduct.id },
        data: {
          nombre_publicacion: cleanTitle,
          nombre_variante: cleanVarName,
          user_product_id: cleanUP, // GUARDAMOS EL UP
          family_id: cleanFamily,   // GUARDAMOS LA FAMILIA
          estado: "active",
          ultima_actualizacion: new Date()
        }
      });
    } else {
      // NO EXISTE: Creamos
      await prisma.productosMaestros.create({
        data: {
          mla: cleanMla,
          nombre_publicacion: cleanTitle,
          nombre_variante: cleanVarName,
          variation_id: cleanVarId,
          user_product_id: cleanUP,
          family_id: cleanFamily,
          estado: "active",
          es_nuevo: es_nuevo ?? false,
          link_publicacion: `https://articulo.mercadolibre.com.ar/${cleanMla}`
        }
      });
    }

    // 4. Revalidamos para que aparezca en todas las tablas
    revalidatePath("/admin/mercadolibre/composicion");
    revalidatePath("/admin/mercadolibre/costos");

    return { success: true };
  } catch (error: any) {
    console.error("Error al crear producto maestro:", error);
    return { success: false, error: "Error de base de datos: " + error.message };
  }
}

// NUEVO: Obtener todos los productos maestros para poblar las variantes al crear recetas
export async function getProductosMaestros() {
  try {
    return await prisma.productosMaestros.findMany({
      orderBy: { mla: 'asc' }
    });
  } catch (error) {
    console.error("Error al obtener productos maestros:", error);
    return [];
  }
}

// NUEVO: Eliminar un producto maestro que no tiene receta
export async function deleteManualProduct(mla: string, variation_id?: string | null) {
  try {
    const existingProduct = await prisma.productosMaestros.findFirst({
      where: {
        mla: mla,
        variation_id: variation_id || null
      }
    });

    if (existingProduct) {
      await prisma.productosMaestros.delete({
        where: { id: existingProduct.id }
      });
      revalidatePath("/admin/mercadolibre/composicion");
      revalidatePath("/admin/mercadolibre/costos");
      return { success: true };
    }
    return { success: false, error: "No se encontró el producto para eliminar" };
  } catch (error: any) {
    console.error("Error al eliminar producto maestro:", error);
    return { success: false, error: "Error de base de datos: " + error.message };
  }
}
