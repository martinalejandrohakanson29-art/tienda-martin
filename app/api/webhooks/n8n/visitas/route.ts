import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { mla, visitas } = body; 

    if (!mla || !visitas || !Array.isArray(visitas)) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    // Usamos un bucle para guardar cada día
    for (const v of visitas) {
      // Mercado Libre manda el dato en 'v.total'
      const cantidadVisitas = v.total || 0;
      
      await prisma.itemVisitaDiaria.upsert({
        where: {
          mla_fecha: {
            mla: mla,
            fecha: new Date(v.date),
          },
        },
        update: { visitas: cantidadVisitas },
        create: {
          mla: mla,
          fecha: new Date(v.date),
          visitas: cantidadVisitas,
        },
      });
    }

    return NextResponse.json({ message: "Visitas guardadas correctamente" });
  } catch (error) {
    console.error("Error detallado:", error);
    return NextResponse.json({ error: "Error interno al guardar" }, { status: 500 });
  }
}
