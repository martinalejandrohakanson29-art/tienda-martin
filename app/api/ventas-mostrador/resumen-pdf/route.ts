import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { guardarPdf } from "@/lib/resumen-pdf-store";

// Recibe el PDF generado en el cliente y lo guarda unos minutos en memoria.
// Devuelve un id para abrirlo con GET /api/ventas-mostrador/resumen-pdf/{id}/{nombre}:
// el visor de Chrome no conserva el Content-Disposition en navegaciones POST,
// por eso el PDF se sirve siempre desde una URL GET con el nombre incluido.
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const formData = await request.formData();
  const pdf = formData.get("pdf");

  if (!(pdf instanceof Blob) || pdf.size === 0) {
    return new NextResponse("Falta el PDF", { status: 400 });
  }

  const buffer = Buffer.from(await pdf.arrayBuffer());
  const id = guardarPdf(buffer);

  return NextResponse.json({ id });
}
