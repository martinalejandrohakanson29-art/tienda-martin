"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";
import { setStockPublicacionML } from "@/app/actions/estado-publicaciones";

interface Props {
  itemId: string;
  userProductId: string | null;
  stock: number;
  editable: boolean;
  onUpdated: (itemId: string, nuevoStock: number) => void;
}

export default function StockDepositoCell({ itemId, userProductId, stock, editable, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(stock));
  const [loading, setLoading] = useState(false);

  const abrirEdicion = () => {
    setValue(String(stock));
    setEditing(true);
  };

  // Solo bloqueado en items 100% Full (sin depósito propio detectado): ahí no existe
  // depósito, todo el stock físico vive en la bodega de ML y hay que despachar mercadería.
  if (!editable) {
    return (
      <span
        className="inline-flex items-center justify-end gap-1 w-full text-slate-500"
        title="Este ítem es 100% Full: no tiene depósito propio, el stock lo administra la bodega de Mercado Libre."
      >
        {stock}
      </span>
    );
  }

  const guardar = async () => {
    if (loading) return;
    const nuevo = Number(value);
    if (!Number.isFinite(nuevo) || nuevo < 0) {
      toast.error("Ingresá un stock válido.");
      return;
    }
    if (nuevo === stock) {
      setEditing(false);
      return;
    }
    setLoading(true);
    const result = await setStockPublicacionML(itemId, userProductId, nuevo);
    setLoading(false);
    if (result.success) {
      onUpdated(itemId, result.available_quantity ?? nuevo);
      setEditing(false);
      toast.success("Stock del depósito actualizado en Mercado Libre.");
    } else {
      toast.error(result.error || "No se pudo actualizar el stock.");
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={abrirEdicion}
        className="inline-flex items-center justify-end gap-1 w-full text-slate-600 hover:text-fuchsia-700 group"
        title="Editar stock del depósito"
      >
        {stock}
        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60" />
      </button>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <input
        type="number"
        min="0"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") guardar();
          if (e.key === "Escape") setEditing(false);
        }}
        onBlur={guardar}
        disabled={loading}
        className="h-6 w-16 text-right text-[11px] px-1 font-bold text-slate-700 border border-slate-200 rounded focus-visible:ring-1 focus-visible:ring-fuchsia-500 bg-white disabled:opacity-50"
      />
      {loading && <Loader2 className="h-3 w-3 animate-spin text-fuchsia-600 shrink-0" />}
    </div>
  );
}
