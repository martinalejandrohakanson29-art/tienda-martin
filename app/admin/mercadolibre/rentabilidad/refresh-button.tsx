"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { triggerRentabilidadUpdate } from "@/app/actions/rentabilidad";
import { toast } from "sonner"; // Usamos sonner para las notificaciones

export default function RefreshButton() {
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    setLoading(true);
    toast.info("Iniciando actualización en n8n... Esto puede demorar unos segundos.");

    try {
      const result = await triggerRentabilidadUpdate();
      
      if (result.success) {
        toast.success("¡Datos actualizados correctamente!");
      } else {
        toast.error("Hubo un problema al actualizar algunos datos.");
      }
    } catch (error) {
      toast.error("Error de conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button 
      onClick={handleUpdate}
      disabled={loading}
      className="bg-amber-600 hover:bg-amber-700 text-white"
    >
      <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      {loading ? "Actualizando..." : "Actualizar Todo"}
    </Button>
  );
}
