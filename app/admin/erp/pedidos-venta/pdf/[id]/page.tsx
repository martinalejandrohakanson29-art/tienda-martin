import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";
import PedidoPDFClient from "../pdf-client";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function PedidoPDFPage({ params }: PageProps) {
  const { id } = await params;

  // Verificar autenticación
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/admin/login");
  }

  // Obtener los datos del pedido
  const pedido = await prisma.venta.findUnique({
    where: { id },
    include: {
      items: true,
    },
  });

  if (!pedido) {
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
        id: pedido.id,
        cliente: pedido.cliente,
        vendedor: pedido.vendedor,
        total: Number(pedido.total),
        interes: Number(pedido.interes),
        totalFinal: Number(pedido.totalFinal),
        metodo_pago: pedido.metodo_pago,
        createdAt: pedido.createdAt.toISOString(),
        tipoVenta: pedido.tipoVenta || "PEDIDO",
        estadoPedido: pedido.estadoPedido || "PENDIENTE",
        dni: pedido.dni,
        telefono: pedido.telefono,
        email: pedido.email,
        info: pedido.info,
        cupon: pedido.cupon,
        transaccionId: pedido.transaccionId,
        de: pedido.de,
        para: pedido.para,
        eventoOffline: pedido.eventoOffline,
        puntoVentaId: pedido.puntoVentaId,
        numeroVenta: pedido.numeroVenta,
        items: pedido.items.map(item => ({
          productoId: item.productoId,
          nombre: item.nombre,
          cantidad: item.cantidad,
          precio_unit: Number(item.precio_unit),
          subtotal: Number(item.subtotal),
          esNota: item.esNota,
        })),
      }}
    />
  );
}
