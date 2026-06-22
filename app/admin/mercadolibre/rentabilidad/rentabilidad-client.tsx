"use client";

import { useState, useMemo } from "react";
import RentabilidadTable, { type ProductoRentabilidad } from "./rentabilidad-table";
import OptimizarPreciosButton from "./optimizar-button";
import type { AjustePrecio } from "@/app/actions/ajuste-precios";
import type { Agregado } from "./agregado-filter";
import { Button } from "@/components/ui/button";
import { CheckSquare, Square } from "lucide-react";

export default function RentabilidadClient({
  data,
  ajustes,
  agregados,
}: {
  data: ProductoRentabilidad[];
  ajustes: AjustePrecio[];
  agregados: Agregado[];
}) {
  const qualifyingIds = useMemo(
    () => new Set(ajustes.map((a) => a.item_id)),
    [ajustes]
  );

  const ajustesMap = useMemo(
    () => new Map(ajustes.map((a) => [a.item_id, a.nuevo_precio])),
    [ajustes]
  );

  const tipoMap = useMemo(
    () => new Map(ajustes.map((a) => [a.item_id, a.tipo])),
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

  const allQualifyingSelected = ajustes.every((a) => selectedIds.has(a.item_id));

  const handleToggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allQualifyingSelected) {
        ajustes.forEach((a) => next.delete(a.item_id));
      } else {
        ajustes.forEach((a) => next.add(a.item_id));
      }
      return next;
    });
  };

  const headerActions = (
    <>
      {ajustes.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggleAll}
          className="h-8 text-xs text-slate-500 hover:text-violet-700 hover:bg-violet-50 gap-1.5"
        >
          {allQualifyingSelected ? (
            <><CheckSquare className="h-3.5 w-3.5 text-violet-600" /> Destildar todos</>
          ) : (
            <><Square className="h-3.5 w-3.5" /> Tildar todos</>
          )}
        </Button>
      )}
      <OptimizarPreciosButton ajustes={ajustesSeleccionados} />
    </>
  );

  return (
    <RentabilidadTable
      data={data}
      selectedIds={selectedIds}
      qualifyingIds={qualifyingIds}
      onToggle={handleToggle}
      headerActions={headerActions}
      ajustesMap={ajustesMap}
      tipoMap={tipoMap}
      agregados={agregados}
    />
  );
}
