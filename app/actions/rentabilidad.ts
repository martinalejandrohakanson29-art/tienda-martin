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

    // 3. Traemos los costos de la VISTA para mantener la columna de referencia
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
      
      const precioPublicado = Number(p.precio_venta_ml || 0); //
      const precioOriginal = Number(desc?.original_price || precioPublicado); //
      const precioFinalML = Number(desc?.precio_final || precioPublicado); // El que paga el comprador
      const pctVendedor = Number(desc?.seller_percentage || 0); //

      // --- CÁLCULO DE INGRESOS ---
      // Lo que te corresponde recibir antes de que ML descuente sus servicios
      const precioFinalNuestro = precioOriginal * (1 - (pctVendedor / 100));

      // --- CÁLCULO DE DEDUCCIONES DE MERCADO LIBRE ---
      // 1. Comisión por Venta (Valor fijo o porcentaje)
      const cargoVenta = Number(fee?.cargo_venta_fijo || 0) > 0 
        ? Number(fee?.cargo_venta_fijo) 
        : (precioFinalML * Number(fee?.cargo_venta_percent || 0) / 100);

      // 2. Costo por Cuotas (Valor fijo o porcentaje)
      const costoCuotas = Number(fee?.cuotas_fijo || 0) > 0 
        ? Number(fee?.cuotas_fijo) 
        : (precioFinalML * Number(fee?.cuotas_percent || 0) / 100);

      // 3. Envío y Fijo
      const envio = Number(fee?.envio_costo || 0);
      const costoFijoML = Number(fee?.costo_fijo_ml || 0);

      // --- NETO TEÓRICO (Dinero que recibís de ML) ---
      // Fórmula: Ingreso real - (Comisión + Cuotas + Envío + Cargo Fijo)
      const netoTeorico = precioFinalNuestro - cargoVenta - costoCuotas - envio - costoFijoML;

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
        // DESGLOSE PARA LA TABLA
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
