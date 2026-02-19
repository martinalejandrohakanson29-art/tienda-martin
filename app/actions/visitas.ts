// app/actions/visitas.ts
"use server";

import { prisma } from "@/lib/prisma";

export async function getVisitasComparativas(r1: { from: string; to: string }, r2: { from: string; to: string }) {
  const visitas = await prisma.itemVisitaDiaria.findMany({
    where: {
      fecha: {
        intermediate: [new Date(r1.from), new Date(r2.to)], // Buscamos todo el rango
      },
    },
    orderBy: { fecha: 'asc' }
  });

  // Buscamos nombres de productos para que no veas solo "MLAxxxx"
  const productos = await prisma.productosMaestros.findMany({
    select: { mla: true, nombre_publicacion: true }
  });

  const nombreMap = new Map(productos.map(p => [p.mla, p.nombre_publicacion]));

  // Procesamos los datos por MLA
  const mlas = Array.from(new Set(visitas.map(v => v.mla)));
  
  const comparativa = mlas.map(mla => {
    const vR1 = visitas.filter(v => v.mla === mla && v.fecha >= new Date(r1.from) && v.fecha <= new Date(r1.to));
    const vR2 = visitas.filter(v => v.mla === mla && v.fecha >= new Date(r2.from) && v.fecha <= new Date(r2.to));

    const totalR1 = vR1.reduce((acc, curr) => acc + curr.visitas, 0);
    const totalR2 = vR2.reduce((acc, curr) => acc + curr.visitas, 0);
    const diff = totalR2 - totalR1;
    const growth = totalR1 > 0 ? (diff / totalR1) * 100 : 0;

    return {
      mla,
      nombre: nombreMap.get(mla) || "Producto sin nombre",
      totalR1,
      totalR2,
      diff,
      growth: growth.toFixed(2)
    };
  });

  return { comparativa, visitasRaw: visitas };
}
