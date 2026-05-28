// app/actions/kits.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// NUEVO: Crear producto maestro con receta en un solo paso
export async function createProductWithRecipe(data: {
  mla: string;
  titulo: string;
  nombre_variante?: string;
  variation_id?: string;
  user_product_id?: string;
  family_id?: string;
  es_nuevo?: boolean;
  componentes: Array<{
    id_articulo: string;
    cantidad: number;
    nombre_articulo: string;
  }>;
}) {
  try {
    const { mla, titulo, nombre_variante, variation_id, user_product_id, family_id, es_nuevo, componentes } = data;

    // 1. Validaciones básicas
    if (!mla || !titulo) {
      return { success: false, error: "El MLA y el Título son obligatorios." };
    }
    if (!componentes || componentes.length === 0) {
      return { success: false, error: "Debe agregar al menos un componente a la receta." };
    }

    // 2. Preparamos los datos (limpieza — String() garantiza que trim() funcione aunque llegue un número)
    const cleanMla = String(mla).trim().toUpperCase();
    const cleanTitle = String(titulo).trim();
    const cleanVarName = nombre_variante != null ? String(nombre_variante).trim() || null : null;
    const cleanVarId = variation_id != null ? String(variation_id).trim() || null : null;
    const cleanUP = user_product_id != null ? String(user_product_id).trim().toUpperCase() || null : null;
    const cleanFamily = family_id != null ? String(family_id).trim() || null : null;

    // 3. Lógica: Check-then-Act para producto maestro
    const existingProduct = await prisma.productosMaestros.findFirst({
      where: {
        mla: cleanMla,
        variation_id: cleanVarId
      }
    });

    let maestroId: number;
    if (existingProduct) {
      // SI EXISTE: Actualizamos
      await prisma.productosMaestros.update({
        where: { id: existingProduct.id },
        data: {
          nombre_publicacion: cleanTitle,
          nombre_variante: cleanVarName,
          user_product_id: cleanUP,
          family_id: cleanFamily,
          estado: "active",
          ultima_actualizacion: new Date()
        }
      });
      maestroId = existingProduct.id;
    } else {
      // NO EXISTE: Creamos
      const newMaestro = await prisma.productosMaestros.create({
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
      maestroId = newMaestro.id;
    }

    // 4. Crear/recetar componentes del kit
    for (const comp of componentes) {
      const cleanIdArticulo = comp.id_articulo?.trim() || "";
      const cleanCantidad = Math.round(Number(comp.cantidad)) || 1;
      const cleanNombreArticulo = comp.nombre_articulo?.trim() || "";

      if (!cleanIdArticulo) continue;

      await prisma.composicionKits.upsert({
        where: {
          unique_kit_component: {
            mla: cleanMla,
            nombre_variante: cleanVarName || "0",
            id_articulo: cleanIdArticulo
          }
        },
        create: {
          mla: cleanMla,
          variation_id: cleanVarId,
          nombre_variante: cleanVarName || "0",
          id_articulo: cleanIdArticulo,
          cantidad: cleanCantidad,
          nombre_articulo: cleanNombreArticulo
        },
        update: {
          mla: cleanMla,
          variation_id: cleanVarId,
          nombre_variante: cleanVarName || "0",
          id_articulo: cleanIdArticulo,
          cantidad: cleanCantidad,
          nombre_articulo: cleanNombreArticulo
        }
      });
    }

    // 5. Revalidar
    revalidatePath("/admin/mercadolibre/composicion");
    revalidatePath("/admin/mercadolibre/costos");

    return { success: true };
  } catch (error: any) {
    console.error("Error al crear producto con receta:", error);
    if (error.code === 'P2002') {
      const target = error.meta?.target;
      if (Array.isArray(target) && !target.includes('id')) {
        return { success: false, error: "Este artículo ya existe en esta variante del kit." };
      }
      return { success: false, error: `Error de unicidad en la base de datos (Campo: ${target ? target.join(', ') : 'Desconocido'})` };
    }
    return { success: false, error: error.message || "Error al crear el producto con receta" };
  }
}

// Obtener todas las composiciones de kits ENRIQUECIDAS con los datos Maestros
export async function getComposicionKits() {
  try {
    // 1. Traemos todas las recetas base
    const kits = await prisma.composicionKits.findMany({
      orderBy: [
        { mla: 'asc' },
        { nombre_variante: 'asc' }
      ]
    });

    // 2. Extraemos los MLAs únicos para no saturar la base de datos
    const mlasUnicos = Array.from(new Set(kits.map(k => k.mla)));

    // 3. Buscamos en el "Diccionario" (productos_maestros) esos MLAs específicos
    const maestros = await prisma.productosMaestros.findMany({
      where: { mla: { in: mlasUnicos } },
      select: { mla: true, variation_id: true, user_product_id: true, family_id: true, estado: true, es_nuevo: true }
    });

    // 4. Cruzamos los datos: Le pegamos la Familia y el User Product a cada Kit
    const kitsEnriquecidos = kits.map(kit => {
      // Intentamos coincidencia exacta (MLA + Variación)
      let maestro = maestros.find(m => m.mla === kit.mla && m.variation_id === kit.variation_id);

      // Si no encuentra la variación exacta, hace fallback al MLA genérico
      if (!maestro) {
        maestro = maestros.find(m => m.mla === kit.mla);
      }

      return {
        ...kit,
        user_product_id: maestro?.user_product_id || null,
        family_id: maestro?.family_id || null,
        estado: maestro?.estado || null,
        es_nuevo: maestro?.es_nuevo ?? false,
      };
    });

    // LOG: Verificar si hay kits sin enriquecer
    if (kitsEnriquecidos.length > 0) {
      const sinEnriquecer = kitsEnriquecidos.filter(k => !k.user_product_id && !k.family_id);
      if (sinEnriquecer.length > 0) {
        console.log("⚠️ Kits sin enriquecer (no están en productos_maestros):", sinEnriquecer.map(k => k.mla).join(', '));
      }
    }

    return kitsEnriquecidos;
  } catch (error) {
    console.error("Error al obtener composiciones:", error);
    return [];
  }
}

/**
 * Agregar o editar un componente en un kit de forma individual.
 */
export async function upsertKitComponent(data: any) {
  try {
    const { id, mla, variation_id, nombre_variante, id_articulo, cantidad, nombre_articulo } = data;

    const cleanMla = mla?.trim().toUpperCase() || "";
    const cleanVariationId = (variation_id && variation_id.trim() !== "") ? variation_id.trim() : null;
    const cleanNombreVariante = (nombre_variante && nombre_variante.trim() !== "") ? nombre_variante.trim() : "0";
    const cleanIdArticulo = id_articulo?.trim() || "";
    
    // IMPORTANTE: Tu schema define 'cantidad' como Int. 
    // Usamos Math.round para asegurar que sea un entero y no falle Prisma.
    const cleanCantidad = Math.round(Number(cantidad)) || 1;

    if (id) {
      await prisma.composicionKits.update({
        where: { id: Number(id) },
        data: { 
          mla: cleanMla,
          variation_id: cleanVariationId,
          nombre_variante: cleanNombreVariante, 
          id_articulo: cleanIdArticulo, 
          cantidad: cleanCantidad, 
          nombre_articulo: nombre_articulo?.trim() || ""
        },
      });
    } else {
      await prisma.composicionKits.create({
        data: { 
          mla: cleanMla, 
          variation_id: cleanVariationId,
          nombre_variante: cleanNombreVariante, 
          id_articulo: cleanIdArticulo, 
          cantidad: cleanCantidad, 
          nombre_articulo: nombre_articulo?.trim() || ""
        },
      });
    }

    revalidatePath("/admin/mercadolibre/composicion");
    revalidatePath("/admin/mercadolibre/costos");
    
    return { success: true };
  } catch (error: any) {
    console.error("Error al guardar componente:", error);
    // Si el error es por duplicado (mla-variante-articulo) devolvemos un mensaje claro
    if (error.code === 'P2002') {
        const target = error.meta?.target;
        // La restriccion se llama unique_kit_component o los campos literales
        if (Array.isArray(target) && !target.includes('id')) {
            return { success: false, error: "Este artículo ya existe en esta variante del kit." };
        }
        return { success: false, error: `Error de unicidad en la base de datos (Campo: ${target ? target.join(', ') : 'Desconocido'})` };
    }
    return { 
      success: false, 
      error: error.message || "Error al guardar el componente del kit" 
    };
  }
}

// NUEVO: Guardar una receta completa (Múltiples Variantes con Múltiples Items)
export async function saveBulkKitComponents(payload: { mla: string, variantes: any[] }) {
  try {
    const cleanMla = payload.mla.trim().toUpperCase();
    
    for (const variant of payload.variantes) {
      const cleanVariationId = (variant.variation_id && variant.variation_id.trim() !== "") ? variant.variation_id.trim() : null;
      const cleanNombreVariante = (variant.nombre_variante && variant.nombre_variante.trim() !== "") ? variant.nombre_variante.trim() : "0";
      
      for (const comp of variant.componentes) {
        if (!comp.id_articulo) continue; // Saltamos los campos vacíos
        
        await prisma.composicionKits.create({
          data: {
            mla: cleanMla,
            variation_id: cleanVariationId,
            nombre_variante: cleanNombreVariante,
            id_articulo: comp.id_articulo.trim(),
            cantidad: Math.round(Number(comp.cantidad)) || 1,
            nombre_articulo: comp.nombre_articulo?.trim() || ""
          }
        });
      }
    }
    
    revalidatePath("/admin/mercadolibre/composicion");
    revalidatePath("/admin/mercadolibre/costos");
    return { success: true };
  } catch (error: any) {
    console.error("Error al guardar receta masiva:", error);
    return { success: false, error: error.message };
  }
}

// Eliminar un componente de un kit
export async function deleteKitComponent(id: number) {
  try {
    await prisma.composicionKits.delete({
      where: { id: Number(id) }
    });
    revalidatePath("/admin/mercadolibre/composicion");
    revalidatePath("/admin/mercadolibre/costos");
    return { success: true };
  } catch (error) {
    console.error("Error al eliminar componente:", error);
    return { success: false };
  }
}
