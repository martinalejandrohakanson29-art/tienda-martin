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
          if (item[f] !== undefined && item[f] !== null) return item[f];
          // Probar versión en minúsculas y sin espacios extras
          const normalizedKey = Object.keys(item).find(k => k.trim().toLowerCase() === f.toLowerCase());
          if (normalizedKey && item[normalizedKey] !== null) return item[normalizedKey];
        }
        return undefined;
      };

      // Mapeo flexible de campos
      const razonSocial = getVal(["razonSocial", "nombre", "razon social", "Cliente/Proveedor", "Cliente"]);
      const cuit = getVal(["cuit", "dni", "cuit/dni", "CUIT"]);
      const nombreFantasia = getVal(["nombreFantasia", "fantasia", "nombre de fantasia"]);
      const email = getVal(["email", "mail", "correo"]);
      const telefono = getVal(["telefono", "tel", "phone", "Telefono"]);
      const celular = getVal(["celular", "cel", "Celular"]);

      // Validación: Solo la Razón Social es estrictamente necesaria
      if (!razonSocial || String(razonSocial).trim() === "") {
        results.push({
          status: "skipped",
          message: "Falta razon social",
          provided: { razonSocial, cuit }
        });
        continue;
      }

      // Normalización de Razón Social
      const razonSocialValue = String(razonSocial).trim();

      // Normalización de CUIT: Si es vacío, debe ser null para no romper el @unique en la DB
      const cuitRaw = String(cuit || "").trim();
      const cuitValue = (cuitRaw === "" || cuitRaw.toLowerCase() === "null") ? null : cuitRaw;

      // Función de limpieza para strings opcionales
      const clean = (val: any) => {
        const s = String(val || "").trim();
        return (s === "" || s.toLowerCase() === "null") ? null : s;
      };

      // Datos de cuenta corriente (parseo de números)
      const parseDecimal = (val: any) => {
        const originalVal = val;
        if (val === undefined || val === null || val === "") return 0;
        if (typeof val === 'number') return val;

        let cleanVal = String(val).trim();

        // Formato ES/AR: punto miles y coma decimal
        if (cleanVal.includes(",") && cleanVal.includes(".")) {
          cleanVal = cleanVal.replace(/\./g, "").replace(",", ".");
        }
        else if (cleanVal.includes(",")) {
          cleanVal = cleanVal.replace(",", ".");
        }

        cleanVal = cleanVal.replace(/[^0-9.-]/g, "");
        const parsed = parseFloat(cleanVal);
        return isNaN(parsed) ? 0 : parsed;
      };

      const saldoAnterior = parseDecimal(getVal(["saldoAnterior", "S. Anterior", "Anterior", "Saldo Anterior"]));
      const saldoVencido = parseDecimal(getVal(["saldoVencido", "S. Vencido", "Vencido", "Saldo Vencido"]));
      const dias15 = parseDecimal(getVal(["dias15", "15 dias", "15_dias", "15 días"]));
      const dias30 = parseDecimal(getVal(["dias30", "30 dias", "30_dias", "30 días"]));
      const dias45 = parseDecimal(getVal(["dias45", "45 dias", "45_dias", "45 días"]));
      const dias60 = parseDecimal(getVal(["dias60", "60 dias", "60_dias", "60 días"]));
      const mas60 = parseDecimal(getVal(["mas60", "+ 60 dias", "mas 60", "más 60 días"]));
      const total = parseDecimal(getVal(["total", "Total", "Saldo Total", "Saldo"]));

      console.log(`Procesando: ${razonSocialValue}, CUIT: ${cuitValue || 'N/A'}`);

      // Búsqueda de proveedor existente
      let proveedorExistente = null;

      // 1. Intentar por CUIT si existe
      if (cuitValue) {
        proveedorExistente = await prisma.proveedor.findUnique({
          where: { cuit: cuitValue }
        });
      }

      // 2. Fallback por Razón Social (si no hay CUIT o no se encontró)
      if (!proveedorExistente) {
        proveedorExistente = await prisma.proveedor.findFirst({
          where: { razonSocial: razonSocialValue }
        });
      }

      const dataPayload = {
        razonSocial: razonSocialValue,
        cuit: cuitValue,
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
      };

      let proveedor;
      if (proveedorExistente) {
        proveedor = await prisma.proveedor.update({
          where: { id: proveedorExistente.id },
          data: dataPayload
        });
      } else {
        proveedor = await prisma.proveedor.create({
          data: dataPayload
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