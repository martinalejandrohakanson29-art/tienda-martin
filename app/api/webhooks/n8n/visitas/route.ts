import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateN8nToken } from "@/lib/webhook-guard";

export async function POST(req: Request) {
  const unauthorized = validateN8nToken(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();

    if (Array.isArray(body)) {
      // 1. Creamos una "caja" vacía donde iremos metiendo todas las operaciones juntas.
      // Le decimos a TypeScript que será un array de cualquier tipo (any[]) para evitar advertencias.
      const operacionesDB: any[] = [];

      for (const item of body) {
        const { item_id, visits_detail1, visits_detail2 } = item;

        // Si no hay producto, saltamos al siguiente
        if (!item_id) continue;

        // Preparamos los días del Rango 1 y los metemos en la caja
        if (Array.isArray(visits_detail1)) {
          for (const v of visits_detail1) {
            const cantidad = v.visits || v.quantity || v.total || 0;
            const operacion = prepararUpsert(item_id, v.date, cantidad);
            
            // Validamos: Solo lo guardamos en la caja si la operación no es undefined
            if (operacion) {
              operacionesDB.push(operacion);
            }
          }
        }

        // Preparamos los días del Rango 2 y los metemos en la caja
        if (Array.isArray(visits_detail2)) {
          for (const v of visits_detail2) {
            const cantidad = v.visits || v.quantity || v.total || 0;
            const operacion = prepararUpsert(item_id, v.date, cantidad);
            
            // Validamos: Solo lo guardamos en la caja si la operación no es undefined
            if (operacion) {
              operacionesDB.push(operacion);
            }
          }
        }
      }

      // 2. MAGIA: Ejecutamos TODA la caja de operaciones de un solo golpe (Transacción)
      // Como ya filtramos los "undefined", Prisma funcionará perfectamente.
      await prisma.$transaction(operacionesDB);

      return NextResponse.json({ message: "Detalle de visitas diario procesado súper rápido" });
    }

    return NextResponse.json({ message: "Formato de datos no reconocido" }, { status: 400 });

  } catch (error) {
    console.error("Error detallado en el webhook de visitas:", error);
    return NextResponse.json({ error: "Error interno al guardar" }, { status: 500 });
  }
}

// Esta función ya no guarda en la base de datos inmediatamente,
// sino que solo "escribe" la instrucción para que la ejecutemos toda junta arriba.
function prepararUpsert(mla: string, fechaStr: string, cantidad: number) {
  if (!fechaStr) return undefined; 
  
  const fechaString = fechaStr.includes('T') ? fechaStr : `${fechaStr}T00:00:00Z`;
  const fecha = new Date(fechaString);
  
  return prisma.itemVisitaDiaria.upsert({
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
