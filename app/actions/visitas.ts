// app/actions/visitas.ts
"use server";

import { prisma } from "@/lib/prisma";

export async function getVisitasComparativas(r1: { from: string; to: string }, r2: { from: string; to: string }) {
  // Traemos todas las visitas que estén en cualquiera de los dos rangos
  // Agregamos orderBy para que los días vengan ordenados correctamente en el gráfico
  const visitas = await prisma.itemVisitaDiaria.findMany({
    where: {
      OR: [
        { fecha: { gte: new Date(`${r1.from}T00:00:00Z`), lte: new Date(`${r1.to}T23:59:59Z`) } },
        { fecha: { gte: new Date(`${r2.from}T00:00:00Z`), lte: new Date(`${r2.to}T23:59:59Z`) } }
      ]
    },
    orderBy: {
      fecha: 'asc'
    }
  });

  const productos = await prisma.productosMaestros.findMany({
    select: { mla: true, nombre_publicacion: true }
  });

  const nombreMap = new Map(productos.map(p => [p.mla, p.nombre_publicacion]));
  const mlas = Array.from(new Set(visitas.map(v => v.mla)));
  
  const comparativa = mlas.map(mla => {
    // Filtramos localmente para cada periodo asegurando que la fecha coincida
    const vR1 = visitas.filter(v => 
      v.mla === mla && 
      v.fecha >= new Date(`${r1.from}T00:00:00Z`) && 
      v.fecha <= new Date(`${r1.to}T23:59:59Z`)
    );
    
    const vR2 = visitas.filter(v => 
      v.mla === mla && 
      v.fecha >= new Date(`${r2.from}T00:00:00Z`) && 
      v.fecha <= new Date(`${r2.to}T23:59:59Z`)
    );

    const totalR1 = vR1.reduce((acc, curr) => acc + curr.visitas, 0);
    const totalR2 = vR2.reduce((acc, curr) => acc + curr.visitas, 0);
    const diff = totalR2 - totalR1;
    const growth = totalR1 > 0 ? (diff / totalR1) * 100 : (totalR2 > 0 ? 100 : 0);

    // Guardamos el historial de cada día para armar el gráfico luego
    const historialR1 = vR1.map(v => ({
      fecha: v.fecha.toISOString().split('T')[0],
      visitas: v.visitas
    }));

    const historialR2 = vR2.map(v => ({
      fecha: v.fecha.toISOString().split('T')[0],
      visitas: v.visitas
    }));

    return {
      mla,
      nombre: nombreMap.get(mla) || "Producto sin nombre",
      totalR1,
      totalR2,
      diff,
      growth: growth.toFixed(2),
      historialR1, // <--- Nueva información enviada al frontend
      historialR2  // <--- Nueva información enviada al frontend
    };
  });

  return { comparativa };
}
