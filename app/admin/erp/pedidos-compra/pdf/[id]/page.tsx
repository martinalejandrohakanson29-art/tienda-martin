import React from "react";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";
import PedidoPDFClient from "../pdf-client";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function PedidoCompraPDFPage({ params }: PageProps) {
  const { id } = await params;

  // Verificar autenticación
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/admin/login");
  }

  // Obtener los datos de la compra (pedido)
  const compra = await prisma.compra.findUnique({
    where: { id },
    include: {
      items: true,
    },
  });

  if (!compra) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600">Pedido no encontrado</p>
        </div>
      </div>
    );
  }

  return (
    <PedidoPDFClient
      pedido={{
        id: compra.id,
        proveedor: compra.proveedor,
        comprador: compra.comprador,
        total: Number(compra.total),
        interes: Number(compra.interes),
        descuento: Number(compra.descuento),
        totalFinal: Number(compra.totalFinal),
        metodo_pago: compra.metodo_pago,
        createdAt: compra.createdAt.toISOString(),
        tipoCompra: compra.tipoCompra || "PEDIDO",
        estadoPedido: compra.estadoPedido || "PENDIENTE",
        info: compra.info,
        numeroCompra: compra.numeroCompra || 0,
        items: compra.items.map(item => ({
          productoId: item.productoId,
          nombre: item.nombre,
          cantidad: item.cantidad,
          costo_unit: Number(item.costo_unit),
          subtotal: Number(item.subtotal),
        })),
      }}
    />
  );
}
