import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (Array.isArray(body)) {
      for (const item of body) {
        const { item_id, visits_detail1, visits_detail2 } = item;

        // Validamos que exista el artículo
        if (!item_id) continue;

        // Procesar días del Rango 1
        if (Array.isArray(visits_detail1)) {
          for (const v of visits_detail1) {
            // Mercado Libre envía el campo "visits", lo buscamos correctamente
            const cantidad = v.visits || v.quantity || v.total || 0;
            await upsertVisita(item_id, v.date, cantidad);
          }
        }

        // Procesar días del Rango 2
        if (Array.isArray(visits_detail2)) {
          for (const v of visits_detail2) {
            const cantidad = v.visits || v.quantity || v.total || 0;
            await upsertVisita(item_id, v.date, cantidad);
          }
        }
      }
      return NextResponse.json({ message: "Detalle de visitas diario procesado correctamente" });
    }

    return NextResponse.json({ message: "Formato de datos no reconocido" }, { status: 400 });

  } catch (error) {
    console.error("Error detallado en el webhook de visitas:", error);
    return NextResponse.json({ error: "Error interno al guardar" }, { status: 500 });
  }
}

// Función que crea el registro si no existe, o lo actualiza si ya existe
async function upsertVisita(mla: string, fechaStr: string, cantidad: number) {
  if (!fechaStr) return; // Evitamos errores si alguna fecha viene vacía
  
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
