import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. DETECTAMOS SI ES EL FORMATO DE LISTA (ARRAY) DEL WORKFLOW
    if (Array.isArray(body)) {
      for (const item of body) {
        const { item_id, total_visits1, total_visits2, body: dates } = item;

        // Validamos que tenga la info mínima
        if (!item_id || !dates) continue;

        // Guardamos el total del Rango 1 en su fecha de cierre (to)
        if (total_visits1 !== undefined) {
          await upsertVisita(item_id, dates.r1.to, total_visits1);
        }

        // Guardamos el total del Rango 2 en su fecha de cierre (to)
        if (total_visits2 !== undefined) {
          await upsertVisita(item_id, dates.r2.to, total_visits2);
        }
      }
      return NextResponse.json({ message: "Lista de totales procesada correctamente" });
    }

    // 2. MANTENEMOS COMPATIBILIDAD CON EL FORMATO ANTERIOR (UN SOLO MLA CON DÍAS)
    const { mla, visitas } = body; 
    if (mla && Array.isArray(visitas)) {
      for (const v of visitas) {
        await upsertVisita(mla, v.date, v.total || 0);
      }
      return NextResponse.json({ message: "Visitas diarias guardadas correctamente" });
    }

    return NextResponse.json({ message: "Formato de datos no reconocido" }, { status: 200 });

  } catch (error) {
    console.error("Error detallado en el webhook de visitas:", error);
    return NextResponse.json({ error: "Error interno al guardar" }, { status: 500 });
  }
}

// Función auxiliar para realizar el guardado o actualización (upsert)
async function upsertVisita(mla: string, fechaStr: string, cantidad: number) {
  // Convertimos el string a objeto Date
  const fecha = new Date(fechaStr);
  
  await prisma.itemVisitaDiaria.upsert({
    where: {
      mla_fecha: {
        mla: mla,
        fecha: fecha,
      },
    },
    update: { visitas: cantidad },
    create: {
      mla: mla,
      fecha: fecha,
      visitas: cantidad,
    },
  });
}
