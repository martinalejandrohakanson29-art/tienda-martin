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
      const desc = descuentosMap.get(p.mla);
      
      // Respaldo por si no hay dato en la tabla de descuentos aún
      const precioPublicado = Number(p.precio_venta_ml || 0);

      return {
        item_id: p.mla,
        nombre: p.nombre_publicacion || "Sin título",
        // 1. Precio original (el "tachado")
        precio_original: Number(desc?.original_price || precioPublicado),
        // 2, 3, 4. Porcentajes de descuento
        desc_pct_total: Number(desc?.pct_descuento || 0),
        desc_vendedor_pct: Number(desc?.seller_percentage || 0),
        desc_meli_pct: Number(desc?.meli_percentage || 0),
        // 5. ¿Es descuento manual?
        descuento_manual: desc?.descuento_propio || "NO",
        // 6. PRECIO FINAL: Tomado directamente del campo precio_final de la DB
        precio_final: Number(desc?.precio_final || precioPublicado),
      };
    });
  } catch (error) {
    console.error("Error al obtener datos de rentabilidad:", error);
    return [];
  }
}
