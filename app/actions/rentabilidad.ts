// app/actions/rentabilidad.ts
"use server";

import { prisma } from "@/lib/prisma";

export async function getRentabilidadData() {
  try {
    // Traemos productos activos y sus cargos asociados
    const productos = await prisma.productosMaestros.findMany({
      where: { estado: "active" },
      orderBy: { nombre_publicacion: 'asc' },
    });

    const cargos = await prisma.mLFees.findMany();
    const cargosMap = new Map(cargos.map(c => [c.mla, c]));

    return productos.map(p => {
      const fee = cargosMap.get(p.mla);
      return {
        item_id: p.mla,
        nombre: p.nombre_publicacion || "Sin título",
        precio_venta: Number(p.precio_venta_ml || 0),
        // Datos de la nueva tabla
        cargo_venta_ars: Number(fee?.cargo_venta_fijo || 0),
        cargo_venta_porc: Number(fee?.cargo_venta_percent || 0),
        cuotas_ars: Number(fee?.cuotas_fijo || 0),
        cuotas_porc: Number(fee?.cuotas_percent || 0),
        envio: Number(fee?.envio_costo || 0),
        costo_fijo_ml: Number(fee?.costo_fijo_ml || 0),
      };
    });
  } catch (error) {
    console.error("Error al obtener datos de rentabilidad:", error);
    return [];
  }
}
