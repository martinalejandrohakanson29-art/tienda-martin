import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { whatsappId, monto, emisor, receptor, info_extra, de, para } = body;

    if (!whatsappId) return NextResponse.json({ error: "Falta whatsappId" }, { status: 400 });

    const clean = (val: any) => (val === "null" || val === "" || val === undefined) ? null : val;
    const haceQuinceMinutos = new Date(Date.now() - 3 * 60 * 1000);

    const montoLimpio = clean(monto);
    let errorMonto = false;
    let montoImagen: number | null = null;
    let montoTexto: number | null = null;

    // --- ESCENARIO A: VIENEN DATOS DE IMAGEN ---
    if (emisor || receptor || info_extra) {
      // 1. Guardamos en la tabla de imágenes
      const nuevaImagen = await prisma.transferenciaImagen.create({
        data: {
          whatsappId,
          monto: montoLimpio,
          emisor: clean(emisor),
          receptor: clean(receptor),
          infoExtra: clean(info_extra),
        }
      });

      montoImagen = Number(nuevaImagen.monto);

      // 2. Buscamos si hay un texto reciente para comparar
      const textoReciente = await prisma.transferenciaTexto.findFirst({
        where: { whatsappId, createdAt: { gte: haceQuinceMinutos }, procesada: false },
        orderBy: { createdAt: 'desc' }
      });

      if (textoReciente && textoReciente.monto) {
        montoTexto = Number(textoReciente.monto);
        if (montoImagen !== montoTexto) errorMonto = true;
      }

      return NextResponse.json({ 
        message: "Imagen guardada", 
        errorMonto, 
        montoImagen, 
        montoTexto 
      });
    }

    // --- ESCENARIO B: VIENEN DATOS DE TEXTO ---
    if (de || para) {
      // 1. Guardamos en la tabla de texto
      const nuevoTexto = await prisma.transferenciaTexto.create({
        data: {
          whatsappId,
          monto: montoLimpio,
          de: clean(de),
          para: clean(para),
        }
      });

      montoTexto = Number(nuevoTexto.monto);

      // 2. Buscamos si hay una imagen reciente para comparar
      const imagenReciente = await prisma.transferenciaImagen.findFirst({
        where: { whatsappId, createdAt: { gte: haceQuinceMinutos }, procesada: false },
        orderBy: { createdAt: 'desc' }
      });

      if (imagenReciente && imagenReciente.monto) {
        montoImagen = Number(imagenReciente.monto);
        if (montoTexto !== montoImagen) errorMonto = true;
      }

      return NextResponse.json({ 
        message: "Texto guardado", 
        errorMonto, 
        montoImagen, 
        montoTexto 
      });
    }

    return NextResponse.json({ error: "Datos insuficientes" }, { status: 400 });

  } catch (error) {
    console.error("Error en el webhook:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
