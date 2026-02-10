"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// 1. Obtener datos para la tabla
export async function getRentabilidadData() {
  try {
    // Traemos los productos activos
    const productos = await prisma.productosMaestros.findMany({
      where: { estado: "active" },
      orderBy: { nombre_publicacion: 'asc' },
    });

    // Traemos cargos y descuentos
    const cargos = await prisma.mLFees.findMany();
    const cargosMap = new Map(cargos.map(c => [c.mla, c]));

    const descuentos = await prisma.mLDescuentos.findMany();
    const descuentosMap = new Map(descuentos.map(d => [d.mla, d]));

    // Traemos los costos de la VISTA (Base de datos)
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

      // --- CÁLCULO DE DEDUCCIONES DE MERCADO LIBRE ---
      const cargoVenta = Number(fee?.cargo_venta_fijo || 0) > 0 
        ? Number(fee?.cargo_venta_fijo) 
        : (precioFinalML * Number(fee?.cargo_venta_percent || 0) / 100);

      const costoCuotas = Number(fee?.cuotas_fijo || 0) > 0 
        ? Number(fee?.cuotas_fijo) 
        : (precioFinalML * Number(fee?.cuotas_percent || 0) / 100);

      const envio = Number(fee?.envio_costo || 0);
      const costoFijoML = Number(fee?.costo_fijo_ml || 0);

      // --- NETO TEÓRICO (Dinero que recibís de ML) ---
      const netoTeorico = precioFinalNuestro - cargoVenta - costoCuotas - envio - costoFijoML;

      // --- CÁLCULOS DE GANANCIA ---
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

// 2. Nueva función para disparar los 3 Workflows de n8n
export async function triggerRentabilidadUpdate() {
  const webhooks = [
    "https://n8n-on-render-production-52f0.up.railway.app/webhook/publicaciones-activas",
    "https://n8n-on-render-production-52f0.up.railway.app/webhook/descuentos_ml",
    "https://n8n-on-render-production-52f0.up.railway.app/webhook/cargo_ventas"
  ];

  try {
    // Ejecutamos los 3 llamados al mismo tiempo
    await Promise.all(
      webhooks.map(url => 
        fetch(url, { 
          method: 'POST',
          cache: 'no-store' // Para asegurar que no use datos viejos
        })
      )
    );

    // Refrescamos la página para que se vean los nuevos datos
    revalidatePath("/admin/mercadolibre/rentabilidad");
    
    return { success: true };
  } catch (error) {
    console.error("Error al disparar n8n:", error);
    return { success: false, error: "No se pudo conectar con n8n" };
  }
}
