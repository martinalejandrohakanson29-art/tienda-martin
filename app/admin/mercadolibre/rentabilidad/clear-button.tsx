"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { clearRentabilidadData } from "@/app/actions/rentabilidad";
import { toast } from "sonner";

export default function ClearButton() {
  const [loading, setLoading] = useState(false);

  const handleClear = async () => {
    if (!confirm("¿Borrar todos los datos de la tabla? Necesitarás actualizar después.")) return;
    setLoading(true);
    try {
      const result = await clearRentabilidadData();
      if (result.success) {
        toast.success("Tabla limpiada. Ahora hacé clic en Actualizar Todo.");
      } else {
        toast.error("Error al limpiar la tabla.");
      }
    } catch {
      toast.error("Error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleClear}
      disabled={loading}
      variant="outline"
      className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
    >
      <Trash2 className={`mr-2 h-4 w-4 ${loading ? "animate-pulse" : ""}`} />
      {loading ? "Borrando..." : "Borrar Tabla"}
    </Button>
  );
}
