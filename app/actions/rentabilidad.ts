"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// Función para obtener y calcular los datos en tiempo real
export async function getRentabilidadData() {
  try {
    const productos = await prisma.productosMaestros.findMany({
      where: { estado: "active" },
      orderBy: { nombre_publicacion: 'asc' },
    });

    const cargos = await prisma.mLFees.findMany();
    const cargosMap = new Map(cargos.map(c => [c.mla, c]));

    const descuentos = await prisma.mLDescuentos.findMany();
    const descuentosMap = new Map(descuentos.map(d => [d.mla, d]));

    const costosMla: any[] = await prisma.$queryRaw`
      SELECT mla, variation_id, costo_total 
      FROM vista_costos_productos
    `;
    
    const costosMap = new Map(
      costosMla.map(c => [`${c.mla}-${c.variation_id || ""}`, Number(c.costo_total || 0)])
    );

    return productos.map(p => {
      const fee = cargosMap.get(p.mla);
      const desc = descuentosMap.get(p.mla);
      const matchKey = `${p.mla}-${p.variation_id || ""}`;
      const costoPropio = costosMap.get(matchKey) || 0;
      
      const precioPublicado = Number(p.precio_venta_ml || 0);
      const precioOriginal = Number(desc?.original_price || precioPublicado);
      const precioFinalML = Number(desc?.precio_final || precioPublicado); // PRECIO AL PÚBLICO
      const pctVendedor = Number(desc?.seller_percentage || 0);

      // --- CÁLCULO DE INGRESOS ---
      // Lo que te corresponde a vos antes de comisiones
      const precioFinalNuestro = precioOriginal * (1 - (pctVendedor / 100));

      // --- CÁLCULO DE DEDUCCIONES (CORREGIDO) ---
      // Ahora forzamos a que si existe el porcentaje (percentage_fee), calcule sobre el Precio Público
      const pctCargoVenta = Number(fee?.cargo_venta_percent || 0);
      const cargoVenta = pctCargoVenta > 0 
        ? (precioFinalML * pctCargoVenta / 100)
        : Number(fee?.cargo_venta_fijo || 0);

      // Lo mismo para el costo de las cuotas (ej: el 4% de plan clásico)
      const pctCuotas = Number(fee?.cuotas_percent || 0);
      const costoCuotas = pctCuotas > 0 
        ? (precioFinalML * pctCuotas / 100)
        : Number(fee?.cuotas_fijo || 0);

      const envio = Number(fee?.envio_costo || 0);
      const costoFijoML = Number(fee?.costo_fijo_ml || 0);

      const netoTeorico = precioFinalNuestro - cargoVenta - costoCuotas - envio - costoFijoML;
      const gananciaNeta = netoTeorico - costoPropio;
      const gananciaPorcentaje = costoPropio > 0 ? (gananciaNeta / costoPropio) * 100 : 0;

      return {
        item_id: p.mla,
        variation_id: p.variation_id,
        nombre: p.nombre_publicacion || "Sin título",
        nombre_variante: p.nombre_variante,
        precio_original: precioOriginal,
        desc_pct_total: Number(desc?.pct_descuento || 0),
        precio_final: precioFinalML,
        precio_final_nuestro: precioFinalNuestro,
        costo_total: costoPropio,
        neto_teorico: netoTeorico,
        ganancia_neta: gananciaNeta,
        ganancia_porcentaje: gananciaPorcentaje,
        cargo_venta_real: cargoVenta + costoCuotas,
        envio_costo: envio,
        costo_fijo_ml: costoFijoML
      };
    });
  } catch (error) {
    console.error("Error al obtener datos de rentabilidad:", error);
    return [];
  }
}

// Limpia todos los datos de rentabilidad para una lectura fresca
export async function clearRentabilidadData() {
  try {
    await prisma.$transaction([
      // Deja los productos sin estado activo (no los borra, preserva el registro)
      prisma.productosMaestros.updateMany({
        where: { estado: "active" },
        data: { estado: null }
      }),
      prisma.mLFees.deleteMany({}),
      prisma.mLDescuentos.deleteMany({}),
      prisma.rentabilidadCalculada.deleteMany({})
    ]);
    revalidatePath("/admin/mercadolibre/rentabilidad");
    return { success: true };
  } catch (error) {
    console.error("Error al limpiar datos de rentabilidad:", error);
    return { success: false };
  }
}

// Función que limpia datos viejos y dispara la actualización completa
// publicaciones-activas llama a cargo_ventas internamente al terminar (secuencial)
export async function triggerRentabilidadUpdate() {
  try {
    // 1. Limpiar datos viejos para que solo queden los activos reales de ML
    await prisma.$transaction([
      prisma.productosMaestros.updateMany({
        where: { estado: "active" },
        data: { estado: null }
      }),
      prisma.mLFees.deleteMany({}),
      prisma.mLDescuentos.deleteMany({}),
      prisma.rentabilidadCalculada.deleteMany({})
    ]);

    // 2. Disparar publicaciones-activas; al terminar llama cargo_ventas internamente
    await fetch("https://n8n.revolucionmotos.tech/webhook/publicaciones-activas", {
      method: 'POST',
      cache: 'no-store'
    });

    revalidatePath("/admin/mercadolibre/rentabilidad");
    return { success: true };
  } catch (error) {
    console.error("Error en sincronización de rentabilidad:", error);
    return { success: false };
  }
}
