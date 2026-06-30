// Genera lib/metricas/ventas-historicas-data.ts a partir del CSV exportado del
// sistema viejo (n8n-workflows/resumen_cuentas_ingreso.csv).
//
// Reglas de normalización (definidas con el usuario):
//  - Canales canónicos: MercadoLibre, Mostrador, Instagram, Mayorista
//  - Se DESCARTA cualquier otra cuenta (WhatsApp, NOTA CREDITO, MAYORISTA COSTO,
//    FLETE, S/D, CUENTA UNICA, CHINA MAYORISTA, etc.): no entran en el panel
//  - Se descartan meses cuyo total quede <= 0 (ej: export roto de mayo 2026)
//
// Uso:  node scripts/generar-historico.mjs
// (volver a correr cuando se actualice el CSV)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CSV_PATH = path.join(ROOT, "n8n-workflows", "resumen_cuentas_ingreso.csv");
const OUT_PATH = path.join(ROOT, "lib", "metricas", "ventas-historicas-data.ts");

// Mapeo de cuenta del CSV -> canal canónico. Devuelve null si no es uno de los
// 4 canales del panel (esas filas se descartan).
function normalizarCanal(cuenta) {
  const c = cuenta.trim().toUpperCase();
  if (c === "MERCADO LIBRE" || c === "MERCADOLIBRE") return "MercadoLibre";
  if (c === "MOSTRADOR") return "Mostrador";
  if (c === "INSTAGRAM") return "Instagram";
  if (c === "MAYORISTA") return "Mayorista";
  return null;
}

// Parser CSV simple para este formato: separador ';', campos con comillas dobles.
function parseLinea(linea) {
  const campos = [];
  let actual = "";
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (ch === '"') {
      enComillas = !enComillas;
    } else if (ch === ";" && !enComillas) {
      campos.push(actual);
      actual = "";
    } else {
      actual += ch;
    }
  }
  campos.push(actual);
  return campos.map((s) => s.trim());
}

const raw = fs.readFileSync(CSV_PATH, "utf8");
const lineas = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
const header = parseLinea(lineas[0]);

const idx = {
  anio: header.indexOf("Año"),
  nroMes: header.indexOf("Nro_Mes"),
  cuenta: header.indexOf("Cuenta_de_Ingreso"),
  importe: header.indexOf("Importe_Numerico"),
};

// Acumulador: clave "anio-mes" -> { anio, mes, canales: { canal: importe } }
const meses = new Map();

for (let i = 1; i < lineas.length; i++) {
  const campos = parseLinea(lineas[i]);
  const anio = parseInt(campos[idx.anio], 10);
  const mes = parseInt(campos[idx.nroMes], 10);
  const cuenta = campos[idx.cuenta];
  const importe = parseFloat(campos[idx.importe]);

  if (!Number.isFinite(anio) || !Number.isFinite(mes) || !Number.isFinite(importe)) continue;

  const canal = normalizarCanal(cuenta);
  if (canal === null) continue; // cuenta fuera del panel (WhatsApp, contables, S/D, etc.)
  const clave = `${anio}-${mes}`;
  if (!meses.has(clave)) meses.set(clave, { anio, mes, canales: {} });
  const reg = meses.get(clave);
  reg.canales[canal] = (reg.canales[canal] || 0) + importe;
}

// Filtrar meses con total <= 0 y ordenar cronológicamente
const filas = [...meses.values()]
  .map((m) => ({
    ...m,
    total: Object.values(m.canales).reduce((a, b) => a + b, 0),
  }))
  .filter((m) => m.total > 0)
  .sort((a, b) => (a.anio - b.anio) || (a.mes - b.mes));

// Redondear importes a 2 decimales
for (const f of filas) {
  for (const k of Object.keys(f.canales)) {
    f.canales[k] = Math.round(f.canales[k] * 100) / 100;
  }
  delete f.total;
}

const ts = `// ARCHIVO GENERADO AUTOMÁTICAMENTE — no editar a mano.
// Fuente: n8n-workflows/resumen_cuentas_ingreso.csv (export del sistema viejo).
// Regenerar con:  node scripts/generar-historico.mjs
//
// Datos de ventas mensuales por canal, meses cerrados (inmutables).
// Importes en pesos NOMINALES de cada mes (ojo inflación al comparar montos).

export interface MesHistorico {
  anio: number;
  mes: number; // 1-12
  /** importe por canal canónico, en pesos nominales del mes */
  canales: Record<string, number>;
}

export const VENTAS_HISTORICAS: MesHistorico[] = ${JSON.stringify(filas, null, 2)};
`;

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, ts, "utf8");

console.log(`OK: ${filas.length} meses escritos en ${path.relative(ROOT, OUT_PATH)}`);
console.log(`Rango: ${filas[0].anio}-${filas[0].mes} a ${filas[filas.length - 1].anio}-${filas[filas.length - 1].mes}`);
