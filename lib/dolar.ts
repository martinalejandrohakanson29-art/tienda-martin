// Cotización del dólar oficial (venta) vía DolarAPI (dolarapi.com) — gratis, sin key.
// Se actualiza como máximo una vez por hora, y solo dentro del horario hábil
// argentino (8 a 15 hs), que es cuando el valor puede moverse en el día. Fuera
// de ese rango se sigue sirviendo el último valor conocido sin pegarle a la API.
// Mismo patrón de "último resultado bueno" en memoria que obtenerIPCMensual
// (app/actions/inflacion.ts) y el store de PDFs: asume proceso único.
import { recalcularCostosPorDolar } from "@/lib/recalcular-costos-dolar";

const URL_DOLAR_OFICIAL = "https://dolarapi.com/v1/dolares/oficial";
const UNA_HORA_MS = 60 * 60 * 1000;

export type CotizacionDolar = { valor: number; fecha: string };

let ultimaBuena: CotizacionDolar | null = null;
let ultimoFetchTs = 0;

function horaHabilArgentina(): boolean {
  const horaAR = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "numeric",
      hour12: false,
    }).format(new Date())
  );
  return horaAR >= 8 && horaAR < 15;
}

export async function getCotizacionDolarVenta(): Promise<CotizacionDolar | null> {
  const ahora = Date.now();
  const necesitaActualizar = !ultimaBuena || (horaHabilArgentina() && ahora - ultimoFetchTs > UNA_HORA_MS);

  if (necesitaActualizar) {
    try {
      const res = await fetch(URL_DOLAR_OFICIAL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (typeof json?.venta !== "number") throw new Error("respuesta sin campo 'venta'");
      ultimaBuena = { valor: json.venta, fecha: json.fechaActualizacion ?? new Date().toISOString() };
      ultimoFetchTs = ahora;
      // Se espera para asegurar que corra completo antes de que termine el request
      // (en serverless, una promesa "fire and forget" puede quedar cortada).
      await recalcularCostosPorDolar(json.venta);
    } catch (e) {
      console.error("getCotizacionDolarVenta:", e);
      // Si falla y ya teníamos un valor previo, lo seguimos sirviendo.
    }
  }

  return ultimaBuena;
}
