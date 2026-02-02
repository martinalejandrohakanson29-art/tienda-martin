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
      
      return {
        item_id: p.mla,
        nombre: p.nombre_publicacion || "Sin título",
        precio_venta: Number(p.precio_venta_ml || 0),
        // Cargos
        cargo_venta_total: Number(fee?.cargo_venta_fijo || 0) + Number(fee?.cuotas_fijo || 0),
        envio: Number(fee?.envio_costo || 0),
        // Descuentos (de n8n)
        precio_original: Number(desc?.original_price || p.precio_venta_ml || 0),
        desc_pct_total: Number(desc?.pct_descuento || 0),
        desc_vendedor_pct: Number(desc?.seller_percentage || 0),
        desc_meli_pct: Number(desc?.meli_percentage || 0),
      };
    });
  } catch (error) {
    console.error("Error al obtener datos de rentabilidad:", error);
    return [];
  }
}
