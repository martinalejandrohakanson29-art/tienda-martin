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

      // --- CÁLCULOS DE RENTABILIDAD ---
      
      // 1. Ingreso Real (Lo que te queda antes de comisiones ML)
      const precioFinalNuestro = precioOriginal * (1 - (pctVendedor / 100));

      // 2. Sumatoria de todos los gastos de ML
      const totalCargosML = 
        Number(fee?.cargo_venta_fijo || 0) + 
        Number(fee?.cuotas_fijo || 0) + 
        Number(fee?.envio_costo || 0) + 
        Number(fee?.costo_fijo_ml || 0);

      // 3. NETO TEÓRICO (La verdad de la milanesa)
      // Fórmula: Lo que cobrás - Cargos ML - Lo que te costó el producto
      const netoTeorico = precioFinalNuestro - totalCargosML - costoPropio;

      // 4. Margen Porcentual
      const margenPct = precioFinalNuestro > 0 ? (netoTeorico / precioFinalNuestro) * 100 : 0;

      return {
        item_id: p.mla,
        variation_id: p.variation_id,
        nombre: p.nombre_publicacion || "Sin título",
        nombre_variante: p.nombre_variante,
        precio_original: precioOriginal,
        desc_pct_total: Number(desc?.pct_descuento || 0),
        precio_final: Number(desc?.precio_final || precioPublicado),
        precio_final_nuestro: precioFinalNuestro,
        // DATOS DE COSTO Y NETO
        costo_total: costoPropio,
        neto_teorico: netoTeorico,
        margen_pct: margenPct,
        // DESGLOSE DE CARGOS (para la tabla)
        cargo_venta_fijo: Number(fee?.cargo_venta_fijo || 0),
        cuotas_fijo: Number(fee?.cuotas_fijo || 0),
        envio_costo: Number(fee?.envio_costo || 0),
        costo_fijo_ml: Number(fee?.costo_fijo_ml || 0),
      };
    });
  } catch (error) {
    console.error("Error al obtener datos de rentabilidad:", error);
    return [];
  }
}
