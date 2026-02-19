// app/actions/visitas.ts
"use server";

import { prisma } from "@/lib/prisma";

export async function getVisitasComparativas(r1: { from: string; to: string }, r2: { from: string; to: string }) {
  // 1. Buscamos todas las visitas que caigan en cualquiera de los dos rangos
  const visitas = await prisma.itemVisitaDiaria.findMany({
    where: {
      OR: [
        { fecha: { gte: new Date(r1.from), lte: new Date(r1.to) } },
        { fecha: { gte: new Date(r2.from), lte: new Date(r2.to) } }
      ]
    },
    orderBy: { fecha: 'asc' }
  });

  // 2. Buscamos nombres de productos
  const productos = await prisma.productosMaestros.findMany({
    select: { mla: true, nombre_publicacion: true }
  });

  const nombreMap = new Map(productos.map(p => [p.mla, p.nombre_publicacion]));

  // 3. Identificamos todos los MLA que tuvieron visitas en el rango total
  const mlas = Array.from(new Set(visitas.map(v => v.mla)));
  
  const comparativa = mlas.map(mla => {
    // Filtrado preciso usando el tiempo en milisegundos para evitar errores de zona horaria
    const f1_start = new Date(r1.from).getTime();
    const f1_end = new Date(r1.to).getTime();
    const f2_start = new Date(r2.from).getTime();
    const f2_end = new Date(r2.to).getTime();

    const vR1 = visitas.filter(v => {
      const time = new Date(v.fecha).getTime();
      return v.mla === mla && time >= f1_start && time <= f1_end;
    });
    
    const vR2 = visitas.filter(v => {
      const time = new Date(v.fecha).getTime();
      return v.mla === mla && time >= f2_start && time <= f2_end;
    });

    const totalR1 = vR1.reduce((acc, curr) => acc + curr.visitas, 0);
    const totalR2 = vR2.reduce((acc, curr) => acc + curr.visitas, 0);
    
    const diff = totalR2 - totalR1;
    const growth = totalR1 > 0 ? (diff / totalR1) * 100 : (totalR2 > 0 ? 100 : 0);

    return {
      mla,
      nombre: nombreMap.get(mla) || "Producto sin nombre",
      totalR1,
      totalR2,
      diff,
      growth: growth.toFixed(2)
    };
  });

  // Ordenar por defecto por el Periodo 2 (más recientes)
  comparativa.sort((a, b) => b.totalR2 - a.totalR2);

  return { comparativa };
}
