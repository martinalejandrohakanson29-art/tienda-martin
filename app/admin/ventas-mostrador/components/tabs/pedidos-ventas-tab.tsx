"use client";

import React from "react";
import PedidosVentaEdicionClient from "@/app/admin/erp/pedidos-venta/pedidos-venta-edicion-client";

interface Props {
  pedidosRefreshKey: number;
  onEditarPedido: (pedido: any) => void;
}

export function PedidosVentasTab({ pedidosRefreshKey, onEditarPedido }: Props) {
  return (
    <div className="flex-grow overflow-auto h-full bg-white">
      <PedidosVentaEdicionClient
        key={pedidosRefreshKey}
        onEditarPedido={onEditarPedido}
      />
    </div>
  );
}
