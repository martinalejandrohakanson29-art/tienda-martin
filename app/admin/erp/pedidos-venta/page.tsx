import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PedidosVentaClient from "./pedidos-venta-client";
import PedidosVentaEdicionClient from "./pedidos-venta-edicion-client";

export const metadata = {
  title: "Pedidos de Venta - ERP",
  description: "Gestión de pedidos de venta pendientes",
};

export default function PedidosVentaPage() {
  return (
    <Tabs defaultValue="lista" className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-6 bg-white border border-slate-200">
        <TabsTrigger value="lista" className="hover:bg-slate-100">
          Lista de Pedidos
        </TabsTrigger>
        <TabsTrigger value="edicion" className="hover:bg-slate-100">
          Edición y Registro
        </TabsTrigger>
      </TabsList>
      <TabsContent value="lista" className="mt-0">
        <PedidosVentaClient />
      </TabsContent>
      <TabsContent value="edicion" className="mt-0">
        <PedidosVentaEdicionClient />
      </TabsContent>
    </Tabs>
  );
}
