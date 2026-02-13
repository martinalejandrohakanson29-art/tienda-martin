import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Extraemos los datos que mandamos desde n8n
    // n8n suele mandar la info dentro de un objeto o directamente
    const { 
      whatsappId, 
      monto, 
      emisor, 
      receptor, 
      info_extra, 
      de, 
      para 
    } = body;

    if (!whatsappId) {
      return NextResponse.json({ error: "Falta whatsappId" }, { status: 400 });
    }

    // Definimos una ventana de tiempo de 15 minutos para considerar que es la misma operación
    const haceQuinceMinutos = new Date(Date.now() - 3 * 60 * 1000);

    // 1. Buscamos si ya existe una transferencia pendiente de este mismo número de WhatsApp
    const transferenciaExistente = await prisma.transferenciaCruzada.findFirst({
      where: {
        whatsappId: whatsappId,
        procesada: false,
        createdAt: {
          gte: haceQuinceMinutos
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (transferenciaExistente) {
      // 2. Si existe, ACTUALIZAMOS (unimos la info de la foto con la del texto o viceversa)
      const actualizada = await prisma.transferenciaCruzada.update({
        where: { id: transferenciaExistente.id },
        data: {
          // Usamos el dato nuevo si llega, sino mantenemos el que ya teníamos
          monto: monto !== undefined ? monto : transferenciaExistente.monto,
          emisorImagen: emisor || transferenciaExistente.emisorImagen,
          receptorImagen: receptor || transferenciaExistente.receptorImagen,
          infoExtra: info_extra || transferenciaExistente.infoExtra,
          deTexto: de || transferenciaExistente.deTexto,
          paraTexto: para || transferenciaExistente.paraTexto,
        }
      });
      return NextResponse.json({ message: "Transferencia actualizada", id: actualizada.id });
    } else {
      // 3. Si no existe, CREAMOS una nueva entrada
      const nueva = await prisma.transferenciaCruzada.create({
        data: {
          whatsappId,
          monto: monto || null,
          emisorImagen: emisor || null,
          receptorImagen: receptor || null,
          infoExtra: info_extra || null,
          deTexto: de || null,
          paraTexto: para || null,
        }
      });
      return NextResponse.json({ message: "Transferencia creada", id: nueva.id });
    }

  } catch (error) {
    console.error("Error en webhook cruzadas:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
