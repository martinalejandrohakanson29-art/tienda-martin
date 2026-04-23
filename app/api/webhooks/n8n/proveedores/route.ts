import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // n8n puede enviar un objeto único o un array
    const items = Array.isArray(body) ? body : [body];
    
    const results = [];
    
    for (const item of items) {
      // Función para buscar valor por múltiples posibles nombres de campos
      const getVal = (fields: string[]) => {
        for (const f of fields) {
          if (item[f] !== undefined) return item[f];
          // Probar versión en minúsculas y sin espacios extras
          const normalizedKey = Object.keys(item).find(k => k.trim().toLowerCase() === f.toLowerCase());
          if (normalizedKey) return item[normalizedKey];
        }
        return undefined;
      };

      // Mapeo flexible de campos según lo solicitado
      const razonSocial = getVal(["razonSocial", "nombre", "razon social", "Cliente/Proveedor", "Cliente"]);
      const cuit = getVal(["cuit", "dni", "cuit/dni", "CUIT"]);
      const nombreFantasia = getVal(["nombreFantasia", "fantasia", "nombre de fantasia"]);
      const email = getVal(["email", "mail", "correo"]);
      const telefono = getVal(["telefono", "tel", "phone", "Telefono"]);
      const celular = getVal(["celular", "cel", "Celular"]);
      
      // Datos de cuenta corriente
      const parseDecimal = (val: any) => {
        const originalVal = val;
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
        
        // Eliminar todo lo que no sea número, punto o signo menos
        cleanVal = cleanVal.replace(/[^0-9.-]/g, "");
        
        const parsed = parseFloat(cleanVal);
        const result = isNaN(parsed) ? 0 : parsed;
        
        if (result === 0 && originalVal !== 0 && originalVal !== "0") {
          console.log(`[parseDecimal] OJO: '${originalVal}' se parseó como 0. Clean: '${cleanVal}'`);
        }
        
        return result;
      };

      const saldoAnterior = parseDecimal(getVal(["saldoAnterior", "S. Anterior", "Anterior", "Saldo Anterior"]));
      const saldoVencido = parseDecimal(getVal(["saldoVencido", "S. Vencido", "Vencido", "Saldo Vencido"]));
      const dias15 = parseDecimal(getVal(["dias15", "15 dias", "15_dias", "15 días"]));
      const dias30 = parseDecimal(getVal(["dias30", "30 dias", "30_dias", "30 días"]));
      const dias45 = parseDecimal(getVal(["dias45", "45 dias", "45_dias", "45 días"]));
      const dias60 = parseDecimal(getVal(["dias60", "60 dias", "60_dias", "60 días"]));
      const mas60 = parseDecimal(getVal(["mas60", "+ 60 dias", "mas 60", "más 60 días"]));
      const total = parseDecimal(getVal(["total", "Total", "Saldo Total", "Saldo"]));

      if (!razonSocial) {
        results.push({ 
          status: "skipped", 
          message: "Falta razon social", 
          provided: { razonSocial } 
        });
        continue;
      }
      
      const clean = (val: any) => (val === "null" || val === "" || val === undefined) ? null : String(val).trim();
      const cuitValue = cuit ? String(cuit).trim() : null;
      const razonSocialValue = String(razonSocial).trim();

      console.log(`Mapeando item: ${razonSocialValue}, CUIT: ${cuitValue}, Total: ${total}`);

      // Intentamos encontrar el proveedor existente
      let proveedorExistente = null;

      if (cuitValue) {
        proveedorExistente = await prisma.proveedor.findUnique({
          where: { cuit: cuitValue }
        });
      }

      if (!proveedorExistente) {
        // Fallback por nombre si no hay CUIT o no se encontró por CUIT
        proveedorExistente = await prisma.proveedor.findFirst({
          where: { razonSocial: razonSocialValue }
        });
      }

      let proveedor;
      const dataUpdate = {
        razonSocial: razonSocialValue,
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
        total,
        cuit: cuitValue // Actualizar CUIT si se provee ahora
      };

      if (proveedorExistente) {
        proveedor = await prisma.proveedor.update({
          where: { id: proveedorExistente.id },
          data: dataUpdate
        });
      } else {
        proveedor = await prisma.proveedor.create({
          data: dataUpdate
        });
      }
      
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
