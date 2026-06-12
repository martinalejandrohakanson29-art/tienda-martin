"use server"

import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

// ── Tipos públicos ─────────────────────────────────────────────────────────────

export type RegistroArca = {
  cae: string;
  fecha: string;
  tipo: number;
  puntoVenta: number;
  numero: number;
  total: number;
  docNro: string;
  denominacion: string;
};

export type VentaDB = {
  id: string;
  numeroVenta: number | null;
  cliente: string;
  cae: string;
  totalFinal: number;
  tipoComprobante: number | null;
  facturaNumero: number | null;
  createdAt: string;
  docNro: string | null;
  fuente: "venta" | "comprobante";
  ventaId: string | null;
};

export type FilaConciliacion =
  | { tipo: "match_ok";           arca: RegistroArca; db: VentaDB; diffMonto: number }
  | { tipo: "discrepancia_monto"; arca: RegistroArca; db: VentaDB; diffMonto: number }
  | { tipo: "solo_arca";          arca: RegistroArca }
  | { tipo: "solo_bd";            db: VentaDB };

export type ResultadoConciliacion = {
  filas: FilaConciliacion[];
  stats: {
    totalArca: number;
    totalDB: number;
    matchOk: number;
    discrepancias: number;
    soloArca: number;
    soloDB: number;
  };
  periodoArca: { desde: string; hasta: string };
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<number, string> = {
  1: "Factura A", 3: "NC A", 6: "Factura B", 8: "NC B", 11: "Factura C", 13: "NC C",
};

const TOLERANCIA_PESOS = 2; // diferencia máxima aceptable por redondeo

// ── Server Action principal ────────────────────────────────────────────────────

export async function conciliarConArca(
  formData: FormData
): Promise<{ success: true; resultado: ResultadoConciliacion } | { success: false; error: string }> {
  try {
    const file = formData.get("file") as File | null;
    if (!file) return { success: false, error: "No se recibió ningún archivo." };

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext ?? ""))
      return { success: false, error: "El archivo debe ser .xlsx, .xls o .csv" };

    // 1. Parsear XLSX ─────────────────────────────────────────────────────────
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

    // Saltar cabecera
    const registrosArca: RegistroArca[] = rows
      .slice(1)
      .filter((r) => r && r[5]) // debe tener CAE
      .map((r) => {
        const rawFecha = r[0];
        let fechaStr: string;
        if (rawFecha instanceof Date) {
          fechaStr = rawFecha.toISOString().split("T")[0];
        } else if (typeof rawFecha === "number") {
          // Excel serial date
          const d = XLSX.SSF.parse_date_code(rawFecha);
          fechaStr = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
        } else {
          fechaStr = String(rawFecha ?? "").split("T")[0];
        }

        return {
          cae: String(r[5]).trim(),
          fecha: fechaStr,
          tipo: Number(r[1]) || 0,
          puntoVenta: Number(r[2]) || 0,
          numero: Number(r[3]) || 0,
          total: Number(r[15]) || 0,
          docNro: String(r[7] ?? "").trim(),
          denominacion: String(r[8] ?? "").trim(),
        };
      });

    if (registrosArca.length === 0)
      return { success: false, error: "El archivo no contiene comprobantes válidos." };

    // 2. Obtener registros de BD ───────────────────────────────────────────────
    const [ventas, comprobantes] = await Promise.all([
      prisma.venta.findMany({
        where: { cae: { not: null } },
        select: {
          id: true, numeroVenta: true, cliente: true, cae: true,
          totalFinal: true, tipoComprobante: true, facturaNumero: true,
          createdAt: true, docNro: true,
        },
      }),
      prisma.comprobante.findMany({
        select: {
          id: true, cae: true, tipo: true, numero: true, puntoVenta: true,
          total: true, docNro: true, cliente: true, createdAt: true,
          ventaId: true,
          venta: { select: { numeroVenta: true } },
        },
      }),
    ]);

    // Construir mapa CAE → VentaDB (ventas primero, comprobantes completan)
    const mapDB = new Map<string, VentaDB>();

    for (const v of ventas) {
      const cae = v.cae!.trim();
      mapDB.set(cae, {
        id: v.id,
        numeroVenta: v.numeroVenta,
        cliente: v.cliente,
        cae,
        totalFinal: Number(v.totalFinal),
        tipoComprobante: v.tipoComprobante,
        facturaNumero: v.facturaNumero,
        createdAt: v.createdAt.toISOString().split("T")[0],
        docNro: v.docNro ?? null,
        fuente: "venta",
        ventaId: v.id,
      });
    }

    for (const c of comprobantes) {
      const cae = c.cae.trim();
      if (!mapDB.has(cae)) {
        mapDB.set(cae, {
          id: c.id,
          numeroVenta: c.venta?.numeroVenta ?? null,
          cliente: c.cliente ?? "",
          cae,
          totalFinal: Number(c.total),
          tipoComprobante: c.tipo,
          facturaNumero: c.numero,
          createdAt: c.createdAt.toISOString().split("T")[0],
          docNro: c.docNro ?? null,
          fuente: "comprobante",
          ventaId: c.ventaId,
        });
      }
    }

    // 3. Cruzar datos ──────────────────────────────────────────────────────────
    const filas: FilaConciliacion[] = [];
    const caesBD = new Set(mapDB.keys());

    for (const arca of registrosArca) {
      if (mapDB.has(arca.cae)) {
        const db = mapDB.get(arca.cae)!;
        const diff = Math.abs(arca.total - db.totalFinal);
        caesBD.delete(arca.cae); // marcado como encontrado
        if (diff <= TOLERANCIA_PESOS) {
          filas.push({ tipo: "match_ok", arca, db, diffMonto: diff });
        } else {
          filas.push({ tipo: "discrepancia_monto", arca, db, diffMonto: diff });
        }
      } else {
        filas.push({ tipo: "solo_arca", arca });
      }
    }

    // Los que quedaron en caesBD no estuvieron en el archivo de ARCA
    caesBD.forEach((cae) => {
      filas.push({ tipo: "solo_bd", db: mapDB.get(cae)! });
    });

    // 4. Período del archivo ───────────────────────────────────────────────────
    const fechas = registrosArca.map((r) => r.fecha).sort();

    return {
      success: true,
      resultado: {
        filas,
        stats: {
          totalArca: registrosArca.length,
          totalDB: mapDB.size,
          matchOk: filas.filter((f) => f.tipo === "match_ok").length,
          discrepancias: filas.filter((f) => f.tipo === "discrepancia_monto").length,
          soloArca: filas.filter((f) => f.tipo === "solo_arca").length,
          soloDB: filas.filter((f) => f.tipo === "solo_bd").length,
        },
        periodoArca: { desde: fechas[0], hasta: fechas[fechas.length - 1] },
      },
    };
  } catch (err: any) {
    console.error("[CONCILIACION-ARCA]", err);
    return { success: false, error: err.message ?? "Error interno al conciliar." };
  }
}

export { TIPO_LABEL };
