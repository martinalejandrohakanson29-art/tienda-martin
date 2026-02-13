import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Agregamos imageUrl a la desestructuración
    const { whatsappId, monto, emisor, receptor, info_extra, de, para, imageUrl } = body;

    if (!whatsappId) return NextResponse.json({ error: "Falta whatsappId" }, { status: 400 });

    const haceQuinceMinutos = new Date(Date.now() - 15 * 60 * 1000);

    const transferenciaExistente = await prisma.transferenciaCruzada.findFirst({
      where: {
        whatsappId: whatsappId,
        procesada: false,
        createdAt: { gte: haceQuinceMinutos }
      },
      orderBy: { createdAt: 'desc' }
    });

    const clean = (val: any) => (val === "null" || val === "" || val === undefined) ? null : val;

    if (transferenciaExistente) {
      await prisma.transferenciaCruzada.update({
        where: { id: transferenciaExistente.id },
        data: {
          monto: clean(monto) ?? transferenciaExistente.monto,
          emisorImagen: clean(emisor) ?? transferenciaExistente.emisorImagen,
          receptorImagen: clean(receptor) ?? transferenciaExistente.receptorImagen,
          infoExtra: clean(info_extra) ?? transferenciaExistente.infoExtra,
          deTexto: clean(de) ?? transferenciaExistente.deTexto,
          paraTexto: clean(para) ?? transferenciaExistente.paraTexto,
          imageUrl: clean(imageUrl) ?? transferenciaExistente.imageUrl, // <--- GUARDAR URL
        }
      });
      return NextResponse.json({ message: "Actualizada con éxito" });
    } else {
      await prisma.transferenciaCruzada.create({
        data: {
          whatsappId,
          monto: clean(monto),
          emisorImagen: clean(emisor),
          receptorImagen: clean(receptor),
          infoExtra: clean(info_extra),
          deTexto: clean(de),
          paraTexto: clean(para),
          imageUrl: clean(imageUrl), // <--- GUARDAR URL
        }
      });
      return NextResponse.json({ message: "Creada con éxito" });
    }
  } catch (error) {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
