"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { setEstadoPublicacionML } from "@/app/actions/estado-publicaciones";

interface Props {
  itemId: string;
  status: string;
  onUpdated: (itemId: string, nuevoEstado: string) => void;
}

export default function EstadoToggleButton({ itemId, status, onUpdated }: Props) {
  const [loading, setLoading] = useState(false);

  if (status !== "active" && status !== "paused") return null;

  const esActiva = status === "active";
  const accion = esActiva ? "paused" : "active";

  const handleClick = async () => {
    setLoading(true);
    try {
      const result = await setEstadoPublicacionML(itemId, accion);
      if (result.success) {
        onUpdated(itemId, result.status || accion);
        toast.success(esActiva ? "Publicación pausada." : "Publicación activada.");
      } else {
        toast.error(result.error || "No se pudo cambiar el estado en Mercado Libre.");
      }
    } catch {
      toast.error("Hubo un error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={cn(
        "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[10px] font-bold uppercase disabled:opacity-50",
        esActiva
          ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
          : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
      )}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : esActiva ? (
        <Pause className="h-3 w-3" />
      ) : (
        <Play className="h-3 w-3" />
      )}
      {esActiva ? "Pausar" : "Activar"}
    </button>
  );
}
