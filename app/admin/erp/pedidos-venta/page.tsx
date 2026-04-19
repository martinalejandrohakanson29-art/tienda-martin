import PedidosVentaClient from "./pedidos-venta-client";

export const metadata = {
  title: "Pedidos de Venta - ERP",
  description: "Gestión de pedidos de venta pendientes",
};

export default function PedidosVentaPage() {
  return <PedidosVentaClient />;
}
