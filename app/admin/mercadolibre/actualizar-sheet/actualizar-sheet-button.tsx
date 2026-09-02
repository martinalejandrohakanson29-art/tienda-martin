"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { triggerActualizarSheetComparador } from "@/app/actions/costos";
import { toast } from "sonner";

export default function ActualizarSheetButton() {
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    setLoading(true);
    toast.info("Enviando costos a n8n para actualizar el Sheet...");

    try {
      const result = await triggerActualizarSheetComparador();
      if (result.success) {
        toast.success(`¡Sheet actualizado! Se enviaron ${result.total} MLA.`);
      } else {
        toast.error(result.error || "Error al conectar con n8n.");
      }
    } catch (error) {
      toast.error("Hubo un error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleUpdate}
      disabled={loading}
      className="w-full bg-lime-600 hover:bg-lime-700 text-white gap-1.5 shadow-sm h-9 text-sm font-semibold"
    >
      <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      {loading ? "Actualizando..." : "Actualizar Sheet"}
    </Button>
  );
}
