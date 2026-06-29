import { obtenerPuntosVenta } from "@/app/actions/puntos-venta";
import MetricasClient from "./metricas-client";

export const metadata = {
  title: "Métricas de Ventas - Revolución Motos",
};

export default async function MetricasPage() {
  const { data: puntosVenta = [] } = await obtenerPuntosVenta();

  return <MetricasClient puntosVenta={puntosVenta} />;
}
