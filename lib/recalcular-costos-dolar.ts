import { prisma } from "@/lib/prisma";
import { syncCostoArticuloML } from "@/lib/sync-costo-ml";

// Recalcula costo/precio de los artículos cargados desde una lista en USD
// (esCostoDolar = true) cada vez que se obtiene una cotización nueva del dólar.
// Silencioso a propósito: no genera auditoría por cada tick horario, para no
// llenar el historial de cada artículo con entradas automáticas.
export async function recalcularCostosPorDolar(dolarVenta: number) {
  const articulos = await prisma.articuloMostrador.findMany({
    where: { esCostoDolar: true, costoUsd: { not: null } }
  });
  if (articulos.length === 0) return;

  const calcular = (art: (typeof articulos)[number]) => {
    const costoNuevo = Number((Number(art.costoUsd) * dolarVenta).toFixed(2));
    const margen = Number(art.margenGanancia || 0);
    const precioNuevo = Number((costoNuevo * (1 + margen / 100)).toFixed(2));
    return { costoNuevo, precioNuevo };
  };

  const paraActualizar = articulos.filter(art => calcular(art).costoNuevo !== Number(art.costo || 0));
  if (paraActualizar.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const art of paraActualizar) {
      const { costoNuevo, precioNuevo } = calcular(art);
      await tx.articuloMostrador.update({
        where: { id: art.id },
        data: { costo: costoNuevo, precio: precioNuevo }
      });
      await syncCostoArticuloML(tx, art.id, art.nombre, costoNuevo);
    }
  }, { timeout: 30000 });
}
