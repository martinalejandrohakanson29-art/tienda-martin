import { prisma } from "@/lib/prisma";

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Mantiene sincronizado el costo con la tabla legado de MercadoLibre (costos_articulos_old),
// que alimenta la vista vista_costos_productos usada en /admin/mercadolibre/costos.
// Mismo patrón que upsertCostosML en compras.ts, pero con el costo ya en ARS (es_dolar: false).
export async function syncCostoArticuloML(tx: TxClient, id: string, nombre: string, costoArs: number) {
  await tx.costosArticulos.upsert({
    where: { id_articulo: id },
    update: { costo_usd: costoArs, es_dolar: false, costo_final_ars: costoArs, fecha_actualizacion: new Date() },
    create: { id_articulo: id, descripcion: nombre, costo_usd: costoArs, es_dolar: false, costo_final_ars: costoArs }
  });
}
