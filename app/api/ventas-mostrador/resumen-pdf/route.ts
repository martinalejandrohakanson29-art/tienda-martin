import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const formData = await request.formData();
  const base64 = formData.get("pdf");
  const filenameRaw = formData.get("filename");

  if (typeof base64 !== "string" || !base64) {
    return new NextResponse("Falta el PDF", { status: 400 });
  }

  const filename = (typeof filenameRaw === "string" && filenameRaw.trim()) || "resumen.pdf";
  const buffer = Buffer.from(base64, "base64");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
