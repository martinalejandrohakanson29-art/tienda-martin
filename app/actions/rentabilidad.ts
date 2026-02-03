"use server";

import { prisma } from "@/lib/prisma";

export async function getRentabilidadData() {
  try {
    // 1. Traemos los productos activos
    const productos = await prisma.productosMaestros.findMany({
      where: { estado: "active" },
      orderBy: { nombre_publicacion: 'asc' },
    });

    // 2. Traemos cargos y descuentos
    const cargos = await prisma.mLFees.findMany();
    const cargosMap = new Map(cargos.map(c => [c.mla, c]));

    const descuentos = await prisma.mLDescuentos.findMany();
    const descuentosMap = new Map(descuentos.map(d => [d.mla, d]));

    // 3. Traemos los costos de la VISTA (Match por MLA + Variante)
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
      const pctVendedor = Number(desc?.seller_percentage || 0);

      // --- CÁLCULOS ---
      const precioFinalNuestro = precioOriginal * (1 - (pctVendedor / 100));

      const cargoVenta = Number(fee?.cargo_venta_fijo || 0);
      const cuotas = Number(fee?.cuotas_fijo || 0);
      const envio = Number(fee?.envio_costo || 0);
      const fijoML = Number(fee?.costo_fijo_ml || 0);

      // NETO TEÓRICO: Lo que cobramos - (Todos los cargos ML) - Costo del producto
      const netoTeorico = precioFinalNuestro - (cargoVenta + cuotas + envio + fijoML) - costoPropio;

      return {
        item_id: p.mla,
        variation_id: p.variation_id,
        nombre: p.nombre_publicacion || "Sin título",
        nombre_variante: p.nombre_variante,
        precio_original: precioOriginal,
        desc_pct_total: Number(desc?.pct_descuento || 0),
        desc_vendedor_pct: pctVendedor,
        desc_meli_pct: Number(desc?.meli_percentage || 0),
        descuento_manual: desc?.descuento_propio || "NO",
        precio_final: Number(desc?.precio_final || precioPublicado),
        precio_final_nuestro: precioFinalNuestro,
        costo_total: costoPropio,
        neto_teorico: netoTeorico,
        // DESGLOSE DE CARGOS
        cargo_venta_fijo: cargoVenta,
        cargo_venta_percent: Number(fee?.cargo_venta_percent || 0),
        cuotas_fijo: cuotas,
        cuotas_percent: Number(fee?.cuotas_percent || 0),
        envio_costo: envio,
        costo_fijo_ml: fijoML,
      };
    });
  } catch (error) {
    console.error("Error al obtener datos de rentabilidad:", error);
    return [];
  }
}
