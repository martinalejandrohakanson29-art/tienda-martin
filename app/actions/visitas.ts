"use server";

import { prisma } from "@/lib/prisma";

export async function getVisitasComparativas(r1: { from: string; to: string }, r2: { from: string; to: string }) {
  // Convertimos las fechas del front a formato de Base de Datos
  const dateR1From = new Date(`${r1.from}T00:00:00-03:00`);
  const dateR1To = new Date(`${r1.to}T23:59:59.999-03:00`);
  const dateR2From = new Date(`${r2.from}T00:00:00-03:00`);
  const dateR2To = new Date(`${r2.to}T23:59:59.999-03:00`);

  // Buscamos todas las visitas que correspondan a cualquiera de los dos rangos
  const visitas = await prisma.itemVisitaDiaria.findMany({
    where: {
      OR: [
        { fecha: { gte: dateR1From, lte: dateR1To } },
        { fecha: { gte: dateR2From, lte: dateR2To } }
      ]
    },
    orderBy: { fecha: 'asc' } // Súper importante para que el gráfico no salga desordenado
  });

  // Obtenemos los MLAs únicos y buscamos sus títulos en nuestra tabla maestra
  const mlas = Array.from(new Set(visitas.map(v => v.mla)));
  
  const productos = await prisma.productosMaestros.findMany({
    where: { mla: { in: mlas } },
    select: { mla: true, nombre_publicacion: true }
  });
  const nombreMap = new Map(productos.map(p => [p.mla, p.nombre_publicacion]));
  
  // Armamos la respuesta calculando todo artículo por artículo
  const comparativa = mlas.map(mla => {
    const vR1 = visitas.filter(v => v.mla === mla && v.fecha >= dateR1From && v.fecha <= dateR1To);
    const vR2 = visitas.filter(v => v.mla === mla && v.fecha >= dateR2From && v.fecha <= dateR2To);

    const totalR1 = vR1.reduce((acc, curr) => acc + curr.visitas, 0);
    const totalR2 = vR2.reduce((acc, curr) => acc + curr.visitas, 0);
    const diff = totalR2 - totalR1;
    
    // Matemática simple para el porcentaje de crecimiento evitando dividir por 0
    let growth = 0;
    if (totalR1 > 0) {
      growth = (diff / totalR1) * 100;
    } else if (totalR2 > 0) {
      growth = 100; // Si antes había 0 y ahora hay visitas, es un 100% de aumento
    }

    return {
      mla,
      nombre: nombreMap.get(mla) || "Producto sin nombre",
      totalR1,
      totalR2,
      diff,
      growth: growth.toFixed(2),
      historialR1: vR1.map(v => ({ fecha: v.fecha.toISOString().split('T')[0], visitas: v.visitas })),
      historialR2: vR2.map(v => ({ fecha: v.fecha.toISOString().split('T')[0], visitas: v.visitas }))
    };
  });

  return { comparativa };
}
