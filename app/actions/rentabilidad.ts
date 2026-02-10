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
      const precioFinalML = Number(desc?.precio_final || precioPublicado);
      const pctVendedor = Number(desc?.seller_percentage || 0);

      // --- CÁLCULO DE INGRESOS ---
      const precioFinalNuestro = precioOriginal * (1 - (pctVendedor / 100));

      // --- CÁLCULO DE DEDUCCIONES ---
      const cargoVenta = Number(fee?.cargo_venta_fijo || 0) > 0 
        ? Number(fee?.cargo_venta_fijo) 
        : (precioFinalML * Number(fee?.cargo_venta_percent || 0) / 100);

      const costoCuotas = Number(fee?.cuotas_fijo || 0) > 0 
        ? Number(fee?.cuotas_fijo) 
        : (precioFinalML * Number(fee?.cuotas_percent || 0) / 100);

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
        precio_final_nuestro: precioFinalNuestro, // Aseguramos incluirlo aquí
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

// Función que dispara webhooks y actualiza la tabla física (Reset y Carga)
export async function triggerRentabilidadUpdate() {
  const webhooks = [
    "https://n8n-on-render-production-52f0.up.railway.app/webhook/publicaciones-activas",
    "https://n8n-on-render-production-52f0.up.railway.app/webhook/descuentos_ml",
    "https://n8n-on-render-production-52f0.up.railway.app/webhook/cargo_ventas"
  ];

  try {
    // 1. Ejecutar webhooks
    await Promise.all(webhooks.map(url => fetch(url, { method: 'POST', cache: 'no-store' })));

    // 2. Obtener datos frescos calculados
    const data = await getRentabilidadData();

    // 3. RESET Y CARGA: Sincronizamos con la tabla física RentabilidadCalculada
    await prisma.$transaction([
      prisma.rentabilidadCalculada.deleteMany({}), 
      prisma.rentabilidadCalculada.createMany({
        data: data.map(item => ({
          mla: item.item_id,
          variation_id: item.variation_id,
          nombre: item.nombre,
          nombre_variante: item.nombre_variante,
          precio_original: item.precio_original,
          desc_pct_total: item.desc_pct_total,
          precio_final: item.precio_final,
          precio_final_nuestro: item.precio_final_nuestro, // FIXED: Campo agregado para que el build pase
          costo_total: item.costo_total,
          neto_teorico: item.neto_teorico,
          ganancia_neta: item.ganancia_neta,
          ganancia_porcentaje: item.ganancia_porcentaje,
        }))
      })
    ]);

    revalidatePath("/admin/mercadolibre/rentabilidad");
    return { success: true };
  } catch (error) {
    console.error("Error en sincronización de rentabilidad:", error);
    return { success: false };
  }
}
