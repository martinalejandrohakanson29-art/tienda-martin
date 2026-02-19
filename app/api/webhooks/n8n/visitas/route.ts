import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { mla, visitas } = body; 
    // 'visitas' será el array que nos manda n8n con { date, quantity }

    if (!mla || !visitas) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }

    // Usamos una transacción para guardar todos los días de una vez
    await Promise.all(
      visitas.map((v: any) =>
        prisma.itemVisitaDiaria.upsert({
          where: {
            mla_fecha: {
              mla: mla,
              fecha: new Date(v.date),
            },
          },
          update: { visitas: v.quantity },
          create: {
            mla: mla,
            fecha: new Date(v.date),
            visitas: v.quantity,
          },
        })
      )
    );

    return NextResponse.json({ message: "Visitas actualizadas correctamente" });
  } catch (error) {
    console.error("Error al guardar visitas:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
