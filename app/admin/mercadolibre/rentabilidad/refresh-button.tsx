"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { triggerRentabilidadUpdate } from "@/app/actions/rentabilidad";
import { toast } from "sonner"; // Usamos la librería que ya tienes en el proyecto

export default function RefreshButton() {
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    setLoading(true);
    toast.info("Actualizando datos en n8n... por favor espera.");

    try {
      const result = await triggerRentabilidadUpdate();
      if (result.success) {
        toast.success("¡Actualización completada!");
      } else {
        toast.error("Error al conectar con n8n.");
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
      className="bg-amber-600 hover:bg-amber-700 text-white"
    >
      <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      {loading ? "Actualizando..." : "Actualizar Todo"}
    </Button>
  );
}
