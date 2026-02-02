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
      
      const precioVenta = Number(p.precio_venta_ml || 0);
      const cargoTotal = Number(fee?.cargo_venta_fijo || 0) + Number(fee?.cuotas_fijo || 0);
      const envioCosto = Number(fee?.envio_costo || 0);

      return {
        item_id: p.mla,
        nombre: p.nombre_publicacion || "Sin título",
        // 1. Precio original (tachado)
        precio_original: Number(desc?.original_price || precioVenta),
        // 2, 3, 4. Descuentos
        desc_pct_total: Number(desc?.pct_descuento || 0),
        desc_vendedor_pct: Number(desc?.seller_percentage || 0),
        desc_meli_pct: Number(desc?.meli_percentage || 0),
        // 5. Descuento Manual
        descuento_manual: desc?.descuento_propio || "NO",
        // 6. Precio final (lo que paga el cliente)
        precio_final: precioVenta,
        // 7. Precio final nuestro (neto después de cargos y envío)
        precio_final_nuestro: precioVenta - cargoTotal - envioCosto,
        // Extras para referencia visual en cargos
        cargo_total: cargoTotal,
        envio: envioCosto
      };
    });
  } catch (error) {
    console.error("Error al obtener datos de rentabilidad:", error);
    return [];
  }
}
