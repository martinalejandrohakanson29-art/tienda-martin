import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PedidosVentaClient from "./pedidos-venta-client";
import PedidosVentaEdicionClient from "./pedidos-venta-edicion-client";
import PreparacionPedidosClient from "./preparacion-pedidos-client";

export const metadata = {
  title: "Pedidos de Venta - ERP",
  description: "Gestión de pedidos de venta pendientes",
};

export default function PedidosVentaPage({
  searchParams,
}: {
  searchParams: { audit?: string };
}) {
  // Deep-link desde la notificación "Pedido de venta preparado": abre Auditoría.
  const defaultTab = searchParams?.audit ? "auditoria" : "lista";
  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 mb-6 bg-white border border-slate-200">
        <TabsTrigger value="lista" className="hover:bg-slate-100">
          Lista de Pedidos
        </TabsTrigger>
        <TabsTrigger value="edicion" className="hover:bg-slate-100">
          Edición y Registro
        </TabsTrigger>
        <TabsTrigger value="preparacion" className="hover:bg-slate-100">
          Preparación de Pedidos
        </TabsTrigger>
        <TabsTrigger value="auditoria" className="hover:bg-slate-100">
          Auditoría
        </TabsTrigger>
      </TabsList>
      <TabsContent value="lista" className="mt-0">
        <PedidosVentaClient />
      </TabsContent>
      <TabsContent value="edicion" className="mt-0">
        <PedidosVentaEdicionClient />
      </TabsContent>
      <TabsContent value="preparacion" className="mt-0">
        <PreparacionPedidosClient mode="preparacion" />
      </TabsContent>
      <TabsContent value="auditoria" className="mt-0">
        <PreparacionPedidosClient mode="auditoria" />
      </TabsContent>
    </Tabs>
  );
}
