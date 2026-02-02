"use server";

import { prisma } from "@/lib/prisma";

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

    return productos.map(p => {
      const fee = cargosMap.get(p.mla);
      const desc = descuentosMap.get(p.mla);
      
      const precioPublicado = Number(p.precio_venta_ml || 0);
      const precioOriginal = Number(desc?.original_price || precioPublicado);
      const pctVendedor = Number(desc?.seller_percentage || 0);

      // FÓRMULA: Precio Original menos mi parte del descuento
      const precioFinalNuestro = precioOriginal * (1 - (pctVendedor / 100));

      return {
        item_id: p.mla,
        nombre: p.nombre_publicacion || "Sin título",
        precio_original: precioOriginal,
        desc_pct_total: Number(desc?.pct_descuento || 0),
        desc_vendedor_pct: pctVendedor,
        desc_meli_pct: Number(desc?.meli_percentage || 0),
        descuento_manual: desc?.descuento_propio || "NO",
        precio_final: Number(desc?.precio_final || precioPublicado),
        precio_final_nuestro: precioFinalNuestro,
        // NUEVOS DATOS DE ML_FEES
        cargo_venta_fijo: Number(fee?.cargo_venta_fijo || 0),
        cargo_venta_percent: Number(fee?.cargo_venta_percent || 0),
        cuotas_fijo: Number(fee?.cuotas_fijo || 0),
        cuotas_percent: Number(fee?.cuotas_percent || 0),
        envio_costo: Number(fee?.envio_costo || 0),
        costo_fijo_ml: Number(fee?.costo_fijo_ml || 0),
      };
    });
  } catch (error) {
    console.error("Error al obtener datos de rentabilidad:", error);
    return [];
  }
}
