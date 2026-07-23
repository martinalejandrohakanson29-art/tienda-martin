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

    // 3b. Traemos el costo de cada artículo usado en las recetas. Puede venir de
    //     costos_articulos (costo_final_ars ya viene "rolleado", incluye kits
    //     anidados) o, si el componente se agregó desde Artículos Mostrador, de
    //     ArticuloMostrador.costo (solo para los ids que no aparezcan en costos_articulos).
    const articulosUnicos = Array.from(new Set(kits.map(k => k.id_articulo).filter(Boolean)));
    const [costos, mostrador] = await Promise.all([
      prisma.costosArticulos.findMany({
        where: { id_articulo: { in: articulosUnicos } },
        select: { id_articulo: true, costo_final_ars: true }
      }),
      prisma.articuloMostrador.findMany({
        where: { id: { in: articulosUnicos } },
        select: { id: true, costo: true }
      }),
    ]);
    const costoMap = new Map(
      costos.map(c => [c.id_articulo, c.costo_final_ars ? Number(c.costo_final_ars) : 0])
    );
    for (const m of mostrador) {
      if (!costoMap.has(m.id)) costoMap.set(m.id, m.costo ? Number(m.costo) : 0);
    }

    // 4. Cruzamos los datos: Le pegamos la Familia y el User Product a cada Kit
    const kitsEnriquecidos = kits.map(kit => {
      // Intentamos coincidencia exacta (MLA + Variación)
      let maestro = maestros.find(m => m.mla === kit.mla && m.variation_id === kit.variation_id);

      // Si no encuentra la variación exacta, hace fallback al MLA genérico
      if (!maestro) {
        maestro = maestros.find(m => m.mla === kit.mla);
      }

      // null = el artículo no existe en costos_articulos (no podemos costear el componente)
      const costoUnitario = costoMap.has(kit.id_articulo) ? costoMap.get(kit.id_articulo)! : null;
      const subtotal = costoUnitario != null ? costoUnitario * (kit.cantidad || 0) : null;

      return {
        ...kit,
        user_product_id: maestro?.user_product_id || null,
        family_id: maestro?.family_id || null,
        estado: maestro?.estado || null,
        es_nuevo: maestro?.es_nuevo ?? false,
        costo_unitario: costoUnitario,
        subtotal,
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
 * Construye la lista de "agregados" (insumos) para el filtro de rentabilidad.
 * Cada agregado guarda los MLA de las publicaciones que lo contienen, EXPANDIENDO
 * los kits anidados (tabla articulos_compuestos / BOM): si un insumo es hijo de un
 * kit, las publicaciones que llevan ese kit también cuentan como que tienen el insumo.
 * Ej: "CIGUEÑAL DAKAR" aparece suelto en 8 pubs pero también dentro de "KIT DAKAR 200",
 * por lo que las pubs de ese kit también deben matchear.
 */
export async function getComposicionAgregados() {
  try {
    const [kits, bom] = await Promise.all([
      prisma.composicionKits.findMany({
        select: { mla: true, id_articulo: true, nombre_articulo: true },
      }),
      prisma.articulosCompuestos.findMany({
        select: { sku_padre: true, sku_hijo: true },
      }),
    ]);

    // BOM inverso: hijo -> padres directos
    const parentsOf = new Map<string, Set<string>>();
    for (const r of bom) {
      const hijo = (r.sku_hijo || "").trim();
      const padre = (r.sku_padre || "").trim();
      if (!hijo || !padre) continue;
      if (!parentsOf.has(hijo)) parentsOf.set(hijo, new Set());
      parentsOf.get(hijo)!.add(padre);
    }

    // ancestros(id): todos los kits que contienen a 'id' directa o transitivamente
    const ancestorsCache = new Map<string, Set<string>>();
    const ancestors = (id: string): Set<string> => {
      const cached = ancestorsCache.get(id);
      if (cached) return cached;
      const out = new Set<string>();
      const stack = Array.from(parentsOf.get(id) || []);
      while (stack.length) {
        const p = stack.pop()!;
        if (out.has(p)) continue;
        out.add(p);
        for (const pp of Array.from(parentsOf.get(p) || [])) stack.push(pp);
      }
      ancestorsCache.set(id, out);
      return out;
    };

    // MLAs directos por id_articulo + nombre de cada insumo
    const directMlas = new Map<string, Set<string>>();
    const nombreDe = new Map<string, string>();
    for (const k of kits) {
      const id = (k.id_articulo || "").trim();
      if (!id) continue;
      if (!directMlas.has(id)) directMlas.set(id, new Set());
      const mla = (k.mla || "").trim();
      if (mla) directMlas.get(id)!.add(mla);
      if (!nombreDe.has(id) && k.nombre_articulo) nombreDe.set(id, k.nombre_articulo.trim());
    }

    // Para cada insumo, MLAs efectivos = directos + los de los kits que lo contienen
    const agregados = Array.from(directMlas.keys()).map((id) => {
      const mlas = new Set(directMlas.get(id));
      for (const kitId of Array.from(ancestors(id))) {
        for (const m of Array.from(directMlas.get(kitId) || [])) mlas.add(m);
      }
      return {
        id_articulo: id,
        nombre_articulo: nombreDe.get(id) || id,
        mlas: Array.from(mlas),
      };
    });

    agregados.sort((a, b) => a.nombre_articulo.localeCompare(b.nombre_articulo, "es"));
    return agregados;
  } catch (error) {
    console.error("Error al obtener agregados de composición:", error);
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

// NUEVO: Crear/actualizar VARIAS variantes (maestro + receta) en un solo paso.
// Pensado para el importador multi-variante de la sección Composición.
// Cada variante crea/actualiza su producto maestro y, si trae componentes, su receta.
// Tolera variantes sin componentes (queda como "SIN RECETA" para recetar después).
export async function createVariantsBulk(payload: {
  variantes: Array<{
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
  }>;
}) {
  try {
    if (!payload.variantes || payload.variantes.length === 0) {
      return { success: false, error: "No hay variantes para guardar." };
    }

    let creadas = 0;
    const errores: string[] = [];

    for (const v of payload.variantes) {
      const cleanMla = String(v.mla ?? "").trim().toUpperCase();
      const cleanTitle = String(v.titulo ?? "").trim();

      if (!cleanMla || !cleanTitle) {
        errores.push(`Variante sin MLA o título (${v.nombre_variante || v.variation_id || "?"})`);
        continue;
      }

      const cleanVarName = v.nombre_variante != null ? String(v.nombre_variante).trim() || null : null;
      const cleanVarId = v.variation_id != null ? String(v.variation_id).trim() || null : null;
      const cleanUP = v.user_product_id != null ? String(v.user_product_id).trim().toUpperCase() || null : null;
      const cleanFamily = v.family_id != null ? String(v.family_id).trim() || null : null;

      // 1. Producto maestro: check-then-act (igual criterio que createProductWithRecipe)
      const existingProduct = await prisma.productosMaestros.findFirst({
        where: { mla: cleanMla, variation_id: cleanVarId }
      });

      if (existingProduct) {
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
      } else {
        await prisma.productosMaestros.create({
          data: {
            mla: cleanMla,
            nombre_publicacion: cleanTitle,
            nombre_variante: cleanVarName,
            variation_id: cleanVarId,
            user_product_id: cleanUP,
            family_id: cleanFamily,
            estado: "active",
            es_nuevo: v.es_nuevo ?? false,
            link_publicacion: `https://articulo.mercadolibre.com.ar/${cleanMla}`
          }
        });
      }

      // 2. Receta (si trae componentes)
      for (const comp of (v.componentes || [])) {
        const cleanIdArticulo = comp.id_articulo?.trim() || "";
        if (!cleanIdArticulo) continue;

        const cleanCantidad = Math.round(Number(comp.cantidad)) || 1;
        const cleanNombreArticulo = comp.nombre_articulo?.trim() || "";

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

      creadas++;
    }

    revalidatePath("/admin/mercadolibre/composicion");
    revalidatePath("/admin/mercadolibre/costos");

    if (creadas === 0) {
      return { success: false, error: "No se guardó ninguna variante. " + errores.join("; ") };
    }
    return { success: true, creadas, errores };
  } catch (error: any) {
    console.error("Error al crear variantes en lote:", error);
    if (error.code === 'P2002') {
      const target = error.meta?.target;
      return { success: false, error: `Error de unicidad en la base de datos (Campo: ${target ? (Array.isArray(target) ? target.join(', ') : target) : 'Desconocido'})` };
    }
    return { success: false, error: error.message || "Error al guardar las variantes" };
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
