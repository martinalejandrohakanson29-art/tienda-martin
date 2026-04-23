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
      const razonSocial = item.razonSocial || item.nombre || item["razon social"] || item["nombre"] || item["Cliente/Proveedor"];
      const cuit = item.cuit || item.dni || item["cuit/dni"] || item["cuit"] || item["dni"] || item["CUIT"];
      const nombreFantasia = item.nombreFantasia || item.fantasia || item["nombre de fantasia"];
      const email = item.email || item.mail || item.correo;
      const telefono = item.telefono || item.tel || item.phone || item["Telefono"];
      const celular = item.celular || item.cel || item["Celular"];
      
      // Datos de cuenta corriente
      const parseDecimal = (val: any) => {
        if (val === undefined || val === null || val === "") return 0;
        if (typeof val === 'number') return val;
        
        let cleanVal = String(val).trim();
        
        // Si tiene coma y punto, asumimos punto miles y coma decimal (estilo ES/AR)
        if (cleanVal.includes(",") && cleanVal.includes(".")) {
          cleanVal = cleanVal.replace(/\./g, "").replace(",", ".");
        } 
        // Si solo tiene coma, asumimos que es el decimal
        else if (cleanVal.includes(",")) {
          cleanVal = cleanVal.replace(",", ".");
        }
        // Si solo tiene punto, pero parece ser miles (ej: 1.000), es difícil saber.
        // Pero usualmente los datos de contabilidad traen coma para decimales.
        // Si no tiene coma, dejamos el punto como está (asumimos decimal estándar)
        
        // Eliminar símbolos de moneda
        cleanVal = cleanVal.replace(/[$\s]/g, "");
        
        const parsed = parseFloat(cleanVal);
        return isNaN(parsed) ? 0 : parsed;
      };

      const saldoAnterior = parseDecimal(item.saldoAnterior || item["S. Anterior"]);
      const saldoVencido = parseDecimal(item.saldoVencido || item["S. Vencido"]);
      const dias15 = parseDecimal(item.dias15 || item["15 dias"]);
      const dias30 = parseDecimal(item.dias30 || item["30 dias"]);
      const dias45 = parseDecimal(item.dias45 || item["45 dias"]);
      const dias60 = parseDecimal(item.dias60 || item["60 dias"]);
      const mas60 = parseDecimal(item.mas60 || item["+ 60 dias"]);
      const total = parseDecimal(item.total || item["Total"]);

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
          celular: clean(celular),
          saldoAnterior,
          saldoVencido,
          dias15,
          dias30,
          dias45,
          dias60,
          mas60,
          total
        },
        create: {
          razonSocial: String(razonSocial).trim(),
          cuit: String(cuit).trim(),
          nombreFantasia: clean(nombreFantasia),
          email: clean(email),
          telefono: clean(telefono),
          celular: clean(celular),
          saldoAnterior,
          saldoVencido,
          dias15,
          dias30,
          dias45,
          dias60,
          mas60,
          total
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
