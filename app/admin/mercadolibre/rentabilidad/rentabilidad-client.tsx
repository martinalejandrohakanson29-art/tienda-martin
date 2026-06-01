"use client";

import { useState, useMemo } from "react";
import RentabilidadTable, { type ProductoRentabilidad } from "./rentabilidad-table";
import OptimizarPreciosButton from "./optimizar-button";
import type { AjustePrecio } from "@/app/actions/ajuste-precios";

export default function RentabilidadClient({
  data,
  ajustes,
}: {
  data: ProductoRentabilidad[];
  ajustes: AjustePrecio[];
}) {
  const qualifyingIds = useMemo(
    () => new Set(ajustes.map((a) => a.item_id)),
    [ajustes]
  );

  // Pre-seleccionar todos los que califican (ganancia > 70%)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(ajustes.map((a) => a.item_id))
  );

  const handleToggle = (itemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
  };

  // Solo los ajustes cuyo item_id está seleccionado
  const ajustesSeleccionados = useMemo(
    () => ajustes.filter((a) => selectedIds.has(a.item_id)),
    [ajustes, selectedIds]
  );

  const headerActions = (
    <OptimizarPreciosButton ajustes={ajustesSeleccionados} />
  );

  return (
    <RentabilidadTable
      data={data}
      selectedIds={selectedIds}
      qualifyingIds={qualifyingIds}
      onToggle={handleToggle}
      headerActions={headerActions}
    />
  );
}
