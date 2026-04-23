import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // n8n puede enviar un objeto único o un array
    const items = Array.isArray(body) ? body : [body];
    
    const results = [];
    
    for (const item of items) {
      // Mapeo flexible de campos según lo solicitado
      const razonSocial = item.razonSocial || item.nombre || item["razon social"] || item["nombre"];
      const cuit = item.cuit || item.dni || item["cuit/dni"] || item["cuit"] || item["dni"];
      const nombreFantasia = item.nombreFantasia || item.fantasia || item["nombre de fantasia"];
      const email = item.email || item.mail || item.correo;
      const telefono = item.telefono || item.tel || item.phone;
      
      if (!razonSocial || !cuit) {
        results.push({ 
          status: "skipped", 
          message: "Falta razon social o cuit/dni", 
          provided: { razonSocial, cuit } 
        });
        continue;
      }
      
      const clean = (val: any) => (val === "null" || val === "" || val === undefined) ? null : String(val).trim();
      
      const proveedor = await prisma.proveedor.upsert({
        where: { cuit: String(cuit).trim() },
        update: {
          razonSocial: String(razonSocial).trim(),
          nombreFantasia: clean(nombreFantasia),
          email: clean(email),
          telefono: clean(telefono),
        },
        create: {
          razonSocial: String(razonSocial).trim(),
          cuit: String(cuit).trim(),
          nombreFantasia: clean(nombreFantasia),
          email: clean(email),
          telefono: clean(telefono),
        },
      });
      
      results.push({ status: "success", id: proveedor.id, cuit: proveedor.cuit });
    }

    return NextResponse.json({ 
      message: "Procesado con éxito", 
      count: results.filter(r => r.status === "success").length,
      results 
    });
  } catch (error: any) {
    console.error("Error en webhook proveedores:", error);
    return NextResponse.json({ 
      error: "Error interno del servidor", 
      details: error.message 
    }, { status: 500 });
  }
}
