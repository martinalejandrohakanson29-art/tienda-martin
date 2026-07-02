import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { obtenerPdf } from "@/lib/resumen-pdf-store";

// Sirve el PDF subido previamente por POST. La URL termina en el nombre de
// archivo para que el navegador lo use aunque ignore el Content-Disposition.
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; filename: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const buffer = obtenerPdf(params.id);
  if (!buffer) {
    return new NextResponse(
      "El PDF expiró. Volvé a generarlo desde el listado de ventas.",
      { status: 404 }
    );
  }

  const filename = decodeURIComponent(params.filename) || "resumen.pdf";
  // El header solo admite ASCII: filename= lleva la versión ASCII y
  // filename* la UTF-8 completa (RFC 5987).
  const filenameAscii = filename.replace(/[^\x20-\x7E]/g, "").replace(/"/g, "") || "resumen.pdf";
  const filenameUtf8 = encodeURIComponent(filename);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filenameAscii}"; filename*=UTF-8''${filenameUtf8}`,
      "Cache-Control": "private, max-age=600",
    },
  });
}
