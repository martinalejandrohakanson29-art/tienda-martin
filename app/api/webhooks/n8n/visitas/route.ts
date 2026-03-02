import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. DETECTAMOS SI ES EL FORMATO DE LISTA (ARRAY) DEL WORKFLOW DE N8N
    if (Array.isArray(body)) {
      for (const item of body) {
        // Ahora recibimos el array de detalle diario en lugar de solo el total
        const { item_id, visits_detail1, visits_detail2 } = item;

        // Validamos que tenga la info mínima
        if (!item_id) continue;

        // Guardamos el detalle diario del Rango 1
        if (Array.isArray(visits_detail1)) {
          for (const v of visits_detail1) {
            await upsertVisita(item_id, v.date, v.quantity || 0);
          }
        }

        // Guardamos el detalle diario del Rango 2
        if (Array.isArray(visits_detail2)) {
          for (const v of visits_detail2) {
            await upsertVisita(item_id, v.date, v.quantity || 0);
          }
        }
      }
      return NextResponse.json({ message: "Detalle de visitas diario procesado correctamente" });
    }

    // 2. MANTENEMOS COMPATIBILIDAD CON EL FORMATO ANTERIOR (POR SI ACASO)
    const { mla, visitas } = body; 
    if (mla && Array.isArray(visitas)) {
      for (const v of visitas) {
        await upsertVisita(mla, v.date, v.total || v.quantity || 0);
      }
      return NextResponse.json({ message: "Visitas diarias antiguas guardadas correctamente" });
    }

    return NextResponse.json({ message: "Formato de datos no reconocido" }, { status: 200 });

  } catch (error) {
    console.error("Error detallado en el webhook de visitas:", error);
    return NextResponse.json({ error: "Error interno al guardar" }, { status: 500 });
  }
}

// Función auxiliar para realizar el guardado o actualización (upsert)
async function upsertVisita(mla: string, fechaStr: string, cantidad: number) {
  // Aseguramos que la fecha tenga formato válido, agregando la hora UTC si no la trae
  const fechaString = fechaStr.includes('T') ? fechaStr : `${fechaStr}T00:00:00Z`;
  const fecha = new Date(fechaString);
  
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
